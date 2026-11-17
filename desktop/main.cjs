// SpaceFront desktop app (Electron main process).
//
// Wraps the built web client (../dist, copied to ./web by `npm run build:web`)
// and gives it what the browser can't: saves as real files in the user's data
// folder, and later Steam (see ../docs/STEAM.md). The page talks to this
// process only through the bridge in preload.cjs.
"use strict";

const { app, BrowserWindow, ipcMain, net, protocol, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const steam = require("./steam.cjs");

// Fixes the user data folder name (…/SpaceFront), where saves live and Steam Cloud looks.
app.setName("SpaceFront");

const SCHEME = "app";
const HOST = "spacefront";
const WEB_ROOT = path.join(__dirname, "web");

// The game is served from app://spacefront/ instead of file://, so its
// absolute asset paths, module workers and fetch() of map files work as on
// the web.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

/** Where saves and replays live: <user data>/files/… (Steam Auto-Cloud can sync this folder). */
function filesRoot() {
  return path.join(app.getPath("userData"), "files");
}

/**
 * Turns a game file name ("saves/123.bin") into a path inside filesRoot().
 * Names come from the page, so anything that could leave the folder is refused.
 */
function filePath(name) {
  if (typeof name !== "string" || !/^[A-Za-z0-9_\-./]{1,200}$/.test(name) || name.includes("..")) {
    throw new Error(`Bad file name: ${String(name)}`);
  }
  const full = path.resolve(filesRoot(), name);
  if (!full.startsWith(path.resolve(filesRoot()) + path.sep)) throw new Error("Bad file name");
  return full;
}

/** Every file under `dir`, as names relative to filesRoot() with forward slashes. */
async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out; // no folder yet: nothing saved
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function registerFileHandlers() {
  ipcMain.handle("sf:saveFile", async (_event, name, data) => {
    const target = filePath(name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write to a temporary file first, so a crash never leaves half a save.
    const temp = `${target}.tmp`;
    await fs.writeFile(temp, Buffer.from(data));
    await fs.rename(temp, target);
  });

  ipcMain.handle("sf:loadFile", async (_event, name) => {
    try {
      return new Uint8Array(await fs.readFile(filePath(name)));
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      throw error;
    }
  });

  ipcMain.handle("sf:listFiles", async (_event, prefix) => {
    if (typeof prefix !== "string") throw new Error("Bad prefix");
    const root = filesRoot();
    const files = await walk(root);
    const out = [];
    for (const full of files) {
      const name = path.relative(root, full).split(path.sep).join("/");
      if (!name.startsWith(prefix) || name.endsWith(".tmp")) continue;
      const stat = await fs.stat(full);
      out.push({ name, size: stat.size, modified: stat.mtimeMs });
    }
    return out;
  });

  ipcMain.handle("sf:deleteFile", async (_event, name) => {
    await fs.rm(filePath(name), { force: true });
  });

  ipcMain.on("sf:achievement", (_event, id) => {
    if (typeof id === "string") steam.unlockAchievement(id);
  });

  ipcMain.on("sf:steamInfo", (event) => {
    event.returnValue = { available: steam.available(), cloudSaves: steam.cloudSaves() };
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#05060f",
    title: "SpaceFront",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Links to the web (e.g. in credits) open in the system browser, never in the game window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}/`)) event.preventDefault();
  });
  void win.loadURL(`${SCHEME}://${HOST}/index.html`);
  return win;
}

app.whenReady().then(() => {
  // Serves the built game from ./web; refuses anything outside it.
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const full = path.resolve(WEB_ROOT, rel);
    if (url.host !== HOST || !full.startsWith(WEB_ROOT + path.sep)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(full).toString());
  });
  steam.init();
  registerFileHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  steam.shutdown();
  if (process.platform !== "darwin") app.quit();
});

// Copies the built web client (../dist from `npm run build` in the root)
// into desktop/web, where the Electron app serves it from.
import { cpSync, existsSync, rmSync } from "node:fs";

const from = new URL("../../dist/", import.meta.url);
const to = new URL("../web/", import.meta.url);

if (!existsSync(new URL("index.html", from))) {
  console.error("No web build in dist/. Run `npm run build` in the project root first.");
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
// Source maps stay out of the shipped game.
cpSync(from, to, { recursive: true, filter: (src) => !src.endsWith(".map") });
console.log("Copied dist/ to desktop/web/");

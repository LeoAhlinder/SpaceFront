import type { FileInfo, Platform } from "./platform";

const DB_NAME = "spacefront";
const STORE = "files";

interface StoredFile {
  readonly data: Uint8Array;
  readonly modified: number;
}

/**
 * The browser platform: files live in IndexedDB (one object store, keyed by
 * file name). No achievements or cloud saves.
 */
export function createWebPlatform(): Platform {
  let db: Promise<IDBDatabase> | null = null;
  const open = () => (db ??= openDb());

  const run = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) => {
    const tx = (await open()).transaction(STORE, mode);
    return request(fn(tx.objectStore(STORE)));
  };

  return {
    kind: "web",
    cloudSaves: false,
    saveFile: async (name, data) => {
      const file: StoredFile = { data, modified: Date.now() };
      await run("readwrite", (s) => s.put(file, name));
    },
    loadFile: async (name) => {
      const file = (await run("readonly", (s) => s.get(name))) as StoredFile | undefined;
      return file ? file.data : null;
    },
    listFiles: async (prefix) => {
      // Every key that starts with the prefix sorts below prefix + U+FFFF.
      const range = IDBKeyRange.bound(prefix, prefix + String.fromCharCode(0xffff));
      const tx = (await open()).transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const [keys, files] = await Promise.all([
        request(store.getAllKeys(range)),
        request(store.getAll(range) as IDBRequest<StoredFile[]>),
      ]);
      return keys.map((key, i): FileInfo => ({
        name: key as string,
        size: files[i]?.data.byteLength ?? 0,
        modified: files[i]?.modified ?? 0,
      }));
    },
    deleteFile: async (name) => {
      await run("readwrite", (s) => s.delete(name));
    },
    unlockAchievement: () => undefined,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB is not available"));
    req.onblocked = () => reject(new Error("IndexedDB is blocked by another tab"));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

"use client";

// Minimal IndexedDB KV wrapper (no external deps).
//
// Why:
// - localStorage is too small for Repo Pack ZIP bytes
// - we need durable offline storage for large deterministic artefacts
//
// Notes:
// - Values must be structured-cloneable.
// - We store bytes as ArrayBuffer.

const DB_NAME = "kindred_kv";
const DB_VERSION = 1;
const STORE_NAME = "kv";

function hasIndexedDB(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDB()) {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Failed to open IndexedDB."));
  });
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("IndexedDB request failed."));
        tx.oncomplete = () => {
          try {
            db.close();
          } catch {
            // ignore
          }
        };
        tx.onerror = () => {
          try {
            db.close();
          } catch {
            // ignore
          }
        };
      })
  );
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const v = await withStore<T>("readonly", (store) => store.get(key));
    return typeof v === "undefined" ? null : (v as T);
  } catch {
    return null;
  }
}

export async function idbSet<T>(key: string, value: T): Promise<boolean> {
  try {
    await withStore("readwrite", (store) => store.put(value as any, key));
    return true;
  } catch {
    return false;
  }
}

export async function idbDel(key: string): Promise<boolean> {
  try {
    await withStore("readwrite", (store) => store.delete(key));
    return true;
  } catch {
    return false;
  }
}

export async function idbGetBytes(key: string): Promise<Uint8Array | null> {
  const v = await idbGet<any>(key);
  if (!v) return null;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v) && v.buffer) return new Uint8Array(v.buffer.slice(0));
  if (v && typeof v === "object" && v.type === "bytes" && v.buffer instanceof ArrayBuffer) {
    return new Uint8Array(v.buffer);
  }
  return null;
}

export async function idbSetBytes(key: string, bytes: Uint8Array): Promise<boolean> {
  // Store a plain ArrayBuffer to maximize compatibility.
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return await idbSet(key, buf);
}

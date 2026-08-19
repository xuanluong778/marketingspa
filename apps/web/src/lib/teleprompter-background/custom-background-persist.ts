/**
 * Persist applied custom teleprompter backgrounds in IndexedDB (browser only).
 * Survives F5 / reload. Never uploaded to API/DB — stays on this device.
 */

import type { PreparedCustomBg } from './custom-background';

export const CUSTOM_BG_IDB_NAME = 'marketingspa-teleprompter-custom-bg';
export const CUSTOM_BG_IDB_VERSION = 1;
export const CUSTOM_BG_IDB_STORE = 'applied';
export const CUSTOM_BG_IDB_KEY = 'current';

export type PersistedCustomBgMeta = {
  kind: 'image' | 'video';
  fileName: string;
  mime: string;
  sizeBytes: number;
  width: number;
  height: number;
  durationSec?: number;
  savedAt: number;
};

export type PersistedCustomBgRecord = PersistedCustomBgMeta & {
  /** Raw file bytes */
  blob: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexeddb_unavailable'));
      return;
    }
    const req = indexedDB.open(CUSTOM_BG_IDB_NAME, CUSTOM_BG_IDB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('indexeddb_open_failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CUSTOM_BG_IDB_STORE)) {
        db.createObjectStore(CUSTOM_BG_IDB_STORE);
      }
    };
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb_request_failed'));
  });
}

/**
 * Build a Blob from the live object URL of a prepared custom bg (image/video).
 */
export async function blobFromPreparedCustomBg(bg: PreparedCustomBg): Promise<Blob> {
  const res = await fetch(bg.objectUrl);
  if (!res.ok) throw new Error(`custom_bg_fetch_${res.status}`);
  return res.blob();
}

/**
 * Save applied background (called after "Áp dụng").
 * Overwrites previous entry.
 */
export async function saveAppliedCustomBackground(bg: PreparedCustomBg): Promise<void> {
  const blob = await blobFromPreparedCustomBg(bg);
  const record: PersistedCustomBgRecord = {
    kind: bg.kind,
    fileName: bg.fileName,
    mime: bg.mime,
    sizeBytes: bg.sizeBytes,
    width: bg.width,
    height: bg.height,
    durationSec: bg.kind === 'video' ? bg.durationSec : undefined,
    savedAt: Date.now(),
    blob,
  };
  const db = await openDb();
  try {
    const tx = db.transaction(CUSTOM_BG_IDB_STORE, 'readwrite');
    const store = tx.objectStore(CUSTOM_BG_IDB_STORE);
    await idbReq(store.put(record, CUSTOM_BG_IDB_KEY));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('indexeddb_tx_failed'));
      tx.onabort = () => reject(tx.error ?? new Error('indexeddb_tx_aborted'));
    });
  } finally {
    db.close();
  }
}

/** Load last applied custom bg, or null if none / unavailable. */
export async function loadAppliedCustomBackground(): Promise<PersistedCustomBgRecord | null> {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(CUSTOM_BG_IDB_STORE, 'readonly');
      const store = tx.objectStore(CUSTOM_BG_IDB_STORE);
      const row = await idbReq(store.get(CUSTOM_BG_IDB_KEY));
      if (!row || typeof row !== 'object') return null;
      const rec = row as PersistedCustomBgRecord;
      if (!(rec.blob instanceof Blob) || !rec.fileName || !rec.mime) return null;
      return rec;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** Remove saved custom background (Xóa nền). */
export async function clearAppliedCustomBackground(): Promise<void> {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(CUSTOM_BG_IDB_STORE, 'readwrite');
      const store = tx.objectStore(CUSTOM_BG_IDB_STORE);
      await idbReq(store.delete(CUSTOM_BG_IDB_KEY));
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('indexeddb_tx_failed'));
        tx.onabort = () => reject(tx.error ?? new Error('indexeddb_tx_aborted'));
      });
    } finally {
      db.close();
    }
  } catch {
    /* ignore */
  }
}

/** Build a File suitable for prepareCustomBackgroundFromFile. */
export function fileFromPersistedCustomBg(rec: PersistedCustomBgRecord): File {
  return new File([rec.blob], rec.fileName || 'background', {
    type: rec.mime || 'application/octet-stream',
    lastModified: rec.savedAt || Date.now(),
  });
}

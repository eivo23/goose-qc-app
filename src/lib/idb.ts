'use client';
// עטיפה מינימלית ל-IndexedDB לשמירת בדיקות ממתינות כשהחיבור נופל.

const DB = 'gqc';
const STORE = 'pending';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface PendingCheck {
  id: string;
  blobs: Blob[];
  names: string[];
  dedupeKey: string;
  createdAt: number;
}

export async function enqueue(item: PendingCheck) {
  const db = await open();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function allPending(): Promise<PendingCheck[]> {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => res(req.result as PendingCheck[]);
    req.onerror = () => rej(req.error);
  });
}

export async function remove(id: string) {
  const db = await open();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

"use client";
export type Recovery<T = unknown> = {
  key: string;
  accountId: string;
  contentId: string;
  baseRevision: number;
  data: T;
  updatedAt: string;
};
const databaseName = "portfolio-admin-recovery";
let tabIdentity: string | undefined;
export function recoveryKey(accountId: string, contentId: string) {
  tabIdentity ??= crypto.randomUUID();
  return `${accountId}:${contentId}:${tabIdentity}`;
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(databaseName, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("drafts", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function readRecovery(
  accountId: string,
  contentId: string,
  serverData?: unknown,
): Promise<Recovery | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly");
    const req = tx.objectStore("drafts").getAll();
    req.onsuccess = () =>
      resolve(
        (req.result as Recovery[])
          .filter(
            (value) =>
              value.accountId === accountId &&
              value.contentId === contentId &&
              (serverData === undefined ||
                JSON.stringify(value.data) !== JSON.stringify(serverData)),
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0],
      );
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
export async function writeRecovery(value: Recovery) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put(value);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function removeRecovery(
  accountId: string,
  contentId: string,
  key = recoveryKey(accountId, contentId),
) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
export async function clearRecovery() {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

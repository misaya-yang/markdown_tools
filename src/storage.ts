import type { CleanupResult, MarkdownRecord } from "./types";

const DB_NAME = "marklens-db";
const DB_VERSION = 1;
const STORE_NAME = "documents";

type CleanupPolicy = {
  maxRecords: number;
  maxBytes: number;
  maxAgeDays: number;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("createdAt", "createdAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getRecords(): Promise<MarkdownRecord[]> {
  const db = await openDatabase();

  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    const records = await requestToPromise<MarkdownRecord[]>(request);
    return records.sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    db.close();
  }
}

export async function saveRecord(record: MarkdownRecord): Promise<void> {
  const db = await openDatabase();

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteRecord(id: string): Promise<void> {
  const db = await openDatabase();

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function clearRecords(): Promise<void> {
  const db = await openDatabase();

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function cleanupRecords(
  policy: CleanupPolicy,
): Promise<CleanupResult> {
  const records = await getRecords();
  const cutoff = Date.now() - policy.maxAgeDays * 24 * 60 * 60 * 1000;
  const keepers: MarkdownRecord[] = [];
  const deletionIds = new Set<string>();
  let usedBytes = 0;
  let freedBytes = 0;

  for (const record of records) {
    const expired = record.updatedAt < cutoff;
    const exceedsCount = keepers.length >= policy.maxRecords;
    const exceedsBytes = usedBytes + record.sizeBytes > policy.maxBytes;

    if (expired || exceedsCount || exceedsBytes) {
      deletionIds.add(record.id);
      freedBytes += record.sizeBytes;
    } else {
      keepers.push(record);
      usedBytes += record.sizeBytes;
    }
  }

  if (deletionIds.size === 0) {
    return { deleted: 0, freedBytes: 0 };
  }

  const db = await openDatabase();

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    deletionIds.forEach((id) => store.delete(id));

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }

  return { deleted: deletionIds.size, freedBytes };
}

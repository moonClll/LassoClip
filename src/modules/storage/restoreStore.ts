import type { ClipItemSummary, ClipBlobRecord } from '../../types/capture';
import type { ClipProject } from '../../types/editor';
import type { CollectionRecord, TagRecord } from '../../types/library';
import {
  CLIP_BLOB_STORE_NAME,
  CLIP_STORE_NAME,
  COLLECTION_STORE_NAME,
  PROJECT_STORE_NAME,
  RESTORE_BLOB_STORE_NAME,
  RESTORE_CLIP_STORE_NAME,
  RESTORE_COLLECTION_STORE_NAME,
  RESTORE_META_STORE_NAME,
  RESTORE_PROJECT_STORE_NAME,
  RESTORE_TAG_STORE_NAME,
  TAG_STORE_NAME,
  openDatabase,
} from './clipStore';

export interface RestoreManifestRecord { id: string; manifest: unknown; }

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
  });
}

async function put(storeName: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('恢复暂存失败'));
      transaction.onabort = () => reject(transaction.error ?? new Error('恢复暂存已回滚'));
    });
  } finally { database.close(); }
}

export async function clearRestoreStaging(): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const stores = [RESTORE_META_STORE_NAME, RESTORE_CLIP_STORE_NAME, RESTORE_BLOB_STORE_NAME, RESTORE_PROJECT_STORE_NAME, RESTORE_TAG_STORE_NAME, RESTORE_COLLECTION_STORE_NAME];
      const transaction = database.transaction(stores, 'readwrite');
      stores.forEach((name) => transaction.objectStore(name).clear());
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('清理恢复暂存失败'));
      transaction.onabort = () => reject(transaction.error ?? new Error('清理恢复暂存已回滚'));
    });
  } finally { database.close(); }
}

export const stageRestoreMeta = (manifest: unknown) => put(RESTORE_META_STORE_NAME, { id: 'manifest', manifest } satisfies RestoreManifestRecord);
export const stageRestoreClip = (clip: ClipItemSummary) => put(RESTORE_CLIP_STORE_NAME, clip);
export const stageRestoreBlob = (blob: ClipBlobRecord & { hasThumbnail?: boolean }) => put(RESTORE_BLOB_STORE_NAME, blob);
export const stageRestoreProject = (project: ClipProject) => put(RESTORE_PROJECT_STORE_NAME, project);
export const stageRestoreTag = (tag: TagRecord) => put(RESTORE_TAG_STORE_NAME, tag);
export const stageRestoreCollection = (collection: CollectionRecord) => put(RESTORE_COLLECTION_STORE_NAME, collection);

function copyStore(transaction: IDBTransaction, sourceName: string, targetName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const source = transaction.objectStore(sourceName);
    const target = transaction.objectStore(targetName);
    const request = source.openCursor();
    request.onerror = () => reject(request.error ?? new Error(`读取恢复暂存 ${sourceName} 失败`));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(); return; }
      try { target.put(cursor.value); cursor.continue(); }
      catch (error) { reject(error); }
    };
  });
}

/** Replaces the five primary stores in one IndexedDB transaction. */
export async function commitRestoreStaging(): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const stores = [CLIP_STORE_NAME, CLIP_BLOB_STORE_NAME, PROJECT_STORE_NAME, TAG_STORE_NAME, COLLECTION_STORE_NAME, RESTORE_CLIP_STORE_NAME, RESTORE_BLOB_STORE_NAME, RESTORE_PROJECT_STORE_NAME, RESTORE_TAG_STORE_NAME, RESTORE_COLLECTION_STORE_NAME];
      const transaction = database.transaction(stores, 'readwrite');
      const clear = stores.slice(0, 5).map((name) => transaction.objectStore(name).clear());
      let cleared = 0;
      const beginCopy = () => {
        if (cleared !== clear.length) return;
        copyStore(transaction, RESTORE_CLIP_STORE_NAME, CLIP_STORE_NAME)
          .then(() => copyStore(transaction, RESTORE_BLOB_STORE_NAME, CLIP_BLOB_STORE_NAME))
          .then(() => copyStore(transaction, RESTORE_PROJECT_STORE_NAME, PROJECT_STORE_NAME))
          .then(() => copyStore(transaction, RESTORE_TAG_STORE_NAME, TAG_STORE_NAME))
          .then(() => copyStore(transaction, RESTORE_COLLECTION_STORE_NAME, COLLECTION_STORE_NAME))
          .catch((error) => { try { transaction.abort(); } catch { /* transaction already finished */ } reject(error); });
      };
      clear.forEach((request) => { request.onsuccess = () => { cleared += 1; beginCopy(); }; });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('恢复提交失败，已回滚'));
      transaction.onabort = () => reject(transaction.error ?? new Error('恢复提交已回滚'));
    });
  } finally { database.close(); }
}

export async function getRestoreStagingCounts(): Promise<{ clips: number; blobs: number; projects: number; tags: number; collections: number }> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([RESTORE_CLIP_STORE_NAME, RESTORE_BLOB_STORE_NAME, RESTORE_PROJECT_STORE_NAME, RESTORE_TAG_STORE_NAME, RESTORE_COLLECTION_STORE_NAME], 'readonly');
    const [clips, blobs, projects, tags, collections] = await Promise.all([
      requestResult(transaction.objectStore(RESTORE_CLIP_STORE_NAME).count()),
      requestResult(transaction.objectStore(RESTORE_BLOB_STORE_NAME).count()),
      requestResult(transaction.objectStore(RESTORE_PROJECT_STORE_NAME).count()),
      requestResult(transaction.objectStore(RESTORE_TAG_STORE_NAME).count()),
      requestResult(transaction.objectStore(RESTORE_COLLECTION_STORE_NAME).count()),
    ]);
    return { clips, blobs, projects, tags, collections };
  } finally { database.close(); }
}

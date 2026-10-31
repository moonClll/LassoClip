import type { ClipItemSummary } from '../../types/capture';
import type { ClipProject } from '../../types/editor';
import type { CollectionRecord } from '../../types/library';
import { CLIP_BLOB_STORE_NAME, CLIP_STORE_NAME, COLLECTION_STORE_NAME, PROJECT_STORE_NAME, TAG_STORE_NAME, openDatabase } from './clipStore';

export interface StorageStats {
  clipCount: number;
  projectCount: number;
  collectionCount: number;
  tagCount: number;
  originalBytes: number;
  thumbnailBytes: number;
  blobCount: number;
  estimatedUsage?: number;
  quota?: number;
}

export type IntegrityIssueType = 'missing-blob' | 'orphan-blob' | 'missing-project-clip' | 'missing-collection-clip';
export interface IntegrityIssue { type: IntegrityIssueType; id: string; detail: string; }

function requestResult<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败')); }); }

export async function getStorageStats(): Promise<StorageStats> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([CLIP_STORE_NAME, PROJECT_STORE_NAME, COLLECTION_STORE_NAME, TAG_STORE_NAME, CLIP_BLOB_STORE_NAME], 'readonly');
    const [clips, projects, collections, tags, blobs] = await Promise.all([
      requestResult(transaction.objectStore(CLIP_STORE_NAME).getAll()) as Promise<ClipItemSummary[]>,
      requestResult(transaction.objectStore(PROJECT_STORE_NAME).getAll()) as Promise<ClipProject[]>,
      requestResult(transaction.objectStore(COLLECTION_STORE_NAME).getAll()) as Promise<CollectionRecord[]>,
      requestResult(transaction.objectStore(TAG_STORE_NAME).getAll()),
      requestResult(transaction.objectStore(CLIP_BLOB_STORE_NAME).getAll()) as Promise<Array<{ imageBlob?: Blob; thumbnailBlob?: Blob }>>,
    ]);
    const browserEstimate = typeof navigator !== 'undefined' && 'storage' in navigator && navigator.storage?.estimate ? await navigator.storage.estimate() : undefined;
    return { clipCount: clips.length, projectCount: projects.length, collectionCount: collections.length, tagCount: tags.length, blobCount: blobs.length, originalBytes: blobs.reduce((sum, blob) => sum + (blob.imageBlob?.size ?? 0), 0), thumbnailBytes: blobs.reduce((sum, blob) => sum + (blob.thumbnailBlob?.size ?? 0), 0), estimatedUsage: browserEstimate?.usage, quota: browserEstimate?.quota };
  } finally { database.close(); }
}

export async function inspectIntegrity(): Promise<IntegrityIssue[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([CLIP_STORE_NAME, CLIP_BLOB_STORE_NAME, PROJECT_STORE_NAME, COLLECTION_STORE_NAME], 'readonly');
    const [clips, blobs, projects, collections] = await Promise.all([
      requestResult(transaction.objectStore(CLIP_STORE_NAME).getAll()) as Promise<ClipItemSummary[]>,
      requestResult(transaction.objectStore(CLIP_BLOB_STORE_NAME).getAll()) as Promise<Array<{ id: string }>>,
      requestResult(transaction.objectStore(PROJECT_STORE_NAME).getAll()) as Promise<ClipProject[]>,
      requestResult(transaction.objectStore(COLLECTION_STORE_NAME).getAll()) as Promise<CollectionRecord[]>,
    ]);
    const clipIds = new Set(clips.map((clip) => clip.id)); const blobIds = new Set(blobs.map((blob) => blob.id)); const issues: IntegrityIssue[] = [];
    for (const clip of clips) if (!blobIds.has(clip.id)) issues.push({ type: 'missing-blob', id: clip.id, detail: `素材 ${clip.name} 缺少图片 Blob` });
    for (const blob of blobs) if (!clipIds.has(blob.id)) issues.push({ type: 'orphan-blob', id: blob.id, detail: '存在没有元数据的图片 Blob；未自动删除' });
    for (const project of projects) for (const item of project.items) if (item.type === 'image' && !clipIds.has(item.clipId)) issues.push({ type: 'missing-project-clip', id: item.clipId, detail: `项目 ${project.name} 引用了不存在的素材` });
    for (const collection of collections) for (const clipId of collection.clipIds) if (!clipIds.has(clipId)) issues.push({ type: 'missing-collection-clip', id: clipId, detail: `Collection ${collection.name} 引用了不存在的素材` });
    return issues;
  } finally { database.close(); }
}

/** Repairs only stale Collection metadata; original blobs and project layers are never deleted automatically. */
export async function repairCollectionReferences(): Promise<number> {
  const database = await openDatabase();
  try {
    return await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction([CLIP_STORE_NAME, COLLECTION_STORE_NAME], 'readwrite'); const clipStore = transaction.objectStore(CLIP_STORE_NAME); const collectionStore = transaction.objectStore(COLLECTION_STORE_NAME); let repaired = 0;
      const clipsRequest = clipStore.getAll(); const collectionsRequest = collectionStore.getAll(); let clips: ClipItemSummary[] | undefined; let collections: CollectionRecord[] | undefined;
      const apply = () => { if (!clips || !collections) return; const ids = new Set(clips.map((clip) => clip.id)); for (const collection of collections) { const clipIds = collection.clipIds.filter((id) => ids.has(id)); const coverClipId = collection.coverClipId && clipIds.includes(collection.coverClipId) ? collection.coverClipId : clipIds[0]; if (clipIds.length !== collection.clipIds.length || coverClipId !== collection.coverClipId) { collectionStore.put({ ...collection, clipIds, coverClipId, updatedAt: Date.now() }); repaired += 1; } } };
      clipsRequest.onsuccess = () => { clips = clipsRequest.result as ClipItemSummary[]; apply(); }; collectionsRequest.onsuccess = () => { collections = collectionsRequest.result as CollectionRecord[]; apply(); };
      clipsRequest.onerror = () => reject(clipsRequest.error); collectionsRequest.onerror = () => reject(collectionsRequest.error);
      transaction.oncomplete = () => resolve(repaired); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error ?? new Error('完整性修复已回滚'));
    });
  } finally { database.close(); }
}

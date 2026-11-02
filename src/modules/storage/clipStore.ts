import type { ClipBlobRecord, ClipItemRecord, ClipItemSummary } from '../../types/capture';
import type { ClipProject } from '../../types/editor';
import { projectClipIds } from '../../types/editor';
import { describeBlob, logImageDiagnostic } from '../media/imageDiagnostics';

export const DB_NAME = 'lassoclip';
export const DB_VERSION = 5;
export const CLIP_STORE_NAME = 'clips';
export const CLIP_BLOB_STORE_NAME = 'clipBlobs';
export const PROJECT_STORE_NAME = 'projects';
export const TAG_STORE_NAME = 'tags';
export const COLLECTION_STORE_NAME = 'collections';
export const RESTORE_META_STORE_NAME = 'restoreMeta';
export const RESTORE_CLIP_STORE_NAME = 'restoreClips';
export const RESTORE_BLOB_STORE_NAME = 'restoreClipBlobs';
export const RESTORE_PROJECT_STORE_NAME = 'restoreProjects';
export const RESTORE_TAG_STORE_NAME = 'restoreTags';
export const RESTORE_COLLECTION_STORE_NAME = 'restoreCollections';

/** Normalizes projects created before the Phase 2.4 annotation schema. */
export function normalizeProject(project: ClipProject): ClipProject {
  return {
    ...project,
    schemaVersion: Math.max(2, project.schemaVersion ?? 1),
    annotations: Array.isArray(project.annotations) ? project.annotations : [],
    redactions: Array.isArray((project as ClipProject & { redactions?: unknown }).redactions)
      ? (project as ClipProject).redactions
      : [],
    items: Array.isArray(project.items) ? project.items : [],
  };
}

export class ProjectReferenceError extends Error {
  constructor(public readonly missingClipIds: string[]) {
    super(`项目引用了不存在的素材：${missingClipIds.join(', ')}`);
    this.name = 'ProjectReferenceError';
  }
}

export class ClipReferenceError extends Error {
  constructor(public readonly clipId: string, public readonly projectIds: string[], public readonly projectNames: string[]) {
    const labels = projectNames.length > 0 ? projectNames.join('、') : projectIds.join('、');
    super(`素材仍被项目引用，无法删除${labels ? `：${labels}` : ''}`);
    this.name = 'ClipReferenceError';
  }
}

function configureDatabase(database: IDBDatabase): void {
  database.onversionchange = () => database.close();
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CLIP_STORE_NAME)) database.createObjectStore(CLIP_STORE_NAME, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(CLIP_BLOB_STORE_NAME)) {
        const blobs = database.createObjectStore(CLIP_BLOB_STORE_NAME, { keyPath: 'id' });
        blobs.createIndex('hasThumbnail', 'hasThumbnail', { unique: false });
        const clipStore = request.transaction?.objectStore(CLIP_STORE_NAME);
        if (!clipStore) return;
        const cursorRequest = clipStore.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const record = cursor.value as ClipItemRecord & { thumbnailBlob?: Blob };
          if (record.imageBlob) {
            blobs.put({ id: record.id, imageBlob: record.imageBlob, thumbnailBlob: record.thumbnailBlob, hasThumbnail: Boolean(record.thumbnailBlob) });
            const { imageBlob: _imageBlob, thumbnailBlob: _thumbnailBlob, ...summary } = record;
            void _imageBlob; void _thumbnailBlob;
            cursor.update(summary);
          }
          cursor.continue();
        };
      }
      if (!database.objectStoreNames.contains(PROJECT_STORE_NAME)) {
        const projects = database.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'id' });
        projects.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!database.objectStoreNames.contains(TAG_STORE_NAME)) {
        const tags = database.createObjectStore(TAG_STORE_NAME, { keyPath: 'id' });
        tags.createIndex('name', 'name', { unique: true });
      }
      if (!database.objectStoreNames.contains(COLLECTION_STORE_NAME)) {
        const collections = database.createObjectStore(COLLECTION_STORE_NAME, { keyPath: 'id' });
        collections.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!database.objectStoreNames.contains(RESTORE_META_STORE_NAME)) database.createObjectStore(RESTORE_META_STORE_NAME, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(RESTORE_CLIP_STORE_NAME)) database.createObjectStore(RESTORE_CLIP_STORE_NAME, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(RESTORE_BLOB_STORE_NAME)) database.createObjectStore(RESTORE_BLOB_STORE_NAME, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(RESTORE_PROJECT_STORE_NAME)) database.createObjectStore(RESTORE_PROJECT_STORE_NAME, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(RESTORE_TAG_STORE_NAME)) database.createObjectStore(RESTORE_TAG_STORE_NAME, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(RESTORE_COLLECTION_STORE_NAME)) database.createObjectStore(RESTORE_COLLECTION_STORE_NAME, { keyPath: 'id' });
    };
    request.onblocked = () => reject(new Error('本地素材库正在被其他窗口占用，请关闭其他 LassoClip 页面后重试'));
    request.onsuccess = () => {
      configureDatabase(request.result);
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('无法打开本地素材库'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
  });
}

export async function saveClip(item: ClipItemRecord): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([CLIP_STORE_NAME, CLIP_BLOB_STORE_NAME], 'readwrite');
      const { imageBlob, thumbnailBlob, ...summary } = item;
      transaction.objectStore(CLIP_STORE_NAME).put(summary);
      transaction.objectStore(CLIP_BLOB_STORE_NAME).put({ id: item.id, imageBlob, thumbnailBlob, hasThumbnail: Boolean(thumbnailBlob) });
      logImageDiagnostic({ stage: 'idb-save-original', clipId: item.id, ...describeBlob(imageBlob) });
      logImageDiagnostic({ stage: 'idb-save-thumbnail', clipId: item.id, ...describeBlob(thumbnailBlob) });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('素材保存失败'));
      transaction.onabort = () => reject(transaction.error ?? new Error('素材保存已回滚'));
    });
  } finally {
    database.close();
  }
}

export async function getClip(id: string): Promise<ClipItemRecord | undefined> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([CLIP_STORE_NAME, CLIP_BLOB_STORE_NAME], 'readonly');
    const summary = await requestResult(transaction.objectStore(CLIP_STORE_NAME).get(id)) as ClipItemSummary | undefined;
    if (!summary) return undefined;
    const blobRecord = await requestResult(transaction.objectStore(CLIP_BLOB_STORE_NAME).get(id)) as ClipBlobRecord | undefined;
    if (!blobRecord) return undefined;
    return { ...summary, imageBlob: blobRecord.imageBlob, thumbnailBlob: blobRecord.thumbnailBlob };
  } finally {
    database.close();
  }
}

export async function listClips(): Promise<ClipItemRecord[]> {
  const summaries = await listClipSummaries();
  const clips: ClipItemRecord[] = [];
  for (const summary of summaries) {
    const clip = await getClip(summary.id);
    if (clip) clips.push(clip);
  }
  return clips;
}

export async function listClipSummaries(): Promise<ClipItemSummary[]> {
  const database = await openDatabase();
  try {
    const result = await requestResult(database.transaction(CLIP_STORE_NAME, 'readonly').objectStore(CLIP_STORE_NAME).getAll());
    return (result as ClipItemSummary[]).sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
  } finally { database.close(); }
}

export async function getClipThumbnail(id: string): Promise<Blob | undefined> {
  const database = await openDatabase();
  try {
    const record = await requestResult(database.transaction(CLIP_BLOB_STORE_NAME, 'readonly').objectStore(CLIP_BLOB_STORE_NAME).get(id)) as ClipBlobRecord | undefined;
    const blob = record?.thumbnailBlob;
    logImageDiagnostic({ stage: 'idb-read-thumbnail', clipId: id, ...describeBlob(blob) });
    return blob;
  } finally { database.close(); }
}

export async function getClipImageBlob(id: string): Promise<Blob | undefined> {
  const database = await openDatabase();
  try {
    const record = await requestResult(database.transaction(CLIP_BLOB_STORE_NAME, 'readonly').objectStore(CLIP_BLOB_STORE_NAME).get(id)) as ClipBlobRecord | undefined;
    const blob = record?.imageBlob;
    logImageDiagnostic({ stage: 'idb-read-original', clipId: id, ...describeBlob(blob) });
    return blob;
  } finally { database.close(); }
}

export async function saveClipThumbnail(id: string, thumbnailBlob: Blob): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([CLIP_STORE_NAME, CLIP_BLOB_STORE_NAME], 'readwrite');
      const clipRequest = transaction.objectStore(CLIP_STORE_NAME).get(id);
      clipRequest.onsuccess = () => {
        if (!clipRequest.result) { transaction.abort(); reject(new Error('素材不存在')); return; }
        const blobStore = transaction.objectStore(CLIP_BLOB_STORE_NAME); const currentRequest = blobStore.get(id);
        currentRequest.onsuccess = () => { const current = currentRequest.result as ClipBlobRecord | undefined; if (current) blobStore.put({ ...current, thumbnailBlob, hasThumbnail: true }); };
        currentRequest.onerror = () => { transaction.abort(); reject(currentRequest.error); };
      };
      clipRequest.onerror = () => { transaction.abort(); reject(clipRequest.error); };
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error('缩略图保存失败')); transaction.onabort = () => reject(transaction.error ?? new Error('缩略图保存已回滚'));
    });
  } finally { database.close(); }
}

export async function updateClipMetadata(id: string, patch: Partial<ClipItemSummary>): Promise<ClipItemSummary> {
  const database = await openDatabase();
  try {
    return await new Promise<ClipItemSummary>((resolve, reject) => {
      const transaction = database.transaction(CLIP_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(CLIP_STORE_NAME);
      const request = store.get(id);
      let next: ClipItemSummary | undefined;
      request.onsuccess = () => {
        if (!request.result) { transaction.abort(); reject(new Error('素材不存在')); return; }
        next = { ...request.result, ...patch, metadata: { ...request.result.metadata, ...(patch.metadata ?? {}), updatedAt: Date.now() } } as ClipItemSummary;
        store.put(next);
      };
      transaction.oncomplete = () => resolve(next!);
      transaction.onerror = () => reject(transaction.error ?? new Error('素材元数据保存失败'));
      transaction.onabort = () => { if (!next) reject(transaction.error ?? new Error('素材元数据保存已回滚')); };
    });
  } finally { database.close(); }
}

export async function getProjectsReferencingClip(clipId: string): Promise<ClipProject[]> {
  const projects = await listProjects();
  return projects.filter((project) => project.items.some((item) => item.type === 'image' && item.clipId === clipId));
}

/** Deletes a clip only when no persisted project still references it. */
export async function deleteClip(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([CLIP_STORE_NAME, CLIP_BLOB_STORE_NAME, PROJECT_STORE_NAME, COLLECTION_STORE_NAME], 'readwrite');
      let settled = false;
      const projectsRequest = transaction.objectStore(PROJECT_STORE_NAME).getAll();
      projectsRequest.onsuccess = () => {
        const references = (projectsRequest.result as ClipProject[]).map(normalizeProject).filter((project) => project.items.some((item) => item.type === 'image' && item.clipId === id));
        if (references.length > 0) {
          settled = true;
          reject(new ClipReferenceError(id, references.map((project) => project.id), references.map((project) => project.name)));
          transaction.abort();
          return;
        }
        transaction.objectStore(CLIP_STORE_NAME).delete(id);
        transaction.objectStore(CLIP_BLOB_STORE_NAME).delete(id);
        const collectionStore = transaction.objectStore(COLLECTION_STORE_NAME);
        const collectionRequest = collectionStore.getAll();
        collectionRequest.onsuccess = () => {
          for (const collection of collectionRequest.result as Array<{ id: string; clipIds: string[]; coverClipId?: string; updatedAt: number }>) {
            if (!collection.clipIds.includes(id)) continue;
            const clipIds = collection.clipIds.filter((clipId) => clipId !== id);
            collectionStore.put({ ...collection, clipIds, coverClipId: collection.coverClipId === id ? clipIds[0] : collection.coverClipId, updatedAt: Date.now() });
          }
        };
        collectionRequest.onerror = () => { settled = true; reject(collectionRequest.error ?? new Error('无法清理 Collection 关联')); transaction.abort(); };
      };
      projectsRequest.onerror = () => { settled = true; reject(projectsRequest.error ?? new Error('无法验证素材引用')); transaction.abort(); };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => { if (!settled) { settled = true; reject(transaction.error ?? new Error('素材删除失败')); } };
      transaction.onabort = () => { if (!settled) { settled = true; reject(transaction.error ?? new Error('素材删除已回滚')); } };
    });
  } finally {
    database.close();
  }
}

export async function createProject(project: ClipProject): Promise<ClipProject> {
  await saveProject(project);
  return project;
}

export async function duplicateProject(id: string): Promise<ClipProject> {
  const source = await getProject(id);
  if (!source) throw new Error('项目不存在');
  const now = Date.now();
  const copy: ClipProject = {
    ...source,
    id: crypto.randomUUID(),
    name: `${source.name || '未命名项目'} 副本`,
    items: source.items.map((item) => ({ ...item, id: crypto.randomUUID() })),
    annotations: source.annotations.map((annotation) => ({ ...annotation, id: crypto.randomUUID() })),
    redactions: source.redactions.map((redaction) => ({ ...redaction, id: crypto.randomUUID() })),
    createdAt: now,
    updatedAt: now,
  };
  await createProject(copy);
  return copy;
}

export async function saveProject(project: ClipProject): Promise<void> {
  project = normalizeProject(project);
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([CLIP_STORE_NAME, PROJECT_STORE_NAME], 'readwrite');
      const clipStore = transaction.objectStore(CLIP_STORE_NAME);
      const projectStore = transaction.objectStore(PROJECT_STORE_NAME);
      const missing: string[] = [];
      const clipIds = projectClipIds(project);
      let pending = clipIds.length;
      for (const clipId of clipIds) {
        const request = clipStore.get(clipId);
        request.onsuccess = () => {
          if (!request.result) missing.push(clipId);
          pending -= 1;
          if (pending === 0) {
            if (missing.length > 0) {
              transaction.abort();
              reject(new ProjectReferenceError(missing));
            } else {
              projectStore.put(project);
            }
          }
        };
        request.onerror = () => {
          transaction.abort();
          reject(request.error ?? new Error('无法验证项目素材关联'));
        };
      }
      if (pending === 0) projectStore.put(project);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('项目保存失败'));
      transaction.onabort = () => {
        if (missing.length === 0) reject(transaction.error ?? new Error('项目保存已回滚'));
      };
    });
  } finally {
    database.close();
  }
}

export async function getProject(id: string): Promise<ClipProject | undefined> {
  const database = await openDatabase();
  try {
    const project = await requestResult(database.transaction(PROJECT_STORE_NAME, 'readonly').objectStore(PROJECT_STORE_NAME).get(id));
    return project ? normalizeProject(project as ClipProject) : undefined;
  } finally {
    database.close();
  }
}

export async function listProjects(): Promise<ClipProject[]> {
  const database = await openDatabase();
  try {
    const result = await requestResult(database.transaction(PROJECT_STORE_NAME, 'readonly').objectStore(PROJECT_STORE_NAME).getAll());
    return (result as ClipProject[]).map(normalizeProject).sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    database.close();
  }
}

export async function deleteProject(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PROJECT_STORE_NAME, 'readwrite');
      transaction.objectStore(PROJECT_STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('项目删除失败'));
      transaction.onabort = () => reject(transaction.error ?? new Error('项目删除已回滚'));
    });
  } finally {
    database.close();
  }
}

export async function loadProjectWithClips(id: string): Promise<{ project: ClipProject; clips: Map<string, ClipItemRecord> } | undefined> {
  const project = await getProject(id);
  if (!project) return undefined;
  const clips = new Map<string, ClipItemRecord>();
  for (const clipId of projectClipIds(project)) {
    const clip = await getClip(clipId);
    if (clip) clips.set(clipId, clip);
  }
  return { project, clips };
}

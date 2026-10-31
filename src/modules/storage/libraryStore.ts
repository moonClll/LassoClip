import type { ClipItemRecord, ClipItemSummary } from '../../types/capture';
import type { CollectionRecord, TagRecord } from '../../types/library';
import { normalizeTagName } from '../../types/library';
import { CLIP_BLOB_STORE_NAME, CLIP_STORE_NAME, COLLECTION_STORE_NAME, PROJECT_STORE_NAME, TAG_STORE_NAME, openDatabase } from './clipStore';
import type { ClipProject } from '../../types/editor';
import { autoLayoutItems } from '../canvas-editor/autoLayout';
import type { ImageCanvasItem } from '../../types/editor';

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
  });
}

function transactionResult<T>(stores: string[], mode: IDBTransactionMode, work: (transaction: IDBTransaction) => Promise<T> | T): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(stores, mode);
    let settled = false;
    Promise.resolve(work(transaction)).then((value) => {
      transaction.oncomplete = () => { settled = true; resolve(value); database.close(); };
    }).catch((error) => {
      settled = true; try { transaction.abort(); } catch { /* already inactive */ }
      database.close(); reject(error);
    });
    transaction.onerror = () => { if (!settled) { settled = true; database.close(); reject(transaction.error ?? new Error('IndexedDB 事务失败')); } };
    transaction.onabort = () => { if (!settled) { settled = true; database.close(); reject(transaction.error ?? new Error('IndexedDB 事务已回滚')); } };
  }));
}

export async function listTags(): Promise<TagRecord[]> {
  const database = await openDatabase();
  try { return (await requestResult(database.transaction(TAG_STORE_NAME, 'readonly').objectStore(TAG_STORE_NAME).getAll()) as TagRecord[]).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')); }
  finally { database.close(); }
}

export async function createTag(name: string, color: string): Promise<TagRecord> {
  const normalized = normalizeTagName(name);
  if (!normalized) throw new Error('标签名称不能为空');
  const now = Date.now();
  const tag = { id: crypto.randomUUID(), name: normalized, color, createdAt: now, updatedAt: now } satisfies TagRecord;
  return transactionResult([TAG_STORE_NAME], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(TAG_STORE_NAME);
    const existing = (await requestResult(store.getAll()) as TagRecord[]).find((item) => item.name === normalized);
    if (existing) throw new Error('标签已存在');
    store.put(tag); return tag;
  });
}

export async function updateTag(id: string, patch: Partial<Pick<TagRecord, 'name' | 'color'>>): Promise<TagRecord> {
  return transactionResult([TAG_STORE_NAME, CLIP_STORE_NAME], 'readwrite', async (transaction) => {
    const tagStore = transaction.objectStore(TAG_STORE_NAME);
    const current = await requestResult(tagStore.get(id)) as TagRecord | undefined;
    if (!current) throw new Error('标签不存在');
    const name = patch.name === undefined ? current.name : normalizeTagName(patch.name);
    if (!name) throw new Error('标签名称不能为空');
    const allTags = await requestResult(tagStore.getAll()) as TagRecord[];
    if (allTags.some((item) => item.id !== id && item.name === name)) throw new Error('标签已存在');
    const next = { ...current, name, color: patch.color ?? current.color, updatedAt: Date.now() };
    tagStore.put(next);
    if (name !== current.name) {
      const clipStore = transaction.objectStore(CLIP_STORE_NAME);
      const clips = await requestResult(clipStore.getAll()) as ClipItemRecord[];
      for (const clip of clips) {
        if (!clip.tags.includes(current.name)) continue;
        clipStore.put({ ...clip, tags: [...new Set(clip.tags.map((tag) => tag === current.name ? name : tag))], metadata: { ...clip.metadata, updatedAt: Date.now() } });
      }
    }
    return next;
  });
}

export async function deleteTag(id: string): Promise<void> {
  await transactionResult([TAG_STORE_NAME, CLIP_STORE_NAME], 'readwrite', async (transaction) => {
    const tagStore = transaction.objectStore(TAG_STORE_NAME);
    const tag = await requestResult(tagStore.get(id)) as TagRecord | undefined;
    if (!tag) return;
    tagStore.delete(id);
    const clipStore = transaction.objectStore(CLIP_STORE_NAME);
    const clips = await requestResult(clipStore.getAll()) as ClipItemRecord[];
    for (const clip of clips) if (clip.tags.includes(tag.name)) clipStore.put({ ...clip, tags: clip.tags.filter((value) => value !== tag.name), metadata: { ...clip.metadata, updatedAt: Date.now() } });
  });
}

export async function listCollections(): Promise<CollectionRecord[]> {
  const database = await openDatabase();
  try { return (await requestResult(database.transaction(COLLECTION_STORE_NAME, 'readonly').objectStore(COLLECTION_STORE_NAME).getAll()) as CollectionRecord[]).sort((a, b) => b.updatedAt - a.updatedAt); }
  finally { database.close(); }
}

export async function createCollection(name: string, description = ''): Promise<CollectionRecord> {
  const cleanName = name.trim(); if (!cleanName) throw new Error('Collection 名称不能为空');
  const now = Date.now(); const collection = { id: crypto.randomUUID(), name: cleanName, description: description.trim(), clipIds: [], createdAt: now, updatedAt: now } satisfies CollectionRecord;
  return transactionResult([COLLECTION_STORE_NAME], 'readwrite', (transaction) => { transaction.objectStore(COLLECTION_STORE_NAME).put(collection); return collection; });
}

export async function updateCollection(id: string, patch: Partial<Pick<CollectionRecord, 'name' | 'description' | 'coverClipId'>>): Promise<CollectionRecord> {
  return transactionResult([COLLECTION_STORE_NAME], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(COLLECTION_STORE_NAME); const current = await requestResult(store.get(id)) as CollectionRecord | undefined;
    if (!current) throw new Error('Collection 不存在');
    const next = { ...current, name: patch.name === undefined ? current.name : patch.name.trim(), description: patch.description === undefined ? current.description : patch.description.trim(), coverClipId: patch.coverClipId === undefined ? current.coverClipId : patch.coverClipId, updatedAt: Date.now() };
    if (!next.name) throw new Error('Collection 名称不能为空'); store.put(next); return next;
  });
}

export async function deleteCollection(id: string): Promise<void> {
  const database = await openDatabase();
  try { await new Promise<void>((resolve, reject) => { const transaction = database.transaction(COLLECTION_STORE_NAME, 'readwrite'); transaction.objectStore(COLLECTION_STORE_NAME).delete(id); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error('Collection 删除失败')); transaction.onabort = () => reject(transaction.error ?? new Error('Collection 删除已回滚')); }); }
  finally { database.close(); }
}

export async function addClipsToCollection(collectionId: string, clipIds: string[]): Promise<CollectionRecord> {
  return updateCollectionMembership(collectionId, clipIds, 'add');
}

export async function removeClipsFromCollection(collectionId: string, clipIds: string[]): Promise<CollectionRecord> {
  return updateCollectionMembership(collectionId, clipIds, 'remove');
}

async function updateCollectionMembership(collectionId: string, clipIds: string[], mode: 'add' | 'remove'): Promise<CollectionRecord> {
  return transactionResult([CLIP_STORE_NAME, COLLECTION_STORE_NAME], 'readwrite', async (transaction) => {
    const collectionStore = transaction.objectStore(COLLECTION_STORE_NAME); const clipStore = transaction.objectStore(CLIP_STORE_NAME);
    const collection = await requestResult(collectionStore.get(collectionId)) as CollectionRecord | undefined;
    if (!collection) throw new Error('Collection 不存在');
    const clips = await requestResult(clipStore.getAll()) as ClipItemRecord[]; const available = new Set(clips.map((clip) => clip.id));
    const validIds = clipIds.filter((id) => available.has(id));
    const ids = mode === 'add' ? [...new Set([...collection.clipIds, ...validIds])] : collection.clipIds.filter((id) => !validIds.includes(id));
    const next = { ...collection, clipIds: ids, coverClipId: collection.coverClipId && ids.includes(collection.coverClipId) ? collection.coverClipId : ids[0], updatedAt: Date.now() };
    collectionStore.put(next); return next;
  });
}

export interface BatchClipPatch { addTags?: string[]; removeTags?: string[]; favorite?: boolean; renamePrefix?: string; }

export async function batchUpdateClips(ids: string[], patch: BatchClipPatch): Promise<ClipItemSummary[]> {
  const targetIds = new Set(ids);
  return transactionResult([CLIP_STORE_NAME], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(CLIP_STORE_NAME); const clips = await requestResult(store.getAll()) as ClipItemRecord[]; const now = Date.now();
    const updated = clips.filter((clip) => targetIds.has(clip.id)).map((clip) => ({ ...clip, tags: [...new Set([...clip.tags, ...(patch.addTags ?? []).map(normalizeTagName)])].filter((tag) => !(patch.removeTags ?? []).map(normalizeTagName).includes(tag)), favorite: patch.favorite ?? clip.favorite, name: patch.renamePrefix === undefined ? clip.name : `${patch.renamePrefix}${clip.name}`, metadata: { ...clip.metadata, updatedAt: now } }));
    updated.forEach((clip) => store.put(clip)); return updated;
  });
}

function imageItemForProject(clip: ClipItemRecord, index: number): ImageCanvasItem {
  const width = Math.min(280, Math.max(1, clip.metadata.width));
  return { id: crypto.randomUUID(), name: clip.name, type: 'image', clipId: clip.id, transform: { x: 40 + index * 20, y: 40 + index * 20, width, height: Math.max(1, Math.round(width * clip.metadata.height / Math.max(1, clip.metadata.width))), rotation: 0, opacity: 1 }, zIndex: index, visible: true, locked: false, style: { cornerRadius: 0 } };
}

/** Adds only missing ClipItem references to an existing project and reflows image items. */
export async function addClipsToProject(projectId: string, clipIds: string[]): Promise<ClipProject> {
  return transactionResult([CLIP_STORE_NAME, PROJECT_STORE_NAME], 'readwrite', async (transaction) => {
    const clipStore = transaction.objectStore(CLIP_STORE_NAME); const projectStore = transaction.objectStore(PROJECT_STORE_NAME);
    const project = await requestResult(projectStore.get(projectId)) as ClipProject | undefined;
    if (!project) throw new Error('项目不存在');
    const clips = await requestResult(clipStore.getAll()) as ClipItemRecord[]; const wanted = [...new Set(clipIds)]; const available = new Map(clips.map((clip) => [clip.id, clip]));
    const existing = new Set(project.items.filter((item) => item.type === 'image').map((item) => item.clipId));
    const additions = wanted.filter((id) => available.has(id) && !existing.has(id)).map((id, index) => imageItemForProject(available.get(id)!, project.items.length + index));
    const items = autoLayoutItems([...project.items, ...additions], project.canvas.width, project.canvas.height);
    const next = { ...project, items, updatedAt: Date.now() };
    projectStore.put(next); return next;
  });
}

export class BatchClipReferenceError extends Error {
  constructor(public readonly references: Array<{ clipId: string; projectNames: string[] }>) { super(`有 ${references.length} 个素材仍被项目引用，无法删除`); this.name = 'BatchClipReferenceError'; }
}

/** Atomically deletes unreferenced clips and removes their IDs from every collection. */
export async function deleteClips(ids: string[]): Promise<void> {
  const targetIds = new Set(ids);
  await transactionResult([CLIP_STORE_NAME, CLIP_BLOB_STORE_NAME, PROJECT_STORE_NAME, COLLECTION_STORE_NAME], 'readwrite', async (transaction) => {
    const clipStore = transaction.objectStore(CLIP_STORE_NAME); const blobStore = transaction.objectStore(CLIP_BLOB_STORE_NAME); const projectStore = transaction.objectStore(PROJECT_STORE_NAME); const collectionStore = transaction.objectStore(COLLECTION_STORE_NAME);
    const [projects, collections] = await Promise.all([requestResult(projectStore.getAll()) as Promise<ClipProject[]>, requestResult(collectionStore.getAll()) as Promise<CollectionRecord[]>]);
    const references = projects.flatMap((project) => [...targetIds].filter((clipId) => project.items.some((item) => item.type === 'image' && item.clipId === clipId)).map((clipId) => ({ clipId, projectNames: [project.name] })));
    const merged = [...new Map(references.map((reference) => [reference.clipId, reference])).values()];
    if (merged.length > 0) throw new BatchClipReferenceError(merged);
    targetIds.forEach((id) => { clipStore.delete(id); blobStore.delete(id); });
    collections.forEach((collection) => { const clipIds = collection.clipIds.filter((id) => !targetIds.has(id)); if (clipIds.length !== collection.clipIds.length) collectionStore.put({ ...collection, clipIds, coverClipId: collection.coverClipId && clipIds.includes(collection.coverClipId) ? collection.coverClipId : clipIds[0], updatedAt: Date.now() }); });
  });
}

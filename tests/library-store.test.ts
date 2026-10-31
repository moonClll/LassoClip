import 'fake-indexeddb/auto';
import type { ClipItemRecord } from '../src/types/capture';
import { createDefaultProject } from '../src/types/editor';
import { DB_NAME, CLIP_BLOB_STORE_NAME, CLIP_STORE_NAME, PROJECT_STORE_NAME, COLLECTION_STORE_NAME, TAG_STORE_NAME, createProject, deleteClip, getClip, openDatabase, saveClip } from '../src/modules/storage/clipStore';
import { addClipsToCollection, batchUpdateClips, createCollection, createTag, deleteClips, deleteCollection, deleteTag, listCollections, listTags, removeClipsFromCollection, updateTag } from '../src/modules/storage/libraryStore';
import { inspectIntegrity, repairCollectionReferences } from '../src/modules/storage/integrity';

function deleteDatabase(): Promise<void> { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('database blocked')); }); }
function makeClip(id: string, tags: string[] = []): ClipItemRecord { return { id, name: `Clip ${id}`, imageBlob: new Blob(['image']), source: { url: 'https://example.com', title: 'Example', domain: 'example.com', capturedAt: 1 }, selection: { type: 'rectangle', bounds: { x: 0, y: 0, width: 10, height: 10 }, coordinateSpace: 'image-px' }, metadata: { width: 10, height: 10, format: 'image/png', createdAt: 1, updatedAt: 1 }, tags, favorite: false }; }
function imageItem(id: string, clipId: string) { return { id, type: 'image' as const, clipId, transform: { x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1 }, zIndex: 0, visible: true, locked: false, style: { cornerRadius: 0 } }; }

describe('Phase 3.2 library storage', () => {
  beforeEach(async () => deleteDatabase());

  it('migrates v2 to v4 without touching clips and creates organization/blob stores', async () => {
    await new Promise<void>((resolve, reject) => { const request = indexedDB.open(DB_NAME, 2); request.onupgradeneeded = () => { const db = request.result; db.createObjectStore(CLIP_STORE_NAME, { keyPath: 'id' }); db.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'id' }); }; request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error); });
    await saveClip(makeClip('legacy', [' Research  ']) );
    const db = await openDatabase();
    expect(db.version).toBe(4); expect([...db.objectStoreNames]).toEqual(expect.arrayContaining([CLIP_STORE_NAME, CLIP_BLOB_STORE_NAME, PROJECT_STORE_NAME, TAG_STORE_NAME, COLLECTION_STORE_NAME])); db.close();
    expect(await getClip('legacy')).toHaveProperty('imageBlob');
  });

  it('moves legacy v3 image Blobs into clipBlobs during the v4 upgrade', async () => {
    const legacy = makeClip('legacy-v3');
    await new Promise<void>((resolve, reject) => { const request = indexedDB.open(DB_NAME, 3); request.onupgradeneeded = () => { const db = request.result; db.createObjectStore(CLIP_STORE_NAME, { keyPath: 'id' }); db.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'id' }); db.createObjectStore(TAG_STORE_NAME, { keyPath: 'id' }); db.createObjectStore(COLLECTION_STORE_NAME, { keyPath: 'id' }); }; request.onsuccess = () => { const db = request.result; const transaction = db.transaction(CLIP_STORE_NAME, 'readwrite'); transaction.objectStore(CLIP_STORE_NAME).put(legacy); transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onerror = () => reject(transaction.error); }; request.onerror = () => reject(request.error); });
    const db = await openDatabase(); const metadata = await new Promise<unknown>((resolve, reject) => { const request = db.transaction(CLIP_STORE_NAME, 'readonly').objectStore(CLIP_STORE_NAME).get('legacy-v3'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); const blob = await new Promise<unknown>((resolve, reject) => { const request = db.transaction(CLIP_BLOB_STORE_NAME, 'readonly').objectStore(CLIP_BLOB_STORE_NAME).get('legacy-v3'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); db.close();
    expect(metadata).not.toHaveProperty('imageBlob'); expect(blob).toHaveProperty('imageBlob'); expect(await getClip('legacy-v3')).toHaveProperty('imageBlob');
  });

  it('normalizes tag names, propagates renames, and cleans tags on delete', async () => {
    await saveClip(makeClip('a', ['research'])); await saveClip(makeClip('b', ['research', 'notes']));
    const tag = await createTag('  Research   ', '#a78bfa');
    expect(tag.name).toBe('research');
    await expect(createTag('RESEARCH', '#fff')).rejects.toThrow('标签已存在');
    await updateTag(tag.id, { name: '  学习  ', color: '#38bdf8' });
    expect((await getClip('a'))?.tags).toEqual(['学习']);
    await deleteTag(tag.id); expect((await getClip('a'))?.tags).toEqual([]); expect(await listTags()).toHaveLength(0);
  });

  it('allows many-to-many collections and removes a collection without touching clips', async () => {
    await saveClip(makeClip('a')); await saveClip(makeClip('b'));
    const first = await createCollection('Research', 'papers'); const second = await createCollection('Favorites');
    await addClipsToCollection(first.id, ['a', 'b']); await addClipsToCollection(second.id, ['a']);
    expect((await listCollections()).find((item) => item.id === first.id)?.clipIds).toEqual(['a', 'b']);
    await removeClipsFromCollection(first.id, ['b']); expect((await listCollections()).find((item) => item.id === first.id)?.clipIds).toEqual(['a']);
    await deleteCollection(second.id); expect(await getClip('a')).toBeDefined();
  });

  it('updates selected clips in one transaction for tags, favorites and names', async () => {
    await saveClip(makeClip('a')); await saveClip(makeClip('b'));
    await batchUpdateClips(['a', 'b'], { addTags: ['  Work '], favorite: true, renamePrefix: '2026 · ' });
    expect((await getClip('a'))).toMatchObject({ favorite: true, name: '2026 · Clip a', tags: ['work'] });
    await batchUpdateClips(['a'], { removeTags: ['WORK'], favorite: false }); expect((await getClip('a'))?.tags).toEqual([]);
  });

  it('protects project references and cleans collection IDs on successful batch deletion', async () => {
    await saveClip(makeClip('a')); await saveClip(makeClip('b')); const collection = await createCollection('Set'); await addClipsToCollection(collection.id, ['a', 'b']);
    const project = createDefaultProject('Uses A'); project.items.push(imageItem('item', 'a')); await createProject(project);
    await expect(deleteClips(['a', 'b'])).rejects.toThrow('仍被项目引用');
    expect(await getClip('a')).toBeDefined(); expect((await listCollections()).find((item) => item.id === collection.id)?.clipIds).toEqual(['a', 'b']);
    await deleteClips(['b']); expect(await getClip('b')).toBeUndefined(); expect((await listCollections()).find((item) => item.id === collection.id)?.clipIds).toEqual(['a']);
  });

  it('cleans Collection membership when the single-clip delete API succeeds', async () => {
    await saveClip(makeClip('single')); const collection = await createCollection('Single'); await addClipsToCollection(collection.id, ['single']);
    await deleteClip('single'); expect(await getClip('single')).toBeUndefined(); expect((await listCollections()).find((item) => item.id === collection.id)?.clipIds).toEqual([]);
  });

  it('reports stale associations and repairs only Collection metadata', async () => {
    const collection = await createCollection('Stale');
    const db = await openDatabase(); await new Promise<void>((resolve, reject) => { const transaction = db.transaction(COLLECTION_STORE_NAME, 'readwrite'); transaction.objectStore(COLLECTION_STORE_NAME).put({ ...collection, clipIds: ['missing'], coverClipId: 'missing' }); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); }); db.close();
    expect((await inspectIntegrity()).some((issue) => issue.type === 'missing-collection-clip')).toBe(true);
    expect(await repairCollectionReferences()).toBe(1); expect((await listCollections())[0].clipIds).toEqual([]);
  });
});

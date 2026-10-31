import 'fake-indexeddb/auto';
import type { ClipItemSummary } from '../src/types/capture';
import { DB_NAME, CLIP_BLOB_STORE_NAME, CLIP_STORE_NAME, openDatabase } from '../src/modules/storage/clipStore';
import { getStorageStats } from '../src/modules/storage/integrity';
import { listClipSummaries } from '../src/modules/storage/clipStore';

function deleteDatabase(): Promise<void> { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('database blocked')); }); }
function summary(id: string): ClipItemSummary { return { id, name: id, source: { url: 'https://example.com', title: 'Example', domain: 'example.com', capturedAt: 1 }, selection: { type: 'rectangle', bounds: { x: 0, y: 0, width: 10, height: 10 }, coordinateSpace: 'image-px' }, metadata: { width: 10, height: 10, format: 'image/png', createdAt: Number(id.slice(4)), updatedAt: 1 }, tags: [], favorite: false }; }

describe('metadata-first Library scale', () => {
  beforeEach(async () => deleteDatabase());

  it('indexes 100, 500 and 1000 metadata records without loading original image fields', async () => {
    for (const count of [100, 500, 1000]) {
      await deleteDatabase();
      const database = await openDatabase();
      await new Promise<void>((resolve, reject) => { const transaction = database.transaction([CLIP_STORE_NAME, CLIP_BLOB_STORE_NAME], 'readwrite'); const clipStore = transaction.objectStore(CLIP_STORE_NAME); const blobStore = transaction.objectStore(CLIP_BLOB_STORE_NAME); for (let index = 0; index < count; index += 1) { const id = `clip-${index}`; clipStore.put(summary(id)); blobStore.put({ id, imageBlob: new Blob(['original']) }); } transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
      database.close();
      const started = performance.now(); const summaries = await listClipSummaries(); const elapsed = performance.now() - started;
      expect(summaries).toHaveLength(count); expect(summaries.every((item) => !('imageBlob' in item))).toBe(true); console.info(`[perf] ${count} summaries: ${elapsed.toFixed(1)}ms`);
      const stats = await getStorageStats(); expect(stats.clipCount).toBe(count); expect(stats.blobCount).toBe(count); expect(stats.originalBytes).toBeGreaterThanOrEqual(0);
    }
  });
});

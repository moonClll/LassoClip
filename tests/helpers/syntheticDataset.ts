import type { ClipItemSummary } from '../../src/types/capture';
import { CLIP_BLOB_STORE_NAME, CLIP_STORE_NAME, DB_NAME, openDatabase } from '../../src/modules/storage/clipStore';

function assertFixtureEnvironment(): void {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent.toLowerCase();
  if (!userAgent.includes('jsdom')) throw new Error('Synthetic fixtures are test-only and refuse to run outside jsdom/fake-indexeddb.');
}

export function clearSyntheticDatabase(): Promise<void> {
  assertFixtureEnvironment();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Synthetic fixture cleanup failed'));
    request.onblocked = () => reject(new Error('Synthetic fixture database is blocked'));
  });
}

/** Deterministic metadata used by Library and storage scale tests. */
export function syntheticClipSummary(index: number): ClipItemSummary {
  const id = `clip-${index}`;
  return { id, name: id, source: { url: 'https://example.com', title: 'Synthetic fixture', domain: 'example.com', capturedAt: index }, selection: { type: 'rectangle', bounds: { x: 0, y: 0, width: 10, height: 10 }, coordinateSpace: 'image-px' }, metadata: { width: 10, height: 10, format: 'image/png', createdAt: index, updatedAt: index }, tags: [], favorite: false };
}

/** Seeds summaries and small representative blobs without generating base64 data. */
export async function seedSyntheticClips(count: number): Promise<void> {
  assertFixtureEnvironment();
  if (!Number.isInteger(count) || count < 0 || count > 1000) throw new Error('Synthetic fixture count must be an integer between 0 and 1000.');
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([CLIP_STORE_NAME, CLIP_BLOB_STORE_NAME], 'readwrite');
    const clipStore = transaction.objectStore(CLIP_STORE_NAME);
    const blobStore = transaction.objectStore(CLIP_BLOB_STORE_NAME);
    for (let index = 0; index < count; index += 1) {
      const summary = syntheticClipSummary(index);
      clipStore.put(summary);
      blobStore.put({ id: summary.id, imageBlob: new Blob([`fixture-${index}`], { type: 'image/png' }) });
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Synthetic fixture seed failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Synthetic fixture seed aborted'));
  });
  database.close();
}

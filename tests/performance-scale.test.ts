import 'fake-indexeddb/auto';
import { getStorageStats } from '../src/modules/storage/integrity';
import { listClipSummaries } from '../src/modules/storage/clipStore';
import { clearSyntheticDatabase, seedSyntheticClips } from './helpers/syntheticDataset';

describe('metadata-first Library scale', () => {
  beforeEach(async () => clearSyntheticDatabase());

  it('indexes 100, 500 and 1000 metadata records without loading original image fields', async () => {
    for (const count of [100, 500, 1000]) {
      await clearSyntheticDatabase();
      await seedSyntheticClips(count);
      const started = performance.now(); const summaries = await listClipSummaries(); const elapsed = performance.now() - started;
      expect(summaries).toHaveLength(count); expect(summaries.every((item) => !('imageBlob' in item))).toBe(true); console.info(`[perf] ${count} summaries: ${elapsed.toFixed(1)}ms`);
      const stats = await getStorageStats(); expect(stats.clipCount).toBe(count); expect(stats.blobCount).toBe(count); expect(stats.originalBytes).toBeGreaterThanOrEqual(0);
    }
  });
});

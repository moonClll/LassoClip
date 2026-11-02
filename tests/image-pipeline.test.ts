import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { blobFromTransportPayload, blobToTransportPayload } from '../src/modules/media/blobTransport';
import { loadBlobImage } from '../src/modules/media/imageLoader';
import { describeBlob } from '../src/modules/media/imageDiagnostics';
import { DB_NAME, getClipImageBlob, getClipThumbnail, saveClip } from '../src/modules/storage/clipStore';
import type { ClipItemRecord } from '../src/types/capture';

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
}
function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((value) => new Uint8Array(value));
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer)); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob); });
}

function clip(): ClipItemRecord {
  return {
    id: 'image-pipeline', name: 'Image pipeline', imageBlob: new NodeBlob(['original-png-bytes'], { type: 'image/png' }) as unknown as Blob,
    thumbnailBlob: new NodeBlob(['thumbnail-webp-bytes'], { type: 'image/webp' }) as unknown as Blob,
    source: { url: 'https://example.test', title: 'Example', domain: 'example.test', capturedAt: 1 },
    selection: { type: 'rectangle', bounds: { x: 0, y: 0, width: 20, height: 10 }, coordinateSpace: 'image-px' },
    metadata: { width: 20, height: 10, format: 'image/png', createdAt: 1, updatedAt: 1 }, tags: [], favorite: false,
  };
}

describe('image persistence and runtime transport', () => {
  beforeEach(async () => { await deleteDatabase(); });

  it('round-trips PNG bytes through JSON-safe runtime payload', async () => {
    const source = new NodeBlob(['png-bytes'], { type: 'image/png' }) as unknown as Blob;
    const payload = await blobToTransportPayload(source);
    const jsonPayload = JSON.parse(JSON.stringify(payload));
    expect(jsonPayload).not.toHaveProperty('size');
    const restored = await blobFromTransportPayload(jsonPayload, 'test');
    expect(restored.type).toBe('image/png');
    expect(restored.size).toBe(source.size);
    expect(await readBytes(restored)).toEqual(await readBytes(source));
  });

  it('rejects malformed image transport data instead of storing a placeholder', async () => {
    await expect(blobFromTransportPayload({ image: {} }, 'test')).rejects.toThrow('不是有效的 Blob');
    expect(describeBlob({ id: 'legacy', imageBlob: {} })).toMatchObject({ exists: false });
  });

  it('stores and reads original and thumbnail blobs from clipBlobs', async () => {
    await saveClip(clip());
    const original = await getClipImageBlob('image-pipeline');
    const thumbnail = await getClipThumbnail('image-pipeline');
    expect(original?.type).toBe('image/png'); expect(original?.size).toBeGreaterThan(0);
    expect(thumbnail?.type).toBe('image/webp'); expect(thumbnail?.size).toBeGreaterThan(0);
  });
});

describe('blob URL lifecycle and image decode diagnostics', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  afterEach(() => { vi.restoreAllMocks(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; });

  it('revokes the URL when HTMLImageElement fails to decode', async () => {
    const revoke = vi.fn(); const create = vi.fn(() => 'blob:test-image');
    URL.createObjectURL = create; URL.revokeObjectURL = revoke;
    class FailingImage {
      decoding = 'async'; onload: (() => void) | null = null; onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal('Image', FailingImage);
    await expect(loadBlobImage(new NodeBlob(['bad'], { type: 'image/png' }) as unknown as Blob, 'broken')).rejects.toThrow('无法解码');
    expect(create).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledWith('blob:test-image');
  });

  it('resolves only after a decoded image reports natural dimensions', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:good-image'); URL.revokeObjectURL = vi.fn();
    class WorkingImage {
      decoding = 'async'; naturalWidth = 640; naturalHeight = 480; onload: (() => void) | null = null; onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', WorkingImage);
    const loaded = await loadBlobImage(new NodeBlob(['valid'], { type: 'image/png' }) as unknown as Blob, 'good');
    expect(loaded.url).toBe('blob:good-image'); expect(loaded.image.naturalWidth).toBe(640); expect(loaded.image.naturalHeight).toBe(480);
  });
});

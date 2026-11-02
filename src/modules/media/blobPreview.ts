import { getClipImageBlob, getClipThumbnail, saveClipThumbnail } from '../storage/clipStore';
import { describeBlob, diagnosticError, logImageDiagnostic } from './imageDiagnostics';
import { createBlobObjectUrl, revokeBlobObjectUrl } from './imageLoader';

const MAX_CONCURRENT_LOADS = 4;
let activeLoads = 0;
const queue: Array<() => void> = [];
const thumbnailUrls = new Map<string, string>();

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => { activeLoads += 1; void task().then(resolve, reject).finally(() => { activeLoads -= 1; queue.shift()?.(); }); };
    if (activeLoads < MAX_CONCURRENT_LOADS) run(); else queue.push(run);
  });
}

export async function getPreviewUrl(clipId: string, preferOriginal = false): Promise<string | undefined> {
  if (!preferOriginal && thumbnailUrls.has(clipId)) return thumbnailUrls.get(clipId);
  try {
    let blob = await schedule(async () => preferOriginal ? getClipImageBlob(clipId) : getClipThumbnail(clipId));
    let cacheable = !preferOriginal && Boolean(blob) && describeBlob(blob).exists;
    if (!preferOriginal && !describeBlob(blob).exists) {
      const original = await schedule(() => getClipImageBlob(clipId));
      if (original) {
        const generated = await createThumbnailBlob(original, clipId);
        blob = generated ?? original;
        cacheable = Boolean(generated);
        if (generated) void saveClipThumbnail(clipId, generated);
      }
    }
    if (!blob) { logImageDiagnostic({ stage: 'blob-read-missing', clipId, exists: false }); return undefined; }
    const url = createBlobObjectUrl(blob, clipId);
    if (cacheable) thumbnailUrls.set(clipId, url);
    return url;
  } catch (error) {
    logImageDiagnostic({ stage: 'preview-failed', clipId, exists: false, error: diagnosticError(error) });
    return undefined;
  }
}

async function createThumbnailBlob(source: Blob, clipId?: string): Promise<Blob | undefined> {
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(source);
      const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const result = await new Promise<Blob | undefined>((resolve) => canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/webp', .82));
      logImageDiagnostic({ stage: 'thumbnail-generated', clipId, ...describeBlob(result) });
      return result;
    } catch (error) {
      logImageDiagnostic({ stage: 'thumbnail-decode-failed', clipId, ...describeBlob(source), error: diagnosticError(error) });
      return undefined;
    } finally { bitmap?.close(); }
  }
  return undefined;
}

export function clearPreviewCache(): void {
  for (const url of thumbnailUrls.values()) revokeBlobObjectUrl(url);
  thumbnailUrls.clear();
}

/** Releases a one-off original/fallback URL while keeping cached thumbnails alive. */
export function releasePreviewUrl(url: string): void {
  if (!url || [...thumbnailUrls.values()].includes(url)) return;
  revokeBlobObjectUrl(url);
}

window.addEventListener('pagehide', clearPreviewCache);

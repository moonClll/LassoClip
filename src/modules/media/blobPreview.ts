import { getClipImageBlob, getClipThumbnail, saveClipThumbnail } from '../storage/clipStore';

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
  let blob = await schedule(async () => preferOriginal ? getClipImageBlob(clipId) : getClipThumbnail(clipId));
  let cacheable = !preferOriginal && Boolean(blob);
  if (!preferOriginal && !blob) {
    const original = await schedule(() => getClipImageBlob(clipId));
    if (original) {
      const generated = await createThumbnailBlob(original);
      blob = generated ?? original;
      cacheable = Boolean(generated);
      if (generated) void saveClipThumbnail(clipId, generated);
    }
  }
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  if (cacheable) thumbnailUrls.set(clipId, url);
  return url;
}

async function createThumbnailBlob(source: Blob): Promise<Blob | undefined> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(source); const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/webp', .82));
  }
  return undefined;
}

export function clearPreviewCache(): void {
  for (const url of thumbnailUrls.values()) URL.revokeObjectURL(url);
  thumbnailUrls.clear();
}

window.addEventListener('pagehide', clearPreviewCache, { once: true });

import { describeBlob, diagnosticError, logImageDiagnostic } from './imageDiagnostics';

export interface LoadedBlobImage { image: HTMLImageElement; url: string; }

export function createBlobObjectUrl(blob: Blob, clipId?: string): string {
  const details = describeBlob(blob);
  if (!details.exists) {
    logImageDiagnostic({ stage: 'url-create-failed', clipId, ...details, error: 'Blob 不存在或为空' });
    throw new Error('图片 Blob 不存在或为空');
  }
  try {
    const url = URL.createObjectURL(blob);
    logImageDiagnostic({ stage: 'url-created', clipId, ...details, urlCreated: true });
    return url;
  } catch (error) {
    logImageDiagnostic({ stage: 'url-create-failed', clipId, ...details, error: diagnosticError(error) });
    throw error;
  }
}

export function revokeBlobObjectUrl(url: string, clipId?: string): void {
  if (!url) return;
  URL.revokeObjectURL(url);
  logImageDiagnostic({ stage: 'url-revoked', clipId, exists: true, urlRevoked: true });
}

export function loadBlobImage(blob: Blob, clipId?: string): Promise<LoadedBlobImage> {
  const url = createBlobObjectUrl(blob, clipId);
  return new Promise((resolve, reject) => {
    const image = new Image(); image.decoding = 'async';
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return; settled = true; revokeBlobObjectUrl(url, clipId);
      logImageDiagnostic({ stage: 'decode-failed', clipId, ...describeBlob(blob), error: diagnosticError(error) });
      reject(error instanceof Error ? error : new Error('图片解码失败'));
    };
    image.onload = () => {
      if (settled) return; settled = true;
      logImageDiagnostic({ stage: 'decode-success', clipId, ...describeBlob(blob), width: image.naturalWidth, height: image.naturalHeight });
      resolve({ image, url });
    };
    image.onerror = () => fail(new Error('HTMLImageElement 无法解码图片 Blob'));
    try { image.src = url; } catch (error) { fail(error); }
  });
}

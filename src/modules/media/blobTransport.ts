import { describeBlob, diagnosticError, logImageDiagnostic } from './imageDiagnostics';
import type { BlobTransportPayload, CaptureBlobPayload } from '../../types/capture';

/** JSON-safe payload used across extension runtime message boundaries. */
// Chrome limits an individual extension message to roughly 64 MiB. Base64
// expands bytes by 4/3, so leave headroom for the envelope and metadata.
export const MAX_TRANSPORT_BYTES = 32 * 1024 * 1024;

function isNativeBlob(value: unknown): value is Blob {
  return Boolean(value) && typeof value === 'object' && typeof (value as Blob).size === 'number' && typeof (value as Blob).type === 'string'
    && (typeof (value as Blob).arrayBuffer === 'function' || typeof FileReader !== 'undefined');
}
function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error ?? new Error('Blob 读取失败')); reader.readAsArrayBuffer(blob);
  });
}
function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) result += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunkSize)));
  return btoa(result);
}
function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function blobToTransportPayload(blob: Blob): Promise<BlobTransportPayload> {
  if (!isNativeBlob(blob) || blob.size <= 0) throw new Error('截图图片数据不是有效的 Blob');
  if (blob.size > MAX_TRANSPORT_BYTES) throw new Error(`截图图片过大（${Math.round(blob.size / 1024 / 1024)} MB），无法通过扩展消息传输`);
  const bytes = new Uint8Array(await readBlobArrayBuffer(blob));
  const payload: BlobTransportPayload = { kind: 'lassoclip-blob', mimeType: blob.type || 'application/octet-stream', byteLength: bytes.byteLength, base64: bytesToBase64(bytes) };
  logImageDiagnostic({ stage: 'transport-serialize', ...describeBlob(blob) });
  return payload;
}

export async function blobFromTransportPayload(value: CaptureBlobPayload | unknown, context = 'capture'): Promise<Blob> {
  if (isNativeBlob(value)) {
    if (value.size <= 0) throw new Error(`${context} 图片 Blob 为空`);
    logImageDiagnostic({ stage: 'transport-deserialize', ...describeBlob(value) });
    return value;
  }
  const payload = value as Partial<BlobTransportPayload> | undefined;
  if (payload?.kind !== 'lassoclip-blob' || typeof payload.base64 !== 'string' || typeof payload.mimeType !== 'string' || typeof payload.byteLength !== 'number') throw new Error(`${context} 图片数据不是有效的 Blob 传输负载`);
  if (payload.byteLength <= 0 || payload.byteLength > MAX_TRANSPORT_BYTES) throw new Error(`${context} 图片字节数无效`);
  let bytes: Uint8Array;
  try { bytes = base64ToBytes(payload.base64); } catch (error) { throw new Error(`${context} 图片 Base64 校验失败：${diagnosticError(error)}`); }
  if (bytes.byteLength !== payload.byteLength) throw new Error(`${context} 图片字节数校验失败`);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([buffer], { type: payload.mimeType });
  logImageDiagnostic({ stage: 'transport-deserialize', ...describeBlob(blob) });
  return blob;
}

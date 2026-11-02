export interface ImageDiagnostic {
  stage: string;
  clipId?: string;
  exists: boolean;
  mimeType?: string;
  byteSize?: number;
  width?: number;
  height?: number;
  urlCreated?: boolean;
  urlRevoked?: boolean;
  error?: string;
}

/** Metadata only: no image bytes, URLs, or source page contents are logged. */
export function logImageDiagnostic(event: ImageDiagnostic): void {
  if (typeof console !== 'undefined' && typeof console.debug === 'function') console.debug('[LassoClip:image]', event);
}

export function describeBlob(value: unknown): Pick<ImageDiagnostic, 'exists' | 'mimeType' | 'byteSize'> {
  if (!value || typeof value !== 'object') return { exists: false };
  const candidate = value as { size?: unknown; type?: unknown };
  const byteSize = typeof candidate.size === 'number' ? candidate.size : undefined;
  const mimeType = typeof candidate.type === 'string' ? candidate.type : undefined;
  return { exists: byteSize !== undefined && byteSize > 0, mimeType, byteSize };
}

export function diagnosticError(error: unknown): string { return error instanceof Error ? error.message : String(error); }

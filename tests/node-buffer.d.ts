declare module 'node:buffer' {
  export const Blob: {
    new (parts?: BlobPart[], options?: BlobPropertyBag): Blob;
  };
}

declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: string): string;
}


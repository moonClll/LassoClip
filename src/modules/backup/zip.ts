const textEncoder = new TextEncoder();

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of data) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

export async function blobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  if (typeof blob.stream === 'function') {
    const reader = blob.stream().getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value);
      chunks.push(chunk); length += chunk.byteLength;
    }
    const result = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result.buffer;
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('读取 Blob 失败'));
    try { reader.readAsArrayBuffer(blob); } catch (error) {
      if (typeof Response !== 'undefined') void new Response(blob as unknown as BodyInit).arrayBuffer().then(resolve, reject);
      else reject(error);
    }
  });
}

export async function blobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取 Blob 文本失败'));
    try { reader.readAsText(blob); } catch (error) {
      if (typeof Response !== 'undefined') void new Response(blob as unknown as BodyInit).text().then(resolve, reject);
      else reject(error);
    }
  });
}

export async function sha256Hex(blob: Blob): Promise<string> {
  return sha256HexBytes(await blobArrayBuffer(blob));
}

export async function sha256HexBytes(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface ZipInputEntry { path: string; blob: Blob; crc?: number; size?: number; }
export interface ZipEntry { path: string; size: number; compressedSize: number; method: number; localOffset: number; }

function u16(value: number): Uint8Array { const result = new Uint8Array(2); new DataView(result.buffer).setUint16(0, value, true); return result; }
function u32(value: number): Uint8Array { const result = new Uint8Array(4); new DataView(result.buffer).setUint32(0, value >>> 0, true); return result; }
function concat(parts: Uint8Array[]): Uint8Array { const total = parts.reduce((sum, part) => sum + part.byteLength, 0); const result = new Uint8Array(total); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.byteLength; } return result; }

export async function createZip(entries: ZipInputEntry[]): Promise<Blob> {
  const parts: Array<Uint8Array | Blob> = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const names = new Set<string>();
  for (const entry of entries) {
    if (names.has(entry.path)) throw new Error(`ZIP 文件重复：${entry.path}`);
    names.add(entry.path);
    const name = textEncoder.encode(entry.path);
    const directBlob = typeof Blob !== 'undefined' && entry.blob instanceof Blob && entry.crc !== undefined && entry.size !== undefined;
    const data = directBlob ? undefined : new Uint8Array(await blobArrayBuffer(entry.blob));
    const crc = entry.crc ?? crc32(data!);
    const size = entry.size ?? data!.byteLength;
    const header = concat([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.byteLength), u16(0), name]);
    parts.push(header, directBlob ? entry.blob : data!);
    central.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.byteLength), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += header.byteLength + size;
  }
  const centralData = concat(central);
  parts.push(centralData, concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralData.byteLength), u32(offset), u16(0)]));
  return new Blob(parts as BlobPart[], { type: 'application/zip' });
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(index, true) === 0x06054b50) return index;
  }
  throw new Error('无效 ZIP：找不到目录结束标记');
}

export class ZipArchive {
  private readonly entries = new Map<string, ZipEntry>();
  private constructor(private readonly blob: Blob) {}

  static async open(blob: Blob): Promise<ZipArchive> {
    const archive = new ZipArchive(blob);
    const tailSize = Math.min(blob.size, 65557);
    const tail = new Uint8Array(await blobArrayBuffer(blob.slice(blob.size - tailSize)));
    const tailView = new DataView(tail.buffer);
    const eocd = findEndOfCentralDirectory(tail);
    const count = tailView.getUint16(eocd + 10, true);
    const centralSize = tailView.getUint32(eocd + 12, true);
    const centralOffset = tailView.getUint32(eocd + 16, true);
    if (centralOffset + centralSize > blob.size) throw new Error('无效 ZIP：目录越界');
    const central = new Uint8Array(await blobArrayBuffer(blob.slice(centralOffset, centralOffset + centralSize)));
    const view = new DataView(central.buffer);
    let offset = 0;
    for (let i = 0; i < count; i += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('无效 ZIP：目录项损坏');
      const flags = view.getUint16(offset + 8, true);
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const size = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      if ((flags & 1) !== 0 || method !== 0) throw new Error('暂不支持加密或压缩 ZIP');
      const path = new TextDecoder().decode(central.slice(offset + 46, offset + 46 + nameLength));
      if (!path || archive.entries.has(path) || localOffset + 30 > blob.size) throw new Error('无效 ZIP：文件路径或偏移异常');
      archive.entries.set(path, { path, size, compressedSize, method, localOffset });
      offset += 46 + nameLength + extraLength + commentLength;
      if (offset > central.length) throw new Error('无效 ZIP：目录越界');
    }
    return archive;
  }

  list(): ZipEntry[] { return [...this.entries.values()]; }
  has(path: string): boolean { return this.entries.has(path); }
  async getEntry(path: string): Promise<Blob> {
    const entry = this.entries.get(path);
    if (!entry) throw new Error(`ZIP 中缺少文件：${path}`);
    const header = new Uint8Array(await blobArrayBuffer(this.blob.slice(entry.localOffset, entry.localOffset + 30)));
    const view = new DataView(header.buffer);
    if (view.getUint32(0, true) !== 0x04034b50) throw new Error(`ZIP 文件头损坏：${path}`);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const start = entry.localOffset + 30 + nameLength + extraLength;
    return this.blob.slice(start, start + entry.compressedSize);
  }
}

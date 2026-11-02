import type { ClipItemSummary } from '../../types/capture';
import type { ClipProject } from '../../types/editor';
import type { CollectionRecord, TagRecord } from '../../types/library';
import { getClipImageBlob, getClipThumbnail, listClipSummaries, listProjects } from '../storage/clipStore';
import { listCollections, listTags } from '../storage/libraryStore';
import { clearRestoreStaging, commitRestoreStaging, stageRestoreBlob, stageRestoreClip, stageRestoreCollection, stageRestoreMeta, stageRestoreProject, stageRestoreTag } from '../storage/restoreStore';
import { blobArrayBuffer, blobText, createZip, crc32, sha256Hex, sha256HexBytes, type ZipInputEntry, ZipArchive } from './zip';

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_SCHEMA_VERSION = 5;
export const APP_VERSION = '0.1.0';

export interface BackupFileInfo { path: string; kind: 'clip' | 'original' | 'thumbnail' | 'project' | 'tag' | 'collection'; id: string; size: number; sha256: string; mime?: string; }
export interface BackupManifest {
  backupFormatVersion: number;
  appVersion: string;
  schemaVersion: number;
  createdAt: number;
  counts: { clips: number; projects: number; tags: number; collections: number; blobs: number };
  files: BackupFileInfo[];
}

export interface BackupProgress { phase: 'reading' | 'validating' | 'staging' | 'committing'; completed: number; total: number; label?: string; }
export interface BackupResult { blob: Blob; manifest: BackupManifest; }
export interface BackupPreview { manifest: BackupManifest; archiveFiles: number; }

function jsonBlob(value: unknown): Blob { return new Blob([JSON.stringify(value)], { type: 'application/json' }); }
async function parseJson<T>(blob: Blob): Promise<T> { return JSON.parse(await blobText(blob)) as T; }
function checkSignal(signal?: AbortSignal): void { if (signal?.aborted) throw new DOMException('操作已取消', 'AbortError'); }
function progress(onProgress: ((value: BackupProgress) => void) | undefined, value: BackupProgress): void { onProgress?.(value); }

function expectedPath(kind: BackupFileInfo['kind'], id: string): string {
  if (kind === 'clip') return `clips/${id}.json`;
  if (kind === 'original') return `blobs/${id}/original`;
  if (kind === 'thumbnail') return `blobs/${id}/thumbnail`;
  if (kind === 'project') return `projects/${id}.json`;
  if (kind === 'tag') return `tags/${id}.json`;
  return `collections/${id}.json`;
}

function validateManifest(manifest: BackupManifest): void {
  if (!manifest || manifest.backupFormatVersion !== BACKUP_FORMAT_VERSION) throw new Error('不支持的备份格式版本');
  if (manifest.schemaVersion > BACKUP_SCHEMA_VERSION) throw new Error(`备份来自更新的数据结构 v${manifest.schemaVersion}`);
  if (!manifest.counts || !Array.isArray(manifest.files)) throw new Error('备份 Manifest 缺少必要字段');
  const paths = new Set<string>();
  for (const file of manifest.files) {
    if (!file.path || paths.has(file.path) || file.path !== expectedPath(file.kind, file.id)) throw new Error(`Manifest 文件记录无效：${file.path}`);
    if (!Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/i.test(file.sha256)) throw new Error(`Manifest 校验字段无效：${file.path}`);
    paths.add(file.path);
  }
  const count = (kind: BackupFileInfo['kind']) => manifest.files.filter((file) => file.kind === kind).length;
  if (count('clip') !== manifest.counts.clips || count('project') !== manifest.counts.projects || count('tag') !== manifest.counts.tags || count('collection') !== manifest.counts.collections) throw new Error('Manifest 数量与文件记录不一致');
  if (count('original') !== manifest.counts.blobs || count('original') !== count('clip')) throw new Error('备份缺少完整原图');
}

export async function createBackup(onProgress?: (value: BackupProgress) => void, signal?: AbortSignal): Promise<BackupResult> {
  checkSignal(signal);
  const clips = await listClipSummaries();
  const projects = await listProjects();
  const tags = await listTags();
  const collections = await listCollections();
  const thumbnailAvailability = new Map<string, boolean>();
  for (const clip of clips) thumbnailAvailability.set(clip.id, Boolean(await getClipThumbnail(clip.id)));
  const total = clips.length * 2 + [...thumbnailAvailability.values()].filter(Boolean).length + projects.length + tags.length + collections.length;
  let completed = 0;
  const entries: ZipInputEntry[] = [];
  const files: BackupFileInfo[] = [];
  const add = async (path: string, kind: BackupFileInfo['kind'], id: string, blob: Blob) => {
    checkSignal(signal);
    progress(onProgress, { phase: 'reading', completed, total, label: path });
    const bytes = await blobArrayBuffer(blob);
    const digest = await sha256HexBytes(bytes);
    const size = bytes.byteLength;
    files.push({ path, kind, id, size, sha256: digest, mime: blob.type || undefined });
    entries.push({ path, blob, crc: crc32(new Uint8Array(bytes)), size });
    completed += 1;
  };
  for (const clip of clips) {
    await add(expectedPath('clip', clip.id), 'clip', clip.id, jsonBlob(clip));
    const original = await getClipImageBlob(clip.id);
    if (!original) throw new Error(`素材 ${clip.id} 缺少原图，无法备份`);
    await add(expectedPath('original', clip.id), 'original', clip.id, original);
    const thumbnail = thumbnailAvailability.get(clip.id) ? await getClipThumbnail(clip.id) : undefined;
    if (thumbnail) await add(expectedPath('thumbnail', clip.id), 'thumbnail', clip.id, thumbnail);
  }
  for (const project of projects) await add(expectedPath('project', project.id), 'project', project.id, jsonBlob(project));
  for (const tag of tags) await add(expectedPath('tag', tag.id), 'tag', tag.id, jsonBlob(tag));
  for (const collection of collections) await add(expectedPath('collection', collection.id), 'collection', collection.id, jsonBlob(collection));
  const manifest: BackupManifest = { backupFormatVersion: BACKUP_FORMAT_VERSION, appVersion: APP_VERSION, schemaVersion: BACKUP_SCHEMA_VERSION, createdAt: Date.now(), counts: { clips: clips.length, projects: projects.length, tags: tags.length, collections: collections.length, blobs: clips.length }, files };
  entries.unshift({ path: 'manifest.json', blob: jsonBlob(manifest) });
  return { blob: await createZip(entries), manifest };
}

export async function inspectBackup(blob: Blob): Promise<BackupPreview> {
  const archive = await ZipArchive.open(blob);
  if (!archive.has('manifest.json')) throw new Error('备份缺少 manifest.json');
  const manifest = await parseJson<BackupManifest>(await archive.getEntry('manifest.json'));
  validateManifest(manifest);
  return { manifest, archiveFiles: archive.list().length };
}

async function readAndVerify(archive: ZipArchive, info: BackupFileInfo): Promise<Blob> {
  const entry = await archive.getEntry(info.path);
  if (entry.size !== info.size) throw new Error(`备份文件大小校验失败：${info.path}`);
  if (await sha256Hex(entry) !== info.sha256.toLowerCase()) throw new Error(`备份文件 SHA-256 校验失败：${info.path}`);
  return entry;
}

function byPath(manifest: BackupManifest): Map<string, BackupFileInfo> { return new Map(manifest.files.map((file) => [file.path, file])); }

export async function restoreFullBackup(blob: Blob, options: { signal?: AbortSignal; onProgress?: (value: BackupProgress) => void; onSafetyBackup?: (backup: BackupResult) => void | Promise<void> } = {}): Promise<{ manifest: BackupManifest; safetyBackup: BackupResult }> {
  const preview = await inspectBackup(blob);
  const archive = await ZipArchive.open(blob);
  const safetyBackup = await createBackup(undefined, options.signal);
  await options.onSafetyBackup?.(safetyBackup);
  const files = byPath(preview.manifest);
  const clips = new Map<string, ClipItemSummary>();
  const projects: ClipProject[] = [];
  const collections: CollectionRecord[] = [];
  try {
    checkSignal(options.signal);
    await clearRestoreStaging();
    await stageRestoreMeta(preview.manifest);
    const total = preview.manifest.files.length;
    let completed = 0;
    const update = (label: string) => { completed += 1; progress(options.onProgress, { phase: 'staging', completed, total, label }); };
    for (const info of preview.manifest.files.filter((file) => file.kind === 'clip')) {
      checkSignal(options.signal);
      const clip = await parseJson<ClipItemSummary>(await readAndVerify(archive, info));
      if (clip.id !== info.id || !clip.name || !Array.isArray(clip.tags)) throw new Error(`素材元数据无效：${info.path}`);
      const originalInfo = files.get(expectedPath('original', info.id));
      if (!originalInfo) throw new Error(`备份缺少原图：${info.id}`);
      const original = await readAndVerify(archive, originalInfo);
      const thumbnailInfo = files.get(expectedPath('thumbnail', info.id));
      const thumbnail = thumbnailInfo ? await readAndVerify(archive, thumbnailInfo) : undefined;
      await stageRestoreClip(clip);
      await stageRestoreBlob({ id: info.id, imageBlob: original, thumbnailBlob: thumbnail, hasThumbnail: Boolean(thumbnail) });
      clips.set(clip.id, clip);
      update(info.path);
      update(originalInfo.path);
      if (thumbnailInfo) update(thumbnailInfo.path);
    }
    for (const info of preview.manifest.files.filter((file) => ['project', 'tag', 'collection'].includes(file.kind))) {
      checkSignal(options.signal);
      const value = await parseJson<ClipProject | TagRecord | CollectionRecord>(await readAndVerify(archive, info));
      if ((value as { id?: string }).id !== info.id) throw new Error(`数据 ID 无效：${info.path}`);
      if (info.kind === 'project') { const project = value as ClipProject; projects.push(project); await stageRestoreProject(project); }
      else if (info.kind === 'tag') await stageRestoreTag(value as TagRecord);
      else { const collection = value as CollectionRecord; collections.push(collection); await stageRestoreCollection(collection); }
      update(info.path);
    }
    for (const project of projects) for (const clipId of project.items.filter((item) => item.type === 'image').map((item) => item.clipId)) if (!clips.has(clipId)) throw new Error(`项目 ${project.name} 引用了不存在的素材 ${clipId}`);
    for (const collection of collections) {
      if (collection.coverClipId && !clips.has(collection.coverClipId)) throw new Error(`Collection ${collection.name} 的封面素材不存在`);
      if (collection.clipIds.some((clipId) => !clips.has(clipId))) throw new Error(`Collection ${collection.name} 引用了不存在的素材`);
    }
    checkSignal(options.signal);
    progress(options.onProgress, { phase: 'committing', completed: total, total, label: '提交恢复数据' });
    await commitRestoreStaging();
    // The primary transaction is already committed. Staging cleanup is best effort so a
    // cleanup failure cannot report a false restore failure after data is safely replaced.
    await clearRestoreStaging().catch(() => undefined);
    return { manifest: preview.manifest, safetyBackup };
  } catch (error) {
    await clearRestoreStaging().catch(() => undefined);
    throw error;
  }
}

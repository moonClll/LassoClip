import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import type { ClipItemRecord } from '../src/types/capture';
import { createDefaultProject } from '../src/types/editor';
import { createBackup, inspectBackup, restoreFullBackup } from '../src/modules/backup/backupService';
import { blobText, createZip, ZipArchive } from '../src/modules/backup/zip';
import { DB_NAME, createProject, getClip, openDatabase, saveClip } from '../src/modules/storage/clipStore';
import { addClipsToCollection, createCollection, createTag, listCollections, listTags } from '../src/modules/storage/libraryStore';

function deleteDatabase(): Promise<void> { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('database blocked')); }); }
function clip(id: string, image = 'original', thumbnail = 'thumb'): ClipItemRecord { return { id, name: `Clip ${id}`, imageBlob: new NodeBlob([image], { type: 'image/png' }) as unknown as Blob, thumbnailBlob: new NodeBlob([thumbnail], { type: 'image/webp' }) as unknown as Blob, source: { url: 'https://example.com/article', title: 'Article', domain: 'example.com', capturedAt: 100 }, selection: { type: 'rectangle', bounds: { x: 0, y: 0, width: 20, height: 10 }, coordinateSpace: 'image-px' }, metadata: { width: 20, height: 10, format: 'image/png', createdAt: 100, updatedAt: 100 }, tags: ['research'], notes: 'note', favorite: true }; }

describe('Phase 3.4 backup and recovery', () => {
  beforeEach(async () => deleteDatabase());

  it('exports a versioned ZIP with metadata and verifiable Blob entries', async () => {
    await saveClip(clip('one')); await saveClip(clip('two', 'large image '.repeat(10000), 'small thumb'));
    const tag = await createTag('Research', '#a78bfa'); const collection = await createCollection('Reading', 'saved articles'); await addClipsToCollection(collection.id, ['one', 'two']);
    const project = createDefaultProject('Research board'); project.items.push({ id: 'image-layer', type: 'image', clipId: 'one', transform: { x: 0, y: 0, width: 200, height: 100, rotation: 12, opacity: 1 }, zIndex: 0, visible: true, locked: false, style: { cornerRadius: 8 } }); project.annotations.push({ id: 'annotation', type: 'text', text: 'Read this', transform: { x: 10, y: 10, width: 100, height: 30, rotation: 0, opacity: 1 }, zIndex: 1, visible: true, locked: false, style: { fill: '#fff', fontSize: 16, fontFamily: 'sans-serif' } }); project.redactions.push({ id: 'redaction', type: 'solid', zIndex: 2, visible: true, locked: false, bounds: { x: 2, y: 2, width: 10, height: 10 }, transform: { x: 2, y: 2, width: 10, height: 10, rotation: 0, opacity: 1 }, style: { color: '#000', opacity: 1 } }); await createProject(project);
    const result = await createBackup(); const preview = await inspectBackup(result.blob);
    expect(preview.manifest.backupFormatVersion).toBe(1); expect(preview.manifest.schemaVersion).toBe(5); expect(preview.manifest.counts).toMatchObject({ clips: 2, projects: 1, tags: 1, collections: 1, blobs: 2 });
    expect(JSON.stringify(preview.manifest)).not.toContain('data:image'); expect(preview.manifest.files.every((file) => file.sha256.length === 64)).toBe(true);
    const archive = await ZipArchive.open(result.blob); const original = await archive.getEntry('blobs/two/original'); expect(await blobText(original)).toContain('large image'); expect(original.size).toBeGreaterThan(100000);
    expect(tag.name).toBe('research');
  });

  it('restores all v5 relations and replaces the current dataset atomically', async () => {
    await saveClip(clip('source')); await createTag('Research', '#a78bfa'); const collection = await createCollection('Source set'); await addClipsToCollection(collection.id, ['source']); const project = createDefaultProject('Source project'); project.items.push({ id: 'layer', type: 'image', clipId: 'source', transform: { x: 0, y: 0, width: 20, height: 10, rotation: 0, opacity: 1 }, zIndex: 0, visible: true, locked: false, style: { cornerRadius: 0 } }); await createProject(project);
    const backup = await createBackup(); await saveClip({ ...clip('source'), name: 'Conflicting current record' }); await saveClip(clip('sentinel'));
    let safetyBackupSize = 0; const restored = await restoreFullBackup(backup.blob, { onSafetyBackup: (safety) => { safetyBackupSize = safety.blob.size; } }); expect(safetyBackupSize).toBeGreaterThan(0); expect(restored.manifest.counts.clips).toBe(1); expect((await getClip('source'))?.name).toBe('Clip source'); expect(await getClip('sentinel')).toBeUndefined(); expect((await listCollections())[0].clipIds).toEqual(['source']); expect((await listTags()).map((tag) => tag.name)).toEqual(['research']);
    expect((await getClip('source'))?.imageBlob).toBeDefined(); expect(backup.manifest.files.find((file) => file.path === 'blobs/source/original')?.size).toBeGreaterThan(0);
  });

  it('rejects a corrupted file before commit and keeps existing data', async () => {
    await saveClip(clip('stable')); const backup = await createBackup(); const archive = await ZipArchive.open(backup.blob); const entries = await Promise.all(archive.list().map(async (entry) => ({ path: entry.path, blob: entry.path === 'blobs/stable/original' ? new NodeBlob(['tampered'], { type: 'image/png' }) : await archive.getEntry(entry.path) }))); const corrupted = await createZip(entries);
    await expect(restoreFullBackup(corrupted)).rejects.toThrow('SHA-256'); expect(await getClip('stable')).toBeDefined();
  });
});

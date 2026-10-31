import 'fake-indexeddb/auto';
import type { ClipItemRecord } from '../src/types/capture';
import { createDefaultProject, type ClipProject } from '../src/types/editor';
import { DB_NAME, createProject, deleteProject, duplicateProject, getClip, getProject, listProjects, saveClip } from '../src/modules/storage/clipStore';
import { addClipsToProject } from '../src/modules/storage/libraryStore';

function deleteDatabase(): Promise<void> { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('database blocked')); }); }
function clip(id: string): ClipItemRecord { return { id, name: `Clip ${id}`, imageBlob: new Blob([id], { type: 'image/png' }), source: { url: `https://${id}.example.com`, title: id, domain: `${id}.example.com`, capturedAt: 10 }, selection: { type: 'rectangle', bounds: { x: 0, y: 0, width: 20, height: 20 }, coordinateSpace: 'image-px' }, metadata: { width: 20, height: 20, format: 'image/png', createdAt: 10, updatedAt: 10 }, tags: [], favorite: false }; }
function imageItem(id: string, clipId: string) { return { id, type: 'image' as const, clipId, transform: { x: 0, y: 0, width: 20, height: 20, rotation: 0, opacity: 1 }, zIndex: 0, visible: true, locked: false, style: { cornerRadius: 0 } }; }

describe('Capture → Library → Studio workflow data contracts', () => {
  beforeEach(async () => deleteDatabase());

  it('adds multiple real ClipItems to a project, auto-layouts them, and avoids duplicate references', async () => {
    await saveClip(clip('one')); await saveClip(clip('two'));
    const project = createDefaultProject('Workflow'); project.items.push(imageItem('existing', 'one')); await createProject(project);
    const updated = await addClipsToProject(project.id, ['one', 'two', 'two']);
    expect(updated.items.filter((item) => item.type === 'image').map((item) => item.clipId)).toEqual(['one', 'two']);
    expect(new Set(updated.items.map((item) => `${item.transform.x}:${item.transform.y}`)).size).toBe(updated.items.length);
    expect((await getProject(project.id))?.items).toHaveLength(2);
  });

  it('copies a project by reference only, then deleting projects keeps original ClipItems', async () => {
    await saveClip(clip('one'));
    const project = createDefaultProject('Original'); project.items.push(imageItem('item', 'one')); await createProject(project);
    const copy = await duplicateProject(project.id);
    expect(copy.id).not.toBe(project.id); expect(copy.items[0].id).not.toBe(project.items[0].id); expect(copy.items[0]).toMatchObject({ clipId: 'one' });
    await deleteProject(project.id); await deleteProject(copy.id);
    expect(await listProjects()).toHaveLength(0); expect(await getClip('one')).toBeDefined();
  });
});

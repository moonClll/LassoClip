import 'fake-indexeddb/auto';
import type { ClipItemRecord } from '../src/types/capture';
import { createDefaultProject, type ClipProject } from '../src/types/editor';
import { DB_NAME, CLIP_STORE_NAME, DB_VERSION, PROJECT_STORE_NAME, ClipReferenceError, ProjectReferenceError, createProject, deleteClip, deleteProject, getClip, getProject, listClips, listProjects, openDatabase, saveClip, saveProject, loadProjectWithClips } from '../src/modules/storage/clipStore';
import { DEFAULT_PROJECT_NAME, normalizeProjectName } from '../src/modules/projects/projectName';

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('test database is blocked'));
  });
}

function makeClip(id: string): ClipItemRecord {
  return {
    id,
    name: `Clip ${id}`,
    imageBlob: new Blob(['png'], { type: 'image/png' }),
    source: { url: 'https://example.com', title: 'Example', domain: 'example.com', capturedAt: 1 },
    selection: { type: 'rectangle', bounds: { x: 0, y: 0, width: 10, height: 10 }, coordinateSpace: 'image-px' },
    metadata: { width: 10, height: 10, format: 'image/png', createdAt: 1, updatedAt: 1 },
    tags: [],
    favorite: false,
  };
}

function imageItem(id: string, clipId: string) {
  return {
    id,
    type: 'image' as const,
    clipId,
    transform: { x: 20, y: 30, width: 100, height: 100, rotation: 0, opacity: 1 },
    zIndex: 0,
    visible: true,
    locked: false,
    style: { cornerRadius: 0 },
  };
}

describe('IndexedDB v2 project storage', () => {
  beforeEach(async () => deleteDatabase());

  it('migrates a v1 clips store without losing the existing Blob', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(CLIP_STORE_NAME, { keyPath: 'id' });
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(CLIP_STORE_NAME, 'readwrite');
        transaction.objectStore(CLIP_STORE_NAME).put(makeClip('legacy'));
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });

    const project = createDefaultProject('迁移项目', 10);
    await createProject(project);
    const clips = await listClips();
    expect(clips).toHaveLength(1);
    expect(clips[0].id).toBe('legacy');
    // fake-indexeddb in jsdom represents cross-realm Blob clones as a plain object;
    // the important migration invariant here is that the imageBlob field survives.
    expect(clips[0]).toHaveProperty('imageBlob');
    expect(clips[0].imageBlob).toBeDefined();
    const database = await openDatabase();
    expect(database.version).toBe(DB_VERSION);
    expect([...database.objectStoreNames]).toEqual(expect.arrayContaining([CLIP_STORE_NAME, PROJECT_STORE_NAME]));
    expect(database.transaction(PROJECT_STORE_NAME, 'readonly').objectStore(PROJECT_STORE_NAME).indexNames).toContain('updatedAt');
    database.close();
  });

  it('creates, reads, updates, lists and deletes projects by id', async () => {
    const project = createDefaultProject('第一个项目', 10);
    await createProject(project);
    expect(await getProject(project.id)).toEqual(project);
    const updated: ClipProject = { ...project, name: '已更新', updatedAt: 20 };
    await saveProject(updated);
    expect((await listProjects())[0].name).toBe('已更新');
    await deleteProject(project.id);
    expect(await getProject(project.id)).toBeUndefined();
  });

  it('normalizes project names and preserves the renamed project across reloads', async () => {
    expect(normalizeProjectName('  新名称  ')).toBe('新名称');
    expect(normalizeProjectName('   ')).toBeUndefined();
    expect(DEFAULT_PROJECT_NAME).toBe('未命名项目');
    const project = createDefaultProject(DEFAULT_PROJECT_NAME, 10);
    await createProject(project);
    await saveProject({ ...project, name: normalizeProjectName('  设计稿  ')!, updatedAt: 20 });
    expect((await getProject(project.id))?.name).toBe('设计稿');
    expect((await listProjects())[0].id).toBe(project.id);
  });

  it('persists only clip references and resolves the associated ClipItems', async () => {
    const clip = makeClip('clip-1');
    await saveClip(clip);
    const project = createDefaultProject('关联项目', 10);
    project.items.push(imageItem('item-1', clip.id));
    await saveProject(project);
    const loaded = await loadProjectWithClips(project.id);
    expect(loaded?.project.items[0]).toMatchObject({ clipId: 'clip-1' });
    expect(loaded?.clips.get('clip-1')).toHaveProperty('imageBlob');
  });

  it('rejects missing clip references and does not persist the invalid project', async () => {
    const project = createDefaultProject('无效项目', 10);
    project.items.push(imageItem('item-1', 'missing'));
    await expect(saveProject(project)).rejects.toBeInstanceOf(ProjectReferenceError);
    expect(await listProjects()).toHaveLength(0);
  });

  it('blocks deletion while a project references the clip, then allows it after project removal', async () => {
    await saveClip(makeClip('referenced'));
    const project = createDefaultProject('引用素材的项目', 10);
    project.items.push(imageItem('item-1', 'referenced'));
    await saveProject(project);
    await expect(deleteClip('referenced')).rejects.toBeInstanceOf(ClipReferenceError);
    expect(await getClip('referenced')).toBeDefined();
    await deleteProject(project.id);
    await deleteClip('referenced');
    expect(await getClip('referenced')).toBeUndefined();
  });
});

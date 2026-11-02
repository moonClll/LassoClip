import 'fake-indexeddb/auto';
import { assignProjectCaptureContext, createProjectCaptureContext, isProjectCaptureContextActive, migrateLegacyProjectCaptureContext, migrateSingleProjectCaptureContext, projectCaptureScope, pruneProcessedCaptureLedger, removeProjectCaptureContext, sameProjectCaptureSession } from '../src/modules/capture/projectCapture';
import { resolveCaptureRequestTarget } from '../src/modules/capture/captureRequest';
import { persistCapturedClip } from '../src/modules/storage/captureWorkflow';
import { DB_NAME, createProject, getClip, getProject } from '../src/modules/storage/clipStore';
import { createDefaultProject } from '../src/types/editor';
import type { ClipItemRecord } from '../src/types/capture';

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('database blocked'));
  });
}

function clip(id: string): ClipItemRecord {
  return { id, name: id, imageBlob: new Blob([id], { type: 'image/png' }), source: { url: 'https://example.com', title: 'Example', domain: 'example.com', capturedAt: 1 }, selection: { type: 'rectangle', bounds: { x: 0, y: 0, width: 20, height: 20 }, coordinateSpace: 'image-px' }, metadata: { width: 20, height: 20, format: 'image/png', createdAt: 1, updatedAt: 1 }, tags: [], favorite: false };
}

describe('Project Capture Mode contracts', () => {
  beforeEach(async () => deleteDatabase());

  it('uses a bounded, session-specific context that expires', () => {
    const context = createProjectCaptureContext('project-1', 1000);
    expect(isProjectCaptureContextActive(context, 1000)).toBe(true);
    expect(isProjectCaptureContextActive(context, context.expiresAt)).toBe(false);
    expect(sameProjectCaptureSession(context, { ...context, sessionId: 'other' })).toBe(false);
    expect(sameProjectCaptureSession(context, { ...context })).toBe(true);
    expect(projectCaptureScope(7)).toBe('window:7');
    expect(projectCaptureScope()).toBe('global');
  });

  it('isolates contexts for separate browser windows and migrates legacy scope once', () => {
    const first = createProjectCaptureContext('project-a', 1000);
    const second = createProjectCaptureContext('project-b', 1000);
    const scoped = assignProjectCaptureContext(assignProjectCaptureContext({}, 1, first), 2, second);
    expect(scoped['window:1'].projectId).toBe('project-a');
    expect(scoped['window:2'].projectId).toBe('project-b');
    expect(removeProjectCaptureContext(scoped, 1)['window:2']).toEqual(second);
    const migrated = migrateLegacyProjectCaptureContext({ global: first }, 9);
    expect(migrated).toEqual({ 'window:9': first });
    expect(migrateSingleProjectCaptureContext({ 'window:1': first }, 9)).toEqual({ 'window:9': first });
    expect(migrateSingleProjectCaptureContext({ 'window:1': first, 'window:2': second }, 9)).toEqual({ 'window:1': first, 'window:2': second });
  });

  it('saves a capture before linking it and keeps it when the target project is gone', async () => {
    const project = createDefaultProject('Continuous');
    await createProject(project);
    const linked = await persistCapturedClip(clip('first'), project.id);
    expect(linked).toMatchObject({ clipId: 'first', addedToProject: true, projectMissing: false });
    expect((await getProject(project.id))?.items.filter((item) => item.type === 'image').map((item) => item.clipId)).toEqual(['first']);

    const missing = await persistCapturedClip(clip('orphan'), 'deleted-project');
    expect(missing).toMatchObject({ clipId: 'orphan', addedToProject: false, projectMissing: true });
    expect(await getClip('orphan')).toBeDefined();
  });

  it('does not create a duplicate project layer for repeated capture delivery', async () => {
    const project = createDefaultProject('Idempotent');
    await createProject(project);
    await persistCapturedClip(clip('same'), project.id);
    await persistCapturedClip(clip('same'), project.id);
    expect((await getProject(project.id))?.items.filter((item) => item.type === 'image')).toHaveLength(1);
  });

  it('prunes expired capture ledger entries', () => {
    const ledger = pruneProcessedCaptureLedger({ old: { clipId: 'a', savedAt: 0 }, fresh: { clipId: 'b', savedAt: 600_000 } }, 600_000);
    expect(ledger).toEqual({ fresh: { clipId: 'b', savedAt: 600_000 } });
  });

  it('keeps Continue Capture on the sender tab when active tab changed', () => {
    expect(resolveCaptureRequestTarget({ id: 17, windowId: 3 }, { id: 99, windowId: 8 })).toEqual({ id: 17, windowId: 3 });
    expect(resolveCaptureRequestTarget(undefined, { id: 99, windowId: 8 })).toEqual({ id: 99, windowId: 8 });
  });

  it('persists consecutive captures into the same project without duplicate layers', async () => {
    const project = createDefaultProject('Consecutive');
    await createProject(project);
    await persistCapturedClip(clip('one'), project.id);
    await persistCapturedClip(clip('two'), project.id);
    await persistCapturedClip(clip('three'), project.id);
    expect((await getProject(project.id))?.items.filter((item) => item.type === 'image').map((item) => item.clipId)).toEqual(['one', 'two', 'three']);
  });
});

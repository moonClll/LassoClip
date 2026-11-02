import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { cssRectToImageRect, mapCssPointsToImage } from '../src/modules/selection/coordinates';
import { getProject } from '../src/modules/storage/clipStore';
import { persistCapturedClip } from '../src/modules/storage/captureWorkflow';
import { assignProjectCaptureContext, createProjectCaptureContext, isProjectCaptureContextActive, migrateSingleProjectCaptureContext, PROJECT_CAPTURE_CONTEXT_KEY, PROJECT_CAPTURE_GLOBAL_SCOPE, projectCaptureScope, PROCESSED_CAPTURE_LEDGER_KEY, pruneProcessedCaptureLedger, removeProjectCaptureContext, sameProjectCaptureSession, type ProcessedCaptureLedger, type ScopedProjectCaptureContexts } from '../src/modules/capture/projectCapture';
import { blobFromTransportPayload } from '../src/modules/media/blobTransport';
import { resolveCaptureRequestTarget } from '../src/modules/capture/captureRequest';
import type { CaptureCompleteMessage, ProjectCaptureContext } from '../src/types/capture';

const processedCaptures = new Map<string, string>();
const inFlightCaptureCompletions = new Map<string, Promise<string>>();
let captureLedgerWrite = Promise.resolve();

type StoredProjectCaptureContexts = ScopedProjectCaptureContexts;
let projectContextWrite = Promise.resolve();

async function readProjectCaptureContexts(): Promise<StoredProjectCaptureContexts> {
  const stored = await browser.storage.local.get(PROJECT_CAPTURE_CONTEXT_KEY) as Record<string, unknown>;
  const value = stored[PROJECT_CAPTURE_CONTEXT_KEY] as ProjectCaptureContext | StoredProjectCaptureContexts | undefined;
  if (!value) return {};
  // Migrate the Phase 4.1.1 extension-wide value in memory. It is assigned to
  // the first active browser window that reads it, never copied to all windows.
  if ('projectId' in value) return { [PROJECT_CAPTURE_GLOBAL_SCOPE]: value as ProjectCaptureContext };
  return value;
}

async function writeProjectCaptureContexts(contexts: StoredProjectCaptureContexts): Promise<void> {
  await browser.storage.local.set({ [PROJECT_CAPTURE_CONTEXT_KEY]: contexts });
}

async function getProjectCaptureContext(windowId?: number): Promise<ProjectCaptureContext | undefined> {
  await projectContextWrite;
  let contexts = await readProjectCaptureContexts();
  const scope = projectCaptureScope(windowId);
  let context = contexts[scope];
  if (!context && scope !== PROJECT_CAPTURE_GLOBAL_SCOPE && contexts[PROJECT_CAPTURE_GLOBAL_SCOPE]) {
    const migrated = migrateSingleProjectCaptureContext(contexts, windowId!);
    contexts = migrated;
    context = migrated[scope];
    await writeProjectCaptureContexts(migrated);
  } else if (!context && scope !== PROJECT_CAPTURE_GLOBAL_SCOPE) {
    const migrated = migrateSingleProjectCaptureContext(contexts, windowId!);
    if (migrated !== contexts) {
      contexts = migrated;
      context = migrated[scope];
      await writeProjectCaptureContexts(migrated);
    }
  }
  if (isProjectCaptureContextActive(context)) return context;
  if (context) {
    delete contexts[scope];
    await writeProjectCaptureContexts(contexts);
  }
  return undefined;
}

async function setProjectCaptureContext(context: ProjectCaptureContext, windowId?: number): Promise<void> {
  const write = projectContextWrite.then(async () => {
    const contexts = assignProjectCaptureContext(await readProjectCaptureContexts(), windowId, context);
    await writeProjectCaptureContexts(contexts);
  });
  projectContextWrite = write.catch(() => undefined);
  await write;
}

async function stopProjectCaptureContext(windowId?: number): Promise<void> {
  const write = projectContextWrite.then(async () => {
    const contexts = removeProjectCaptureContext(await readProjectCaptureContexts(), windowId);
    if (Object.keys(contexts).length === 0) await browser.storage.local.remove(PROJECT_CAPTURE_CONTEXT_KEY);
    else await writeProjectCaptureContexts(contexts);
  });
  projectContextWrite = write.catch(() => undefined);
  await write;
}

async function projectCaptureStatus(windowId?: number): Promise<{ active: boolean; context?: ProjectCaptureContext; projectName?: string; error?: string }> {
  const context = await getProjectCaptureContext(windowId);
  if (!context) return { active: false };
  const project = await getProject(context.projectId);
  if (!project) {
    await stopProjectCaptureContext(windowId);
    return { active: false, error: '目标项目已不存在，已退出项目剪藏模式；已保存的素材仍保留在 Library。' };
  }
  return { active: true, context, projectName: project.name };
}

async function getProcessedCapture(captureId: string): Promise<string | undefined> {
  const memoryValue = processedCaptures.get(captureId);
  if (memoryValue) return memoryValue;
  try {
    await captureLedgerWrite;
    const stored = await browser.storage.local.get(PROCESSED_CAPTURE_LEDGER_KEY) as Record<string, unknown>;
    const ledger = pruneProcessedCaptureLedger((stored[PROCESSED_CAPTURE_LEDGER_KEY] ?? {}) as ProcessedCaptureLedger);
    const entry = ledger[captureId];
    await browser.storage.local.set({ [PROCESSED_CAPTURE_LEDGER_KEY]: ledger });
    if (!entry) return undefined;
    processedCaptures.set(captureId, entry.clipId);
    return entry.clipId;
  } catch {
    return undefined;
  }
}

async function rememberProcessedCapture(captureId: string, clipId: string): Promise<void> {
  processedCaptures.set(captureId, clipId);
  setTimeout(() => processedCaptures.delete(captureId), 5 * 60_000);
  const write = captureLedgerWrite.then(async () => {
    const stored = await browser.storage.local.get(PROCESSED_CAPTURE_LEDGER_KEY) as Record<string, unknown>;
    const ledger = pruneProcessedCaptureLedger((stored[PROCESSED_CAPTURE_LEDGER_KEY] ?? {}) as ProcessedCaptureLedger);
    ledger[captureId] = { clipId, savedAt: Date.now() };
    await browser.storage.local.set({ [PROCESSED_CAPTURE_LEDGER_KEY]: ledger });
  });
  captureLedgerWrite = write.catch(() => undefined);
  try { await write; } catch {
    // IndexedDB is the source of truth; a storage ledger failure only reduces
    // cross-worker duplicate protection to the in-memory map.
  }
}

async function startCapture(tabId: number, windowId?: number): Promise<{ ok: boolean; message?: string; projectCapture?: ProjectCaptureContext }> {
  try {
    const status = await projectCaptureStatus(windowId);
    if (status.error) {
      try { await browser.tabs.sendMessage(tabId, { type: 'capture:error', message: status.error }); } catch { /* protected page */ }
      return { ok: false, message: status.error };
    }
    // Ask an existing content overlay to become invisible before captureVisibleTab
    // takes the screenshot. A page may have an active continuous-capture overlay.
    try { await browser.tabs.sendMessage(tabId, { type: 'capture:prepare' }); } catch { /* no overlay or protected page */ }
    const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
    const message = { type: 'capture:start' as const, dataUrl, capturedAt: Date.now(), projectCapture: status.context };
    try {
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      // A tab that was already open when the extension was installed may not have the declared content script yet.
      await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/content.js'] });
      await browser.tabs.sendMessage(tabId, message);
    }
    return { ok: true, projectCapture: status.context };
  } catch (error) {
    const message = error instanceof Error ? error.message : '当前页面无法启动截图';
    try {
      await browser.tabs.sendMessage(tabId, { type: 'capture:error', message });
    } catch {
      // Protected pages may reject both capture and messaging; the popup still receives the error response.
    }
    return { ok: false, message };
  }
}

async function resolveSenderWindowId(sender: { tab?: { windowId?: number } }): Promise<number | undefined> {
  if (sender.tab?.windowId !== undefined) return sender.tab.windowId;
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  return activeTab?.windowId;
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: 'lassoclip-start',
      title: '使用 LassoClip 截图',
      contexts: ['page', 'selection', 'image'],
    });
  });

  browser.contextMenus.onClicked.addListener(async (_info, tab) => {
    if (!tab || tab.id === undefined) return;
    await startCapture(tab.id, tab.windowId);
  });

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'start-quick-clip') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) await startCapture(tab.id, tab.windowId);
  });

  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id !== undefined) await startCapture(tab.id, tab.windowId);
  });

  browser.runtime.onMessage.addListener(async (message: CaptureCompleteMessage | { type: 'capture:request' } | { type: 'editor:open'; projectId?: string } | { type: 'library:open' } | { type: 'project-capture:start'; projectId: string } | { type: 'project-capture:stop' } | { type: 'project-capture:status' }, sender) => {
    const senderWindowId = await resolveSenderWindowId(sender);
    if (message.type === 'editor:open') {
      const suffix = message.projectId ? `?projectId=${encodeURIComponent(message.projectId)}` : '';
      await browser.tabs.create({ url: browser.runtime.getURL(`/editor.html${suffix}` as never) });
      return { ok: true };
    }
    if (message.type === 'library:open') {
      await browser.tabs.create({ url: browser.runtime.getURL('/library.html' as never) });
      return { ok: true };
    }
    if (message.type === 'capture:request') {
      // Continue Capture comes from the page that owns the overlay. Prefer
      // that sender instead of the active tab, which may have changed while
      // the success actions were visible.
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const target = resolveCaptureRequestTarget(sender.tab, tab);
      if (target?.id === undefined) return { ok: false, message: '没有找到当前标签页' };
      return await startCapture(target.id, target.windowId);
    }
    if (message.type === 'project-capture:start') {
      const project = await getProject(message.projectId);
      if (!project) return { ok: false, message: '目标项目不存在，无法启动项目剪藏模式' };
      const context = createProjectCaptureContext(project.id);
      await setProjectCaptureContext(context, senderWindowId);
      return { ok: true, context, projectName: project.name };
    }
    if (message.type === 'project-capture:stop') {
      await stopProjectCaptureContext(senderWindowId);
      return { ok: true };
    }
    if (message.type === 'project-capture:status') {
      return await projectCaptureStatus(senderWindowId);
    }
    if (message.type === 'capture:complete') {
      if (message.captureId) {
        const existingId = await getProcessedCapture(message.captureId);
        if (existingId) return { ok: true, clipId: existingId, duplicate: true };
        const inFlight = inFlightCaptureCompletions.get(message.captureId);
        if (inFlight) return { ok: true, clipId: await inFlight, duplicate: true };
      }
      let resolveInFlight: ((clipId: string) => void) | undefined;
      let rejectInFlight: ((error: unknown) => void) | undefined;
      if (message.captureId) {
        const promise = new Promise<string>((resolve, reject) => { resolveInFlight = resolve; rejectInFlight = reject; });
        inFlightCaptureCompletions.set(message.captureId, promise);
      }
      try {
        const now = Date.now();
        const clipId = crypto.randomUUID();
        const imageBlob = await blobFromTransportPayload(message.imageBlob, `截图 ${clipId}`);
        const thumbnailBlob = message.thumbnailBlob ? await blobFromTransportPayload(message.thumbnailBlob, `截图缩略图 ${clipId}`) : undefined;
        const storedSelection = {
          ...message.selection,
          coordinateSpace: 'image-px' as const,
          bounds: cssRectToImageRect(message.selection.bounds, message.metrics),
          points: message.selection.points ? mapCssPointsToImage(message.selection.points, message.metrics) : undefined,
        };
        const item = {
          id: clipId,
          name: `剪藏 ${new Date(now).toLocaleString()}`,
          imageBlob,
          thumbnailBlob,
          source: message.source,
          selection: storedSelection,
          metadata: {
            width: Math.max(1, Math.ceil(message.selection.bounds.width * (message.metrics.imageWidth / message.metrics.viewportWidth))),
            height: Math.max(1, Math.ceil(message.selection.bounds.height * (message.metrics.imageHeight / message.metrics.viewportHeight))),
            format: 'image/png',
            createdAt: now,
            updatedAt: now,
          },
          tags: [],
          favorite: false,
        };
        let projectError: string | undefined;
        let projectCapture = false;
        let addedToProject = false;
        const activeContext = await getProjectCaptureContext(senderWindowId);
        const requestedContext = message.projectCapture;
        const contextMatches = sameProjectCaptureSession(activeContext, requestedContext);
        if (requestedContext && !contextMatches) projectError = '项目剪藏模式已结束或已切换；素材已保存到 Library，未自动加入其他项目。';
        const result = await persistCapturedClip(item, contextMatches ? requestedContext?.projectId : undefined);
        if (contextMatches && requestedContext) {
          projectCapture = true;
          addedToProject = result.addedToProject;
          if (result.projectMissing) {
            projectError = '目标项目已不存在；素材已保存到 Library，未自动加入其他项目。';
            await stopProjectCaptureContext(senderWindowId);
          }
        }
        if (message.captureId) {
          await rememberProcessedCapture(message.captureId, clipId);
          resolveInFlight?.(clipId);
        }
        return { ok: true, clipId, duplicate: false, projectCapture, addedToProject, projectError, projectId: requestedContext?.projectId };
      } catch (error) {
        rejectInFlight?.(error);
        throw error;
      } finally {
        if (message.captureId) inFlightCaptureCompletions.delete(message.captureId);
      }
    }
    return undefined;
  });
});

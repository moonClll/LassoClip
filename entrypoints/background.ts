import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { cssRectToImageRect, mapCssPointsToImage } from '../src/modules/selection/coordinates';
import { saveClip } from '../src/modules/storage/clipStore';
import type { CaptureCompleteMessage } from '../src/types/capture';

async function startCapture(tabId: number, windowId?: number): Promise<void> {
  try {
    const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
    const message = { type: 'capture:start' as const, dataUrl, capturedAt: Date.now() };
    try {
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      // A tab that was already open when the extension was installed may not have the declared content script yet.
      await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/content.js'] });
      await browser.tabs.sendMessage(tabId, message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '当前页面无法启动截图';
    try {
      await browser.tabs.sendMessage(tabId, { type: 'capture:error', message });
    } catch {
      // Protected pages may reject both capture and messaging; the popup still receives the error response.
    }
  }
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

  browser.runtime.onMessage.addListener(async (message: CaptureCompleteMessage | { type: 'capture:request' } | { type: 'editor:open' }) => {
    if (message.type === 'editor:open') {
      await browser.tabs.create({ url: browser.runtime.getURL('/editor.html') });
      return { ok: true };
    }
    if (message.type === 'capture:request') {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) return { ok: false, message: '没有找到当前标签页' };
      await startCapture(tab.id, tab.windowId);
      return { ok: true };
    }
    if (message.type === 'capture:complete') {
      const now = Date.now();
      const storedSelection = {
        ...message.selection,
        coordinateSpace: 'image-px' as const,
        bounds: cssRectToImageRect(message.selection.bounds, message.metrics),
        points: message.selection.points ? mapCssPointsToImage(message.selection.points, message.metrics) : undefined,
      };
      await saveClip({
        id: crypto.randomUUID(),
        name: `剪藏 ${new Date(now).toLocaleString()}`,
        imageBlob: message.imageBlob,
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
      });
      return { ok: true };
    }
    return undefined;
  });
});

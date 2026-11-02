import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureStartMessage } from '../src/types/capture';

vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage: vi.fn() } } }));
vi.mock('wxt/utils/define-content-script', () => ({ defineContentScript: (config: unknown) => config }));

import { CaptureOverlay } from '../entrypoints/content';

const contextMethods = ['setTransform', 'clearRect', 'fillRect', 'save', 'beginPath', 'rect', 'ellipse', 'moveTo', 'quadraticCurveTo', 'lineTo', 'closePath', 'fill', 'restore', 'setLineDash', 'stroke', 'drawImage'];

function message(dataUrl: string): CaptureStartMessage {
  return { type: 'capture:start', dataUrl, capturedAt: 1 };
}

describe('continuous capture overlay lifecycle', () => {
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
  let originalRaf: typeof window.requestAnimationFrame;

  beforeEach(() => {
    document.body.innerHTML = '';
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    originalRaf = window.requestAnimationFrame;
    const context = Object.fromEntries(contextMethods.map((method) => [method, vi.fn()])) as Record<string, unknown>;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => context });
    Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0) });
  });

  afterEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: originalGetContext });
    Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: originalRaf });
    document.body.innerHTML = '';
  });

  it('hides the overlay before recapture and reuses the toolbar with a new captureId', async () => {
    const overlay = new CaptureOverlay(message('data:image/png;base64,AA=='));
    const host = document.getElementById('lassoclip-overlay-host') as HTMLDivElement;
    const firstId = (overlay as unknown as { captureId: string }).captureId;
    await overlay.prepareForCapture();
    expect(host.style.visibility).toBe('hidden');
    expect(host.style.pointerEvents).toBe('none');
    (overlay as unknown as { mode: string }).mode = 'polygon';
    overlay.replaceCapture(message('data:image/png;base64,Ag=='));
    expect(host.style.visibility).toBe('visible');
    expect(host.style.pointerEvents).toBe('auto');
    expect((overlay as unknown as { mode: string }).mode).toBe('polygon');
    expect((overlay as unknown as { captureId: string }).captureId).not.toBe(firstId);
    expect(document.querySelectorAll('#lassoclip-overlay-host')).toHaveLength(1);
    overlay.close();
    expect(overlay.isMounted()).toBe(false);
  });

  it('keeps a completed rectangle pending until explicit confirmation', () => {
    const overlay = new CaptureOverlay(message('data:image/png;base64,AA==')) as unknown as {
      canvas: HTMLCanvasElement;
      mode: string;
      confirm: () => void;
      onPointerDown: (event: PointerEvent) => void;
      onPointerMove: (event: PointerEvent) => void;
      onPointerUp: (event: PointerEvent) => void;
      close: () => void;
    };
    const canvas = overlay.canvas;
    Object.defineProperty(canvas, 'getBoundingClientRect', { configurable: true, value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }) });
    Object.defineProperty(canvas, 'setPointerCapture', { configurable: true, value: vi.fn() });
    overlay.mode = 'rectangle';
    const confirm = vi.fn(); overlay.confirm = confirm;
    const event = (clientX: number, clientY: number): PointerEvent => ({ clientX, clientY, pointerId: 1, shiftKey: false, preventDefault: vi.fn() } as unknown as PointerEvent);
    overlay.onPointerDown(event(20, 30));
    overlay.onPointerMove(event(180, 130));
    overlay.onPointerUp(event(180, 130));
    expect(confirm).not.toHaveBeenCalled();
    overlay.close();
  });

  it('resets one selection in place without hiding or remounting the overlay', () => {
    const overlay = new CaptureOverlay(message('data:image/png;base64,AA==')) as unknown as {
      mode: string;
      selection: unknown;
      captureId: string;
      prepareNextSelection: () => void;
      canvas: HTMLCanvasElement;
      close: () => void;
    };
    const host = document.getElementById('lassoclip-overlay-host') as HTMLDivElement;
    const originalHost = host;
    overlay.mode = 'polygon';
    overlay.selection = { type: 'polygon' };
    const originalCaptureId = overlay.captureId;
    overlay.canvas.style.pointerEvents = 'none';
    overlay.prepareNextSelection();
    expect(document.getElementById('lassoclip-overlay-host')).toBe(originalHost);
    expect(host.style.visibility).toBe('visible');
    expect(host.style.pointerEvents).toBe('auto');
    expect(overlay.canvas.style.pointerEvents).toBe('auto');
    expect(overlay.selection).toBeNull();
    expect(overlay.mode).toBe('polygon');
    expect(overlay.captureId).not.toBe(originalCaptureId);
    overlay.close();
  });

  it('uses the real DOM hit stack, locks the first click, and cycles to a parent element', () => {
    const parent = document.createElement('div');
    const child = document.createElement('img');
    parent.append(child);
    document.body.append(parent);
    Object.defineProperty(parent, 'getBoundingClientRect', { configurable: true, value: () => ({ x: 10, y: 10, left: 10, top: 10, right: 360, bottom: 260, width: 350, height: 250 }) });
    Object.defineProperty(child, 'getBoundingClientRect', { configurable: true, value: () => ({ x: 40, y: 30, left: 40, top: 30, right: 160, bottom: 120, width: 120, height: 90 }) });
    const elementsFromPoint = vi.fn(() => [child, parent, document.body]);
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: elementsFromPoint });
    const overlay = new CaptureOverlay(message('data:image/png;base64,AA==')) as unknown as {
      canvas: HTMLCanvasElement;
      mode: string;
      candidateElement: Element | null;
      elementLocked: boolean;
      selection: { bounds: { x: number; y: number; width: number; height: number } } | null;
      updateElementCandidate: (point: { x: number; y: number }) => void;
      cycleElementCandidate: (direction: -1 | 1) => void;
      onPointerDown: (event: PointerEvent) => void;
      close: () => void;
    };
    Object.defineProperty(overlay.canvas, 'getBoundingClientRect', { configurable: true, value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }) });
    Object.defineProperty(overlay.canvas, 'setPointerCapture', { configurable: true, value: vi.fn() });
    overlay.mode = 'element';
    overlay.updateElementCandidate({ x: 50, y: 50 });
    expect(overlay.candidateElement).toBe(child);
    expect(overlay.selection?.bounds).toEqual({ x: 40, y: 30, width: 120, height: 90 });

    overlay.onPointerDown({ clientX: 50, clientY: 50, pointerId: 1, preventDefault: vi.fn() } as unknown as PointerEvent);
    expect(overlay.elementLocked).toBe(true);
    expect(overlay.candidateElement).toBe(child);

    overlay.cycleElementCandidate(1);
    expect(overlay.candidateElement).toBe(parent);
    expect(overlay.selection?.bounds).toEqual({ x: 10, y: 10, width: 350, height: 250 });
    Reflect.deleteProperty(document, 'elementsFromPoint');
    overlay.close();
  });

  it('draws an element selection with straight rectangle edges', () => {
    const overlay = new CaptureOverlay(message('data:image/png;base64,AA==')) as unknown as {
      ctx: CanvasRenderingContext2D & { rect: ReturnType<typeof vi.fn> };
      selection: { type: 'element'; bounds: { x: number; y: number; width: number; height: number } };
      mode: string;
      draw: () => void;
      close: () => void;
    };
    overlay.ctx.rect.mockClear();
    overlay.mode = 'element';
    overlay.selection = { type: 'element', bounds: { x: 20, y: 30, width: 120, height: 80 } };
    overlay.draw();
    expect(overlay.ctx.rect).toHaveBeenCalledWith(20, 30, 120, 80);
    expect(overlay.ctx.rect).toHaveBeenCalledTimes(2);
    overlay.close();
  });
});

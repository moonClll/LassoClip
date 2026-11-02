import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { canvasToBlob, canvasToThumbnailBlob, cropCanvasByCssSelection, imageToCanvas, loadImage } from '../src/modules/image-processing/canvas';
import { blobToTransportPayload } from '../src/modules/media/blobTransport';
import { createViewportMetrics } from '../src/modules/selection/coordinates';
import { normalizeRect, rectFromPoints } from '../src/modules/selection/geometry';
import { resizeSelection, translateSelection } from '../src/modules/selection/transforms';
import { copyPngToClipboard } from '../src/services/clipboard/writePng';
import type { CaptureStartMessage, ClipSource, Point, Rect, SelectionGeometry, SelectionType } from '../src/types/capture';

const HOST_ID = 'lassoclip-overlay-host';

const css = `
:host { all: initial; }
* { box-sizing: border-box; }
.shell { position: fixed; inset: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #f8fafc; user-select: none; }
.stage { position: absolute; inset: 0; overflow: hidden; background: #0f172a; }
.stage img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
.stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
.magnifier { position: absolute; width: 154px; height: 154px; display: none; overflow: hidden; border: 2px solid #c4b5fd; border-radius: 50%; background: #0f172a; box-shadow: 0 12px 32px rgba(0,0,0,.45); pointer-events: none; }
.magnifier canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.magnifier .coords { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); padding: 2px 5px; border-radius: 4px; color: #fff; background: rgba(15,23,42,.78); font: 10px ui-monospace, monospace; white-space: nowrap; }
.toolbar { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 6px; padding: 8px; border: 1px solid rgba(255,255,255,.14); border-radius: 14px; background: rgba(15,23,42,.9); box-shadow: 0 18px 50px rgba(0,0,0,.35); backdrop-filter: blur(14px); }
.toolbar button { border: 0; border-radius: 9px; padding: 8px 11px; color: #cbd5e1; background: transparent; cursor: pointer; font-size: 12px; }
.toolbar button:hover { background: rgba(148,163,184,.18); color: white; }
.toolbar button.active { background: #7c3aed; color: white; }
.toolbar .divider { width: 1px; height: 22px; background: rgba(255,255,255,.16); margin: 0 4px; }
.toolbar .confirm { background: #10b981; color: #052e16; font-weight: 700; }
.toolbar .cancel { background: rgba(248,113,113,.16); color: #fecaca; }
.hint { position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%); padding: 8px 13px; border: 1px solid rgba(255,255,255,.12); border-radius: 999px; background: rgba(15,23,42,.78); color: #cbd5e1; font-size: 12px; }
.toast { position: absolute; right: 20px; bottom: 20px; padding: 10px 14px; border-radius: 10px; background: #0f172a; color: #f8fafc; box-shadow: 0 12px 30px rgba(0,0,0,.3); font-size: 13px; }
.success-actions { position: absolute; right: 20px; bottom: 20px; display: flex; align-items: center; gap: 7px; padding: 9px; border: 1px solid rgba(196,181,253,.25); border-radius: 12px; background: rgba(15,23,42,.94); box-shadow: 0 12px 30px rgba(0,0,0,.35); }
.success-actions span { margin-right: 4px; color: #cbd5e1; font-size: 12px; }.success-actions button { padding: 7px 9px; border: 0; border-radius: 7px; color: #ede9fe; background: rgba(124,58,237,.34); cursor: pointer; font-size: 11px; }.success-actions button:hover { background: rgba(124,58,237,.56); }.success-actions .dismiss { color: #94a3b8; background: transparent; }.success-actions .continue { color: #052e16; background: #6ee7b7; font-weight: 700; }
`;

function pointFromEvent(event: PointerEvent, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)), y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)) };
}

function rectToPoints(rect: Rect): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

function normalizeShapeRect(start: Point, end: Point, keepSquare: boolean): Rect {
  const raw = normalizeRect(start, end);
  if (!keepSquare) return raw;
  const size = Math.max(raw.width, raw.height);
  return {
    x: end.x < start.x ? start.x - size : start.x,
    y: end.y < start.y ? start.y - size : start.y,
    width: size,
    height: size,
  };
}

export class CaptureOverlay {
  private captureId = crypto.randomUUID();
  private readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;
  private readonly canvas: HTMLCanvasElement;
  private readonly image: HTMLImageElement;
  private readonly toolbar: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly shell: HTMLDivElement;
  private readonly magnifier: HTMLDivElement;
  private readonly magnifierCanvas: HTMLCanvasElement;
  private readonly magnifierCtx: CanvasRenderingContext2D;
  private readonly magnifierCoords: HTMLDivElement;
  private readonly ctx: CanvasRenderingContext2D;
  private mode: SelectionType = 'freehand';
  private points: Point[] = [];
  private startPoint: Point | null = null;
  private livePoint: Point | null = null;
  private selection: SelectionGeometry | null = null;
  private candidateElement: Element | null = null;
  private elementCandidates: Element[] = [];
  private candidateIndex = 0;
  private elementLocked = false;
  private sourceImage: HTMLImageElement | null = null;
  private adjustingSelection: 'move' | 'resize' | null = null;
  private adjustStart: Point | null = null;
  private adjustOrigin: SelectionGeometry | null = null;
  private confirmInFlight = false;
  private readonly onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);

  constructor(private data: CaptureStartMessage) {
    this.host = document.createElement('div');
    this.host.id = HOST_ID;
    Object.assign(this.host.style, { position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'auto' });
    this.root = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = css;
    this.root.append(style);
    const shell = document.createElement('div');
    shell.className = 'shell';
    this.shell = shell;
    const stage = document.createElement('div');
    stage.className = 'stage';
    this.image = document.createElement('img');
    this.image.alt = '冻结的网页画面';
    this.image.src = data.dataUrl;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.magnifier = document.createElement('div');
    this.magnifier.className = 'magnifier';
    this.magnifierCanvas = document.createElement('canvas');
    this.magnifierCtx = this.magnifierCanvas.getContext('2d')!;
    this.magnifierCoords = document.createElement('div');
    this.magnifierCoords.className = 'coords';
    this.magnifierCanvas.width = 308;
    this.magnifierCanvas.height = 308;
    this.magnifier.append(this.magnifierCanvas, this.magnifierCoords);
    stage.append(this.image, this.canvas);
    this.toolbar = this.createToolbar();
    this.hint = document.createElement('div');
    this.hint.className = 'hint';
    this.hint.textContent = '拖动绘制选区，Enter 确认，Esc 取消';
    this.toast = document.createElement('div');
    this.toast.className = 'toast';
    this.toast.hidden = true;
    shell.append(stage, this.toolbar, this.hint, this.toast, this.magnifier);
    this.root.append(shell);
    document.documentElement.append(this.host);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('dblclick', this.onDoubleClick);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.image.addEventListener('load', () => this.resize());
    this.resize();
  }

  async prepareForCapture(): Promise<{ ok: true }> {
    this.host.style.visibility = 'hidden';
    this.host.style.pointerEvents = 'none';
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return { ok: true };
  }

  replaceCapture(data: CaptureStartMessage): void {
    this.data = data;
    this.captureId = crypto.randomUUID();
    this.sourceImage = null;
    this.confirmInFlight = false;
    this.image.src = data.dataUrl;
    this.host.style.visibility = 'visible';
    this.host.style.pointerEvents = 'auto';
    this.canvas.style.pointerEvents = 'auto';
    this.toast.hidden = true;
    this.resetSelection();
    this.resize();
  }

  isMounted(): boolean { return this.host.isConnected; }

  private createToolbar(): HTMLDivElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    const modes: Array<[SelectionType, string]> = [
      ['freehand', '自由'], ['polygon', '多边形'], ['rectangle', '矩形'], ['ellipse', '椭圆'], ['element', '元素'],
    ];
    for (const [mode, label] of modes) {
      const button = document.createElement('button');
      button.textContent = label;
      button.dataset.mode = mode;
      button.addEventListener('click', () => this.setMode(mode));
      toolbar.append(button);
    }
    const divider = document.createElement('span');
    divider.className = 'divider';
    toolbar.append(divider);
    const reset = document.createElement('button');
    reset.textContent = '重绘';
    reset.addEventListener('click', () => this.resetSelection());
    toolbar.append(reset);
    const confirm = document.createElement('button');
    confirm.textContent = '确认';
    confirm.className = 'confirm';
    confirm.addEventListener('click', () => void this.confirm());
    toolbar.append(confirm);
    const cancel = document.createElement('button');
    cancel.textContent = '取消';
    cancel.className = 'cancel';
    cancel.addEventListener('click', () => void this.cancelSelection());
    toolbar.append(cancel);
    return toolbar;
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  private setMode(mode: SelectionType): void {
    this.mode = mode;
    this.resetSelection();
    for (const button of this.toolbar.querySelectorAll<HTMLButtonElement>('button[data-mode]')) button.classList.toggle('active', button.dataset.mode === mode);
    this.hint.textContent = mode === 'element' ? '移动到元素上高亮，点击锁定；[ / ] 切换父子元素' : '拖动绘制选区，Enter 确认，Esc 取消';
  }

  private resetSelection(): void {
    this.points = [];
    this.startPoint = null;
    this.livePoint = null;
    this.selection = null;
    this.candidateElement = null;
    this.elementCandidates = [];
    this.candidateIndex = 0;
    this.elementLocked = false;
    this.adjustingSelection = null;
    this.adjustStart = null;
    this.adjustOrigin = null;
    this.magnifier.style.display = 'none';
    this.draw();
  }

  private findElementCandidates(point: Point): Element[] {
    const previousVisibility = this.host.style.visibility;
    const previousPointerEvents = this.host.style.pointerEvents;
    this.host.style.pointerEvents = 'none';
    let elements: Element[] = [];
    try {
      elements = typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(point.x, point.y)
        : [document.elementFromPoint(point.x, point.y)].filter((element): element is Element => Boolean(element));
    } finally {
      this.host.style.visibility = previousVisibility;
      this.host.style.pointerEvents = previousPointerEvents || 'auto';
    }
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const seen = new Set<Element>();
    return elements.filter((element) => {
      if (seen.has(element) || element === this.host || this.host.contains(element) || element.getRootNode() === this.root) return false;
      seen.add(element);
      if (element === document.documentElement || element === document.body) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) return false;
      const tagName = element.tagName.toLowerCase();
      const genericContainer = ['html', 'body', 'main', 'section', 'article', 'div'].includes(tagName);
      if (genericContainer && rect.width * rect.height >= viewportArea * .92) return false;
      return true;
    });
  }

  private findElementAt(point: Point): Element | null {
    return this.findElementCandidates(point)[0] ?? null;
  }

  private updateElementCandidate(point: Point): void {
    const candidates = this.findElementCandidates(point);
    this.elementCandidates = candidates;
    if (candidates.length === 0) {
      this.candidateElement = null;
      this.candidateIndex = 0;
      this.selection = null;
      return;
    }
    const currentIndex = this.candidateElement ? candidates.indexOf(this.candidateElement) : -1;
    this.candidateIndex = currentIndex >= 0 ? currentIndex : 0;
    this.candidateElement = candidates[this.candidateIndex];
    const bounds = this.elementRect(this.candidateElement);
    this.selection = { type: 'element', bounds, points: rectToPoints(bounds) };
  }

  private cycleElementCandidate(direction: -1 | 1): void {
    if (this.elementCandidates.length < 2) return;
    this.candidateIndex = (this.candidateIndex + direction + this.elementCandidates.length) % this.elementCandidates.length;
    this.candidateElement = this.elementCandidates[this.candidateIndex];
    const bounds = this.elementRect(this.candidateElement);
    this.selection = { type: 'element', bounds, points: rectToPoints(bounds) };
    this.elementLocked = true;
    this.draw();
  }

  private elementRect(element: Element): Rect {
    const rect = element.getBoundingClientRect();
    return { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: Math.min(window.innerWidth, rect.right) - Math.max(0, rect.x), height: Math.min(window.innerHeight, rect.bottom) - Math.max(0, rect.y) };
  }

  private onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event, this.canvas);
    if (this.mode === 'element') {
      if (this.elementLocked && this.selection?.type === 'element') {
        const bounds = this.selection.bounds;
        const nearResizeHandle = Math.abs(point.x - (bounds.x + bounds.width)) < 12 && Math.abs(point.y - (bounds.y + bounds.height)) < 12;
        if (nearResizeHandle || (point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height)) {
          this.adjustingSelection = nearResizeHandle ? 'resize' : 'move';
          this.adjustStart = point;
          this.adjustOrigin = { ...this.selection, bounds: { ...bounds }, points: this.selection.points?.map((item) => ({ ...item })) };
          return;
        }
      }
      // A hover preview also uses `selection` for drawing. The first click
      // must transition that preview into a locked element, rather than being
      // interpreted as a move of the preview rectangle.
      if (!this.elementLocked) this.updateElementCandidate(point);
      this.candidateElement = this.candidateElement ?? this.findElementAt(point);
      if (this.candidateElement) {
        const bounds = this.elementRect(this.candidateElement);
        this.selection = { type: 'element', bounds, points: rectToPoints(bounds) };
        this.elementLocked = true;
        if (this.candidateElement instanceof HTMLIFrameElement && !this.candidateElement.contentDocument) this.showToast('跨域 iframe 无法注入，只能截取 iframe 可见区域');
        this.draw();
      }
      return;
    }
    if ((this.mode === 'rectangle' || this.mode === 'ellipse') && this.selection) {
      const bounds = this.selection.bounds;
      if (Math.abs(point.x - (bounds.x + bounds.width)) < 12 && Math.abs(point.y - (bounds.y + bounds.height)) < 12) {
        this.adjustingSelection = 'resize';
        this.adjustStart = point;
        this.adjustOrigin = { ...this.selection, bounds: { ...bounds }, points: this.selection.points?.map((item) => ({ ...item })) };
        return;
      }
    }
    if (this.mode === 'polygon') {
      if (this.points.length >= 3 && Math.hypot(point.x - this.points[0].x, point.y - this.points[0].y) < 12) {
        this.selection = { type: 'polygon', points: [...this.points], bounds: rectFromPoints(this.points) };
      } else {
        this.points.push(point);
      }
      this.livePoint = point;
      this.draw();
      return;
    }
    this.startPoint = point;
    this.points = [point];
    this.livePoint = point;
  };

  private onPointerMove = (event: PointerEvent): void => {
    event.preventDefault();
    const point = pointFromEvent(event, this.canvas);
    this.livePoint = point;
    this.updateMagnifier(point);
    if (this.adjustingSelection && this.adjustStart && this.adjustOrigin) {
      const dx = point.x - this.adjustStart.x;
      const dy = point.y - this.adjustStart.y;
      this.selection = this.adjustingSelection === 'move'
        ? translateSelection(this.adjustOrigin, dx, dy)
        : resizeSelection(this.adjustOrigin, this.adjustOrigin.bounds.width + dx, this.adjustOrigin.bounds.height + dy);
      this.draw();
      return;
    }
    if (this.mode === 'element' && !this.elementLocked) {
      this.updateElementCandidate(point);
    } else if (this.mode === 'freehand' && this.startPoint) {
      this.points.push(point);
      this.selection = { type: 'freehand', points: [...this.points], bounds: rectFromPoints(this.points) };
    } else if (this.mode === 'polygon' && this.points.length > 0) {
      this.selection = { type: 'polygon', points: [...this.points], bounds: rectFromPoints([...this.points, point]) };
    } else if ((this.mode === 'rectangle' || this.mode === 'ellipse') && this.startPoint) {
      this.selection = { type: this.mode, bounds: normalizeShapeRect(this.startPoint, point, event.shiftKey) };
    }
    this.draw();
  };

  private onPointerUp = (event: PointerEvent): void => {
    event.preventDefault();
    if (this.adjustingSelection) {
      this.adjustingSelection = null;
      this.adjustStart = null;
      this.adjustOrigin = null;
      this.draw();
      return;
    }
    if (this.mode === 'freehand' && this.startPoint && this.points.length > 2) {
      this.selection = { type: 'freehand', points: [...this.points], bounds: rectFromPoints(this.points) };
    }
    if ((this.mode === 'rectangle' || this.mode === 'ellipse') && this.startPoint && this.livePoint) {
      this.selection = { type: this.mode, bounds: normalizeShapeRect(this.startPoint, this.livePoint, event.shiftKey) };
    }
    this.startPoint = null;
    this.draw();
  };

  private onPointerLeave = (): void => {
    if (!this.adjustingSelection) this.magnifier.style.display = 'none';
  };

  private onDoubleClick = (event: MouseEvent): void => {
    if (this.mode !== 'polygon' || this.points.length < 3) return;
    event.preventDefault();
    this.selection = { type: 'polygon', points: [...this.points], bounds: rectFromPoints(this.points) };
    this.livePoint = null;
    this.draw();
  };

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
    if (event.key === 'Enter') { event.preventDefault(); void this.confirm(); }
    if (this.mode === 'element' && event.key === '[') { event.preventDefault(); this.cycleElementCandidate(1); }
    if (this.mode === 'element' && event.key === ']') { event.preventDefault(); this.cycleElementCandidate(-1); }
    if (this.selection && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const distance = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0;
      const dy = event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0;
      this.selection = translateSelection(this.selection, dx, dy);
      this.draw();
    }
    if (event.key === 'Backspace' && this.mode === 'polygon') {
      this.points.pop();
      this.selection = this.points.length > 2 ? { type: 'polygon', points: [...this.points], bounds: rectFromPoints(this.points) } : null;
      this.draw();
    }
  }

  private draw(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = 'rgba(2, 6, 23, .42)';
    this.ctx.fillRect(0, 0, width, height);
    const selection = this.selection ?? (this.mode === 'polygon' && this.points.length ? { type: 'polygon' as const, points: this.points, bounds: rectFromPoints(this.points) } : null);
    if (selection) {
      this.ctx.save();
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.beginPath();
      if (selection.type === 'rectangle' || selection.type === 'element') {
        this.ctx.rect(selection.bounds.x, selection.bounds.y, selection.bounds.width, selection.bounds.height);
      } else if (selection.type === 'ellipse') {
        this.ctx.ellipse(selection.bounds.x + selection.bounds.width / 2, selection.bounds.y + selection.bounds.height / 2, selection.bounds.width / 2, selection.bounds.height / 2, 0, 0, Math.PI * 2);
      } else {
        const points = selection.points ?? rectToPoints(selection.bounds);
        if (points.length) {
          this.drawSmoothPath(this.ctx, points, selection.type !== 'freehand' || !this.startPoint);
        }
      }
      this.ctx.fill();
      this.ctx.restore();
      this.ctx.save();
      this.ctx.strokeStyle = '#a78bfa';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([6, 4]);
      this.ctx.beginPath();
      if (selection.type === 'rectangle' || selection.type === 'element') this.ctx.rect(selection.bounds.x, selection.bounds.y, selection.bounds.width, selection.bounds.height);
      else if (selection.type === 'ellipse') this.ctx.ellipse(selection.bounds.x + selection.bounds.width / 2, selection.bounds.y + selection.bounds.height / 2, selection.bounds.width / 2, selection.bounds.height / 2, 0, 0, Math.PI * 2);
      else {
        const points = selection.points ?? rectToPoints(selection.bounds);
        if (points.length) this.drawSmoothPath(this.ctx, points, !this.startPoint);
      }
      this.ctx.stroke();
      this.ctx.restore();
    } else if (this.mode === 'polygon' && this.points.length && this.livePoint) {
      this.ctx.save();
      this.ctx.strokeStyle = '#c4b5fd';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.drawSmoothPath(this.ctx, [...this.points, this.livePoint], false);
      this.ctx.stroke();
      this.ctx.restore();
    }
    if (this.mode === 'element' && this.candidateElement && !this.selection) {
      const rect = this.elementRect(this.candidateElement);
      this.ctx.save(); this.ctx.strokeStyle = '#34d399'; this.ctx.lineWidth = 2; this.ctx.setLineDash([5, 3]); this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height); this.ctx.restore();
    }
    if (this.mode === 'element' && this.selection?.type === 'element') {
      const bounds = this.selection.bounds;
      this.ctx.save();
      this.ctx.fillStyle = '#34d399';
      this.ctx.fillRect(bounds.x + bounds.width - 5, bounds.y + bounds.height - 5, 10, 10);
      this.ctx.restore();
    }
  }

  private drawSmoothPath(ctx: CanvasRenderingContext2D, points: readonly Point[], close: boolean): void {
    if (points.length === 0) return;
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 1) return;
    for (let index = 1; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    if (close) ctx.closePath();
  }

  private updateMagnifier(point: Point): void {
    if (!this.image.complete || !this.image.naturalWidth) return;
    const zoom = 3;
    const cssRadius = 56;
    const scaleX = this.image.naturalWidth / window.innerWidth;
    const scaleY = this.image.naturalHeight / window.innerHeight;
    const sourceWidth = (cssRadius * 2) * scaleX / zoom;
    const sourceHeight = (cssRadius * 2) * scaleY / zoom;
    this.magnifierCtx.clearRect(0, 0, 308, 308);
    this.magnifierCtx.drawImage(this.image, (point.x * scaleX) - sourceWidth / 2, (point.y * scaleY) - sourceHeight / 2, sourceWidth, sourceHeight, 0, 0, 308, 308);
    this.magnifierCtx.strokeStyle = 'rgba(255,255,255,.85)';
    this.magnifierCtx.lineWidth = 1;
    this.magnifierCtx.beginPath();
    this.magnifierCtx.moveTo(154, 0); this.magnifierCtx.lineTo(154, 308);
    this.magnifierCtx.moveTo(0, 154); this.magnifierCtx.lineTo(308, 154);
    this.magnifierCtx.stroke();
    this.magnifierCoords.textContent = `${Math.round(point.x)}, ${Math.round(point.y)}`;
    this.magnifier.style.display = 'block';
    this.magnifier.style.left = `${Math.min(window.innerWidth - 166, Math.max(8, point.x + 18))}px`;
    this.magnifier.style.top = `${Math.min(window.innerHeight - 166, Math.max(8, point.y + 18))}px`;
  }

  private showToast(message: string): void {
    this.toast.textContent = message;
    this.toast.hidden = false;
    window.setTimeout(() => { this.toast.hidden = true; }, 1800);
  }

  private async cancelSelection(): Promise<void> {
    if (this.confirmInFlight) return;
    const hasDraft = Boolean(this.selection) || this.points.length > 0 || Boolean(this.startPoint);
    if (!hasDraft) {
      this.close();
      return;
    }
    this.prepareNextSelection();
  }

  private prepareNextSelection(): void {
    if (!this.host.isConnected) return;
    // Consecutive selections on the same frozen page do not need another
    // captureVisibleTab call. This keeps the page covered and avoids exposing
    // the underlying document between selections.
    this.captureId = crypto.randomUUID();
    this.resetSelection();
    this.canvas.style.pointerEvents = 'auto';
    this.host.style.visibility = 'visible';
    this.host.style.pointerEvents = 'auto';
  }

  private async confirm(): Promise<void> {
    if (this.confirmInFlight) return;
    const selection = this.selection;
    if (!selection || selection.bounds.width < 1 || selection.bounds.height < 1) {
      this.showToast('请先绘制有效选区');
      return;
    }
    this.confirmInFlight = true;
    try {
      this.hint.textContent = '正在生成透明 PNG…';
      this.canvas.style.pointerEvents = 'none';
      this.sourceImage ??= await loadImage(this.data.dataUrl);
      const metrics = createViewportMetrics(this.sourceImage.naturalWidth, this.sourceImage.naturalHeight);
      const sourceCanvas = imageToCanvas(this.sourceImage, this.sourceImage.naturalWidth, this.sourceImage.naturalHeight);
      const cropped = cropCanvasByCssSelection(sourceCanvas, selection, metrics);
      const blob = await canvasToBlob(cropped.canvas, 'image/png');
      const thumbnailBlob = await canvasToThumbnailBlob(cropped.canvas);
      const imagePayload = await blobToTransportPayload(blob);
      const thumbnailPayload = await blobToTransportPayload(thumbnailBlob);
      const source: ClipSource = { url: location.href, title: document.title, domain: location.hostname, capturedAt: this.data.capturedAt, elementText: this.candidateElement?.textContent?.trim().slice(0, 500) || undefined };
      const response = await browser.runtime.sendMessage({ type: 'capture:complete', captureId: this.captureId, imageBlob: imagePayload, thumbnailBlob: thumbnailPayload, selection, metrics, source, projectCapture: this.data.projectCapture }) as { projectCapture?: boolean; addedToProject?: boolean; projectError?: string; projectId?: string } | undefined;
      void copyPngToClipboard(blob).catch(() => this.showToast('已保存截图，但剪贴板复制失败'));
      if (response?.projectError) this.showToast(response.projectError);
      else this.showToast(response?.projectCapture && response.addedToProject ? '已保存并加入当前项目' : '剪藏已保存');
      if (this.host.isConnected) this.prepareNextSelection();
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : '截图处理失败');
      this.canvas.style.pointerEvents = 'auto';
    } finally {
      this.confirmInFlight = false;
    }
  }

  close(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.host.remove();
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    let overlay: CaptureOverlay | null = null;
    browser.runtime.onMessage.addListener(async (message: CaptureStartMessage | { type: 'capture:error'; message: string } | { type: 'capture:prepare' }) => {
      if (message.type === 'capture:start') {
        if (overlay?.isMounted()) overlay.replaceCapture(message);
        else overlay = new CaptureOverlay(message);
      } else if (message.type === 'capture:prepare') {
        return overlay ? await overlay.prepareForCapture() : { ok: true };
      } else if (message.type === 'capture:error') {
        window.alert(`LassoClip：${message.message}`);
      }
    });
  },
});

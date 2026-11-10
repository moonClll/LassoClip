import type { ClipItemRecord } from '../../types/capture';
import type { Annotation, CanvasItem, ClipProject, ProjectBackground, Redaction } from '../../types/editor';

export type ExportFormat = 'png' | 'jpeg' | 'webp';
export const MAX_CANVAS_DIMENSION = 16384;
export const MAX_CANVAS_AREA = 268_000_000;

export interface ExportOptions {
  scale?: number;
  width?: number;
  height?: number;
  format?: ExportFormat;
  background?: string | null | ProjectBackground;
  quality?: number;
}

export interface ExportDimensions { width: number; height: number; scale: number; clamped: boolean; }

export class ExportLimitError extends Error {
  constructor(message = '导出尺寸超过浏览器 Canvas 上限') { super(message); this.name = 'ExportLimitError'; }
}

export function resolveExportDimensions(project: ClipProject, options: ExportOptions = {}): ExportDimensions {
  const requestedScale = Math.min(3, Math.max(.25, options.scale ?? 1));
  const safeBaseFactor = Math.min(1, MAX_CANVAS_DIMENSION / (Math.max(project.canvas.width, project.canvas.height) * requestedScale), Math.sqrt(MAX_CANVAS_AREA / (project.canvas.width * project.canvas.height * requestedScale * requestedScale)));
  const scale = requestedScale * safeBaseFactor;
  let width = Math.max(1, Math.round(options.width ?? project.canvas.width * scale));
  let height = Math.max(1, Math.round(options.height ?? project.canvas.height * scale));
  const factor = Math.min(1, MAX_CANVAS_DIMENSION / Math.max(width, height), Math.sqrt(MAX_CANVAS_AREA / (width * height)));
  const clamped = factor < 1;
  width = Math.max(1, Math.floor(width * factor));
  height = Math.max(1, Math.floor(height * factor));
  return { width, height, scale, clamped: clamped || safeBaseFactor < 1 };
}

function roundedPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(Math.max(0, radius), Math.min(width, height) / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawBackground(context: CanvasRenderingContext2D, project: ClipProject, scale: number, override?: string | null | ProjectBackground): void {
  if (override === null) return;
  const background = override ?? project.canvas.background;
  if (typeof background === 'string') {
    context.fillStyle = background;
    context.fillRect(0, 0, project.canvas.width * scale, project.canvas.height * scale);
    return;
  }
  const gradient = context.createLinearGradient(0, 0, project.canvas.width * scale, project.canvas.height * scale);
  const colors = background.value.match(/#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)/gi) ?? ['#f8fafc', '#e2e8f0'];
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[colors.length - 1] ?? colors[0]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, project.canvas.width * scale, project.canvas.height * scale);
}

interface DecodedClip { image: ImageBitmap | HTMLImageElement; objectUrl?: string; }

async function decodeClip(clip: ClipItemRecord): Promise<DecodedClip> {
  if (typeof createImageBitmap === 'function') return { image: await createImageBitmap(clip.imageBlob) };
  const image = new Image();
  const objectUrl = URL.createObjectURL(clip.imageBlob);
  image.src = objectUrl;
  try {
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error(`素材加载失败：${clip.name}`)); });
    return { image, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function drawImageItem(context: CanvasRenderingContext2D, item: Extract<CanvasItem, { type: 'image' }>, image: ImageBitmap | HTMLImageElement, scale: number): void {
  const margin = (item.style.margin ?? 0) * scale;
  const x = item.transform.x * scale + margin;
  const y = item.transform.y * scale + margin;
  const width = Math.max(1, item.transform.width * scale - margin * 2);
  const height = Math.max(1, item.transform.height * scale - margin * 2);
  context.save();
  context.globalAlpha = item.transform.opacity;
  context.translate((item.transform.x + item.transform.width / 2) * scale, (item.transform.y + item.transform.height / 2) * scale);
  context.rotate(item.transform.rotation * Math.PI / 180);
  if (item.style.shadow) {
    context.shadowColor = item.style.shadow.color;
    context.shadowBlur = item.style.shadow.blur * scale;
    context.shadowOffsetX = item.style.shadow.offsetX * scale;
    context.shadowOffsetY = item.style.shadow.offsetY * scale;
  }
  roundedPath(context, -item.transform.width * scale / 2 + margin, -item.transform.height * scale / 2 + margin, width, height, item.style.cornerRadius * scale);
  context.clip();
  context.drawImage(image, -item.transform.width * scale / 2 + margin, -item.transform.height * scale / 2 + margin, width, height);
  context.restore();
  if (item.style.border) {
    context.save();
    context.globalAlpha = item.transform.opacity;
    context.translate((item.transform.x + item.transform.width / 2) * scale, (item.transform.y + item.transform.height / 2) * scale);
    context.rotate(item.transform.rotation * Math.PI / 180);
    context.strokeStyle = item.style.border.color;
    context.lineWidth = item.style.border.width * scale;
    roundedPath(context, -item.transform.width * scale / 2 + margin, -item.transform.height * scale / 2 + margin, width, height, item.style.cornerRadius * scale);
    context.stroke();
    context.restore();
  }
}

function drawAnnotation(context: CanvasRenderingContext2D, annotation: Annotation, scale: number): void {
  if (!annotation.visible) return;
  const { transform, style } = annotation;
  context.save();
  context.globalAlpha = transform.opacity * (style.opacity ?? 1);
  context.translate(transform.x * scale, transform.y * scale);
  context.rotate(transform.rotation * Math.PI / 180);
  context.lineWidth = (style.strokeWidth ?? 3) * scale;
  context.strokeStyle = style.stroke ?? '#7c3aed';
  context.fillStyle = style.fill ?? 'transparent';
  context.lineCap = style.lineCap ?? 'round';
  context.lineJoin = style.lineJoin ?? 'round';
  if (annotation.type === 'text') {
    context.fillStyle = style.fill ?? '#111827';
    context.font = `${style.fontStyle ?? 'normal'} ${(style.fontSize ?? 24) * scale}px ${style.fontFamily ?? 'Inter, sans-serif'}`;
    context.textBaseline = 'top';
    annotation.text.split('\n').forEach((line, index) => context.fillText(line, 0, index * (style.fontSize ?? 24) * 1.25 * scale));
  } else if (annotation.type === 'rectangle') {
    const width = transform.width * scale;
    const height = transform.height * scale;
    if (style.fill) context.fillRect(0, 0, width, height);
    context.strokeRect(0, 0, width, height);
  } else if (annotation.type === 'ellipse') {
    context.beginPath();
    context.ellipse(transform.width * scale / 2, transform.height * scale / 2, Math.abs(transform.width * scale / 2), Math.abs(transform.height * scale / 2), 0, 0, Math.PI * 2);
    if (style.fill) context.fill();
    context.stroke();
  } else {
    const points = annotation.points;
    if (points.length > 1) {
      context.beginPath();
      context.moveTo(points[0].x * scale, points[0].y * scale);
      for (const point of points.slice(1)) context.lineTo(point.x * scale, point.y * scale);
      const isArrow = annotation.type === 'arrow';
      if (annotation.type === 'highlight') { context.lineWidth = Math.max(1 * scale, (style.strokeWidth ?? 18) * scale); context.strokeStyle = style.stroke ?? 'rgba(250,204,21,.45)'; }
      if (isArrow) {
        const end = points[points.length - 1];
        const previous = points[points.length - 2];
        const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
        const size = (style.arrowSize ?? 12) * scale;
        context.stroke();
        context.beginPath();
        context.moveTo(end.x * scale, end.y * scale);
        context.lineTo(end.x * scale - size * Math.cos(angle - Math.PI / 6), end.y * scale - size * Math.sin(angle - Math.PI / 6));
        context.moveTo(end.x * scale, end.y * scale);
        context.lineTo(end.x * scale - size * Math.cos(angle + Math.PI / 6), end.y * scale - size * Math.sin(angle + Math.PI / 6));
      } else if (annotation.type === 'drawing' || annotation.type === 'line' || annotation.type === 'highlight') context.stroke();
      else { context.closePath(); context.stroke(); }
    }
  }
  context.restore();
}

function createScratchCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

/** Applies a redaction to already flattened pixels. The source pixels are replaced. */
export function applyRedaction(context: CanvasRenderingContext2D, redaction: Redaction, scale: number): void {
  if (!redaction.visible) return;
  const x = redaction.transform.x * scale;
  const y = redaction.transform.y * scale;
  const width = Math.max(1, redaction.transform.width * scale);
  const height = Math.max(1, redaction.transform.height * scale);
  context.save();
  context.globalAlpha = redaction.transform.opacity * redaction.style.opacity;
  context.translate(x + width / 2, y + height / 2);
  context.rotate(redaction.transform.rotation * Math.PI / 180);
  if (redaction.type === 'solid') {
    context.fillStyle = redaction.style.color;
    context.fillRect(-width / 2, -height / 2, width, height);
  } else {
    const padding = redaction.type === 'blur' ? Math.ceil((redaction.style.blurRadius ?? 12) * scale * 2) : 0;
    const scratch = createScratchCanvas(width + padding * 2, height + padding * 2);
    const scratchContext = scratch.getContext('2d');
    if (!scratchContext) { context.restore(); return; }
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    scratchContext.drawImage(context.canvas, x - padding, y - padding, width + padding * 2, height + padding * 2, 0, 0, scratch.width, scratch.height);
    context.restore();
    if (redaction.type === 'blur') {
      const blurred = createScratchCanvas(scratch.width, scratch.height);
      const blurredContext = blurred.getContext('2d');
      if (blurredContext) { blurredContext.filter = `blur(${(redaction.style.blurRadius ?? 12) * scale}px)`; blurredContext.drawImage(scratch, 0, 0); context.drawImage(blurred, padding, padding, width, height, -width / 2, -height / 2, width, height); }
    } else {
      const pixelSize = Math.max(2, Math.round(redaction.style.pixelSize ?? 10));
      const small = createScratchCanvas(Math.max(1, Math.ceil(width / pixelSize)), Math.max(1, Math.ceil(height / pixelSize)));
      const smallContext = small.getContext('2d');
      if (smallContext) { smallContext.imageSmoothingEnabled = false; smallContext.drawImage(scratch, padding, padding, width, height, 0, 0, small.width, small.height); context.imageSmoothingEnabled = false; context.drawImage(small, 0, 0, small.width, small.height, -width / 2, -height / 2, width, height); context.imageSmoothingEnabled = true; }
    }
  }
  context.restore();
}

export async function renderProjectToCanvas(project: ClipProject, clips: ClipItemRecord[], options: ExportOptions = {}): Promise<HTMLCanvasElement> {
  const dimensions = resolveExportDimensions(project, options);
  const scale = dimensions.scale;
  const baseCanvas = createScratchCanvas(project.canvas.width * scale, project.canvas.height * scale);
  const context = baseCanvas.getContext('2d');
  if (!context) throw new Error('当前浏览器不支持 Canvas 2D 导出');
  const background = options.format === 'jpeg' && options.background === null ? '#ffffff' : options.background;
  drawBackground(context, project, scale, background);
  const clipMap = new Map(clips.map((clip) => [clip.id, clip]));
  const layers = [...project.items, ...project.annotations, ...project.redactions].filter((layer) => layer.visible).sort((a, b) => a.zIndex - b.zIndex);
  for (const layer of layers) {
    if (layer.type === 'image' && 'clipId' in layer) {
      const clip = clipMap.get(layer.clipId);
      if (clip) {
        const decoded = await decodeClip(clip);
        try { drawImageItem(context, layer, decoded.image, scale); }
        finally {
          if ('close' in decoded.image && typeof decoded.image.close === 'function') decoded.image.close();
          if (decoded.objectUrl) URL.revokeObjectURL(decoded.objectUrl);
        }
      }
    } else if ('bounds' in layer) applyRedaction(context, layer, scale);
    else if ('points' in layer || layer.type === 'text') drawAnnotation(context, layer as Annotation, scale);
  }
  if (baseCanvas.width === dimensions.width && baseCanvas.height === dimensions.height) return baseCanvas;
  const output = createScratchCanvas(dimensions.width, dimensions.height);
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('当前浏览器不支持 Canvas 2D 导出');
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = 'high';
  outputContext.drawImage(baseCanvas, 0, 0, dimensions.width, dimensions.height);
  return output;
}

export async function renderProjectToBlob(project: ClipProject, clips: ClipItemRecord[], options: ExportOptions = {}): Promise<Blob> {
  const canvas = await renderProjectToCanvas(project, clips, options);
  const format = options.format ?? 'png';
  const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(`${format.toUpperCase()} 导出失败`)), mimeType, format === 'png' ? undefined : Math.min(1, Math.max(.1, options.quality ?? .9))));
}

export async function renderProjectToDataUrl(project: ClipProject, clips: ClipItemRecord[], options: ExportOptions = {}): Promise<string> {
  const blob = await renderProjectToBlob(project, clips, options);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('预览生成失败'));
    reader.readAsDataURL(blob);
  });
}

export async function copyBlobToClipboard(blob: Blob): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('当前浏览器不支持图片剪贴板');
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

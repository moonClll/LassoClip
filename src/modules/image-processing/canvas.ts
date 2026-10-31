import type { Point, Rect, SelectionGeometry, ViewportMetrics } from '../../types/capture';
import { cssRectToImageRect, mapCssPointsToImage } from '../selection/coordinates';
import { pathForSelection } from '../selection/geometry';

export interface CroppedCanvas {
  canvas: HTMLCanvasElement;
  bounds: Rect;
}

function drawPolygonPath(ctx: CanvasRenderingContext2D, points: readonly Point[], bounds: Rect, smooth = false): void {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x - bounds.x, points[0].y - bounds.y);
  if (smooth && points.length > 2) {
    for (let index = 1; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      ctx.quadraticCurveTo(current.x - bounds.x, current.y - bounds.y, (current.x + next.x) / 2 - bounds.x, (current.y + next.y) / 2 - bounds.y);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x - bounds.x, last.y - bounds.y);
  } else {
    for (const point of points.slice(1)) ctx.lineTo(point.x - bounds.x, point.y - bounds.y);
  }
  ctx.closePath();
}

function drawSelectionPath(ctx: CanvasRenderingContext2D, selection: SelectionGeometry, bounds: Rect): void {
  if (selection.type === 'ellipse') {
    const centerX = selection.bounds.x + selection.bounds.width / 2 - bounds.x;
    const centerY = selection.bounds.y + selection.bounds.height / 2 - bounds.y;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, selection.bounds.width / 2, selection.bounds.height / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  drawPolygonPath(ctx, pathForSelection(selection), bounds, selection.type === 'freehand');
}

/** Crop a captured screenshot with a true alpha clip. The source and selection are image pixels. */
export function cropCanvasByImageSelection(source: HTMLCanvasElement, selection: SelectionGeometry): CroppedCanvas {
  const rawBounds = selection.type === 'ellipse' || selection.type === 'rectangle'
    ? selection.bounds
    : selection.bounds;
  const bounds = {
    x: Math.floor(rawBounds.x),
    y: Math.floor(rawBounds.y),
    width: Math.max(1, Math.ceil(rawBounds.x + rawBounds.width) - Math.floor(rawBounds.x)),
    height: Math.max(1, Math.ceil(rawBounds.y + rawBounds.height) - Math.floor(rawBounds.y)),
  };
  const canvas = document.createElement('canvas');
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable');
  ctx.save();
  drawSelectionPath(ctx, selection, bounds);
  ctx.clip();
  ctx.drawImage(source, -bounds.x, -bounds.y);
  ctx.restore();
  return { canvas, bounds };
}

export function cropCanvasByCssSelection(source: HTMLCanvasElement, selection: SelectionGeometry, metrics: ViewportMetrics): CroppedCanvas {
  const imageBounds = cssRectToImageRect(selection.bounds, metrics);
  const points = selection.points ? mapCssPointsToImage(selection.points, metrics) : undefined;
  return cropCanvasByImageSelection(source, {
    ...selection,
    bounds: imageBounds,
    points,
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export returned no data'))), type, quality);
  });
}

export async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = dataUrl;
  await image.decode();
  return image;
}

export function imageToCanvas(image: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable');
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
}

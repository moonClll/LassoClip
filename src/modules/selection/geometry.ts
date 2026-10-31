import type { Point, Rect, SelectionGeometry, SelectionType } from '../../types/capture';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function rectFromPoints(points: readonly Point[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function clampRect(rect: Rect, viewport: Rect): Rect {
  const left = clamp(rect.x, viewport.x, viewport.x + viewport.width);
  const top = clamp(rect.y, viewport.y, viewport.y + viewport.height);
  const right = clamp(rect.x + rect.width, viewport.x, viewport.x + viewport.width);
  const bottom = clamp(rect.y + rect.height, viewport.y, viewport.y + viewport.height);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function createSelection(type: SelectionType, start: Point, end: Point): SelectionGeometry {
  const bounds = normalizeRect(start, end);
  if (type === 'ellipse' || type === 'rectangle') return { type, bounds };
  return { type, points: [start, end], bounds };
}

export function pathForSelection(selection: SelectionGeometry): Point[] {
  if (selection.type === 'freehand' || selection.type === 'polygon' || selection.type === 'element') {
    return selection.points ?? [];
  }
  const { x, y, width, height } = selection.bounds;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInSelection(point: Point, selection: SelectionGeometry): boolean {
  if (selection.type === 'ellipse') {
    const rx = selection.bounds.width / 2;
    const ry = selection.bounds.height / 2;
    if (rx === 0 || ry === 0) return false;
    const cx = selection.bounds.x + rx;
    const cy = selection.bounds.y + ry;
    return ((point.x - cx) ** 2) / rx ** 2 + ((point.y - cy) ** 2) / ry ** 2 <= 1;
  }
  return pointInPolygon(point, pathForSelection(selection));
}

/** Supersampled coverage mask used by tests and non-DOM consumers. */
export function rasterizeMask(width: number, height: number, selection: SelectionGeometry, samples = 4): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(width * height);
  const total = samples * samples;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let covered = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          if (pointInSelection({ x: x + (sx + 0.5) / samples, y: y + (sy + 0.5) / samples }, selection)) covered += 1;
        }
      }
      mask[y * width + x] = Math.round((covered / total) * 255);
    }
  }
  return mask;
}

export function applyAlphaMask(rgba: Uint8ClampedArray, mask: Uint8ClampedArray): Uint8ClampedArray {
  if (rgba.length !== mask.length * 4) throw new Error('RGBA and alpha mask dimensions do not match');
  const output = new Uint8ClampedArray(rgba);
  for (let i = 0; i < mask.length; i += 1) output[i * 4 + 3] = Math.round((output[i * 4 + 3] * mask[i]) / 255);
  return output;
}

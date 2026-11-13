import type { Point } from '../../types/capture';
import type { BlurBrushSettings, Redaction } from '../../types/editor';

export const DEFAULT_BLUR_BRUSH: BlurBrushSettings = { mode: 'blur', width: 80, strength: 40 };
export const MAX_BLUR_BRUSH_WIDTH = 1000;

export function createBlurStroke(points: Point[], settings: BlurBrushSettings): Omit<Redaction, 'id' | 'zIndex'> {
  const width = Math.min(MAX_BLUR_BRUSH_WIDTH, Math.max(1, settings.width));
  const strength = Math.min(100, Math.max(1, settings.strength));
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const x = Math.min(...xs) - width / 2, y = Math.min(...ys) - width / 2;
  const bounds = { x, y, width: Math.max(...xs) - x + width / 2, height: Math.max(...ys) - y + width / 2 };
  return {
    name: '模糊笔迹', type: settings.mode, bounds, transform: { ...bounds, rotation: 0, opacity: 1 },
    points: points.map((point) => ({ x: point.x - x, y: point.y - y })),
    visible: true, locked: false,
    style: { color: '#111827', opacity: 1, brushWidth: width, strength, blurRadius: strength, pixelSize: strength * 2 },
  };
}

export function blurSettings(redaction: Redaction): BlurBrushSettings {
  return { mode: redaction.type === 'pixelate' ? 'pixelate' : 'blur', width: redaction.style.brushWidth ?? 80, strength: redaction.style.strength ?? (redaction.type === 'pixelate' ? (redaction.style.pixelSize ?? 10) / 2 : redaction.style.blurRadius ?? 12) };
}

/** Expand the editable box when width changes, keeping the stroke in place. */
export function updateBlurStroke(redaction: Redaction, settings: BlurBrushSettings): Partial<Redaction> {
  const style = { ...redaction.style, brushWidth: settings.width, strength: settings.strength, blurRadius: settings.strength, pixelSize: settings.strength * 2 };
  if (!redaction.points?.length) return { type: settings.mode, style };
  const delta = (settings.width - (redaction.style.brushWidth ?? 80)) / 2;
  const sx = redaction.transform.width / redaction.bounds.width, sy = redaction.transform.height / redaction.bounds.height;
  const bounds = { x: redaction.bounds.x - delta, y: redaction.bounds.y - delta, width: redaction.bounds.width + delta * 2, height: redaction.bounds.height + delta * 2 };
  return { type: settings.mode, style, bounds, points: redaction.points.map((p) => ({ x: p.x + delta, y: p.y + delta })), transform: { ...redaction.transform, x: redaction.transform.x - delta * sx, y: redaction.transform.y - delta * sy, width: bounds.width * sx, height: bounds.height * sy } };
}

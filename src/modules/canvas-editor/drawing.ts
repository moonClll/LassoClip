import type { Point } from '../../types/capture';
import type { AnnotationDraft, AnnotationStyle, EditorTool, Redaction } from '../../types/editor';

export interface DrawingGesture { start: Point; points: Point[]; }

export function drawingBounds(drawing: DrawingGesture): Redaction['bounds'] {
  const points = [drawing.start, ...drawing.points];
  const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
  const x = Math.min(...xs); const y = Math.min(...ys);
  return { x, y, width: Math.max(2, Math.max(...xs) - x), height: Math.max(2, Math.max(...ys) - y) };
}

export function createDrawingAnnotation(tool: EditorTool, drawing: DrawingGesture, style: AnnotationStyle): AnnotationDraft | undefined {
  if (tool === 'select' || tool === 'text' || tool.startsWith('redact-') || drawing.points.length < 2) return undefined;
  const type = tool as Exclude<AnnotationDraft['type'], 'text'>;
  const bounds = drawingBounds(drawing);
  const path = tool === 'arrow' || tool === 'line' ? [drawing.start, drawing.points[drawing.points.length - 1]] : drawing.points;
  return {
    name: `${{ drawing: '画笔', highlight: '高亮', arrow: '箭头', line: '直线', rectangle: '矩形', ellipse: '椭圆' }[type]}标注`,
    type,
    transform: { ...bounds, rotation: 0, opacity: 1 },
    visible: true, locked: false,
    points: path.map((point) => ({ x: point.x - bounds.x, y: point.y - bounds.y })),
    style: { ...style },
  };
}

export function createTextAnnotation(text: string, point: Point, style: AnnotationStyle): AnnotationDraft {
  const fontSize = style.fontSize ?? 24;
  const lines = text.split('\n');
  return {
    name: '文字标注', type: 'text', text,
    transform: { ...point, width: Math.max(240, fontSize * Math.max(...lines.map((line) => line.length))), height: Math.ceil(fontSize * 1.25 * lines.length), rotation: 0, opacity: 1 },
    visible: true, locked: false,
    style: { ...style, fill: style.fill ?? '#292823', fontSize, fontFamily: style.fontFamily ?? 'Inter, sans-serif' },
  };
}

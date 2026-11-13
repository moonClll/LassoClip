import type { AnnotationStyle, EditorTool } from '../../types/editor';

export const FONT_OPTIONS = [
  { value: 'Inter, "Microsoft YaHei", sans-serif', label: '默认无衬线' },
  { value: 'Arial, "Microsoft YaHei", sans-serif', label: 'Arial / 微软雅黑' },
  { value: '"Microsoft YaHei", sans-serif', label: '微软雅黑' },
  { value: 'SimSun, "Songti SC", serif', label: '宋体' },
  { value: 'Georgia, "Songti SC", serif', label: 'Georgia / 衬线' },
  { value: 'Consolas, monospace', label: 'Consolas / 等宽' },
];

export function defaultToolStyle(tool: EditorTool): AnnotationStyle {
  if (tool === 'text') return { fill: '#292823', fontFamily: FONT_OPTIONS[0].value, fontSize: 24, fontStyle: 'normal' };
  return { stroke: tool === 'highlight' ? '#facc15' : '#b85c3d', strokeWidth: tool === 'highlight' ? 18 : 3, opacity: tool === 'highlight' ? .45 : 1, lineCap: 'round', lineJoin: 'round', arrowSize: 12 };
}

export function isAnnotationTool(tool: EditorTool): boolean { return tool !== 'select' && tool !== 'eraser' && !tool.startsWith('redact-'); }

/** Color inputs require RGB hex; keep legacy RGBA highlights editable. */
export function colorInputValue(value: string | undefined, fallback = '#b85c3d'): string {
  if (!value) return fallback;
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  if (/^#[\da-f]{3}$/i.test(value)) return '#' + [...value.slice(1)].map((part) => part + part).join('');
  const match = value.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i);
  return match ? '#' + match.slice(1, 4).map((part) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0')).join('') : fallback;
}

export function replaceStrokeColor(style: AnnotationStyle, color: string): AnnotationStyle {
  const alpha = style.stroke?.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/i)?.[1];
  return { ...style, stroke: color, opacity: (style.opacity ?? 1) * (alpha === undefined ? 1 : Number(alpha)) };
}

import type { AnnotationStyle, AnnotationType } from '../../types/editor';
import { colorInputValue, FONT_OPTIONS, replaceStrokeColor } from '../../modules/canvas-editor/toolStyle';

interface AnnotationStyleControlsProps {
  type: AnnotationType;
  style: AnnotationStyle;
  onChange: (style: AnnotationStyle) => void;
}

export function AnnotationStyleControls({ type, style, onChange }: AnnotationStyleControlsProps): React.JSX.Element {
  const text = type === 'text';
  const font = style.fontFamily ?? FONT_OPTIONS[0].value;
  return <div className="annotation-style-controls">
    {text && <>
      <label>字体<select aria-label="字体" value={font} onChange={(event) => onChange({ ...style, fontFamily: event.target.value })}>
        {!FONT_OPTIONS.some((option) => option.value === font) && <option value={font}>{font}</option>}
        {FONT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>
      <label>字号<input aria-label="字号" type="number" min="8" max="512" value={style.fontSize ?? 24} onChange={(event) => { if (event.target.value) onChange({ ...style, fontSize: Math.max(8, Math.min(512, Number(event.target.value))) }); }} /></label>
      <label>粗细<select aria-label="粗细" value={style.fontStyle ?? 'normal'} onChange={(event) => onChange({ ...style, fontStyle: event.target.value })}>
        {!['normal', '500', 'bold'].includes(style.fontStyle ?? 'normal') && <option value={style.fontStyle}>{style.fontStyle}</option>}
        <option value="normal">常规</option><option value="500">中等</option><option value="bold">加粗</option>
      </select></label>
    </>}
    <label>颜色<input aria-label="颜色" type="color" value={colorInputValue(text ? style.fill : style.stroke, text ? '#292823' : '#b85c3d')} onChange={(event) => onChange(text ? { ...style, fill: event.target.value } : replaceStrokeColor(style, event.target.value))} /></label>
    {!text && <label>线宽<input aria-label="线宽" type="number" min="1" max="200" value={style.strokeWidth ?? (type === 'highlight' ? 18 : 3)} onChange={(event) => { if (event.target.value) onChange({ ...style, strokeWidth: Math.max(1, Math.min(200, Number(event.target.value))) }); }} /></label>}
  </div>;
}

import { MAX_BLUR_BRUSH_WIDTH } from '../../modules/canvas-editor/blurBrush';
import type { BlurBrushSettings } from '../../types/editor';

export function BlurBrushControls({ value, onChange, showWidth = true }: { value: BlurBrushSettings; onChange: (value: BlurBrushSettings) => void; showWidth?: boolean }): React.JSX.Element {
  const number = (label: string, key: 'width' | 'strength', max: number, unit: string) => <label className="blur-slider"><span>{label}</span><input aria-label={label} type="range" min={1} max={max} value={value[key]} onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })} /><input aria-label={`${label}数值`} type="number" min={1} max={max} value={value[key]} onChange={(event) => onChange({ ...value, [key]: Math.min(max, Math.max(1, Number(event.target.value))) })} /><span>{unit}</span></label>;
  return <div className="blur-controls"><label className="blur-mode"><span>效果</span><select aria-label="模糊效果" value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value as BlurBrushSettings['mode'] })}><option value="blur">柔和模糊</option><option value="pixelate">马赛克</option></select></label>{showWidth && number('笔刷粗细', 'width', MAX_BLUR_BRUSH_WIDTH, 'px')}{number('模糊程度', 'strength', 100, '')}</div>;
}

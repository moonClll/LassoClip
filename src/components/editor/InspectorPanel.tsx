import { BlurBrushControls } from './BlurBrushControls';
import { blurSettings, updateBlurStroke } from '../../modules/canvas-editor/blurBrush';
import { AnnotationStyleControls } from './AnnotationStyleControls';
import { Icon } from '../Icon';
import type { ClipItemSummary } from '../../types/capture';
import type { Annotation, CanvasItem, ClipProject, ProjectLayer, Redaction } from '../../types/editor';

interface InspectorPanelProps {
  project: ClipProject;
  clips: ClipItemSummary[];
  selectedLayer?: ProjectLayer;
  onUpdateItem: (id: string, transform: Partial<CanvasItem['transform']>) => void;
  onUpdateItemStyle: (id: string, style: Partial<Extract<CanvasItem, { type: 'image' }>['style']>) => void;
  onUpdateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  onUpdateRedaction: (id: string, patch: Partial<Redaction>) => void;
}

function NumberField({ label, value, onChange, step = '1' }: { label: string; value: number; onChange: (value: number) => void; step?: string }): React.JSX.Element { return <label className="inspector-field"><span>{label}</span><input type="number" step={step} value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0} onChange={(event) => onChange(Number(event.target.value))} /></label>; }


export function InspectorPanel({ project, clips, selectedLayer, onUpdateItem, onUpdateItemStyle, onUpdateAnnotation, onUpdateRedaction }: InspectorPanelProps): React.JSX.Element {
  if (!selectedLayer) return <section className="panel inspector-panel"><div className="panel-heading"><div><span className="panel-kicker">属性设置</span><h2>属性</h2></div></div><div className="inspector-empty"><div className="inspector-orbit"><Icon name="select" /></div><p>选择素材或标注查看属性</p></div></section>;
  const isItem = 'clipId' in selectedLayer; const isRedaction = 'bounds' in selectedLayer; const annotation = !isItem && !isRedaction ? selectedLayer as Annotation : undefined; const item = isItem ? selectedLayer as CanvasItem : undefined; const clip = item?.type === 'image' ? clips.find((entry) => entry.id === item.clipId) : undefined;
  const updateTransform = (patch: Partial<CanvasItem['transform']>) => { if (item) onUpdateItem(item.id, patch); else if (isRedaction) onUpdateRedaction((selectedLayer as Redaction).id, { transform: { ...(selectedLayer as Redaction).transform, ...patch } }); else onUpdateAnnotation((selectedLayer as Annotation).id, { transform: { ...(selectedLayer as Annotation).transform, ...patch } }); };
  return <section className="panel inspector-panel"><div className="panel-heading"><div><span className="panel-kicker">属性设置</span><h2>属性</h2></div></div><div className="inspector-content">
    <div className="selected-title"><span className="selected-symbol"><Icon name={isRedaction ? 'shield' : annotation ? 'pen' : 'grid'} /></span><div><strong>{item ? clip?.name ?? item.name ?? '素材' : isRedaction ? selectedLayer.name ?? `${{ blur: '模糊', pixelate: '像素化', solid: '实色' }[(selectedLayer as Redaction).type]}遮挡` : annotation?.name ?? `${annotation?.type} 标注`}</strong><small>{isRedaction ? '模糊效果' : annotation ? '独立标注对象' : clip?.source.domain ?? '本地素材'}</small></div></div>
    <div className="field-section"><span className="field-section-title">位置与尺寸</span><div className="field-grid"><NumberField label="X" value={selectedLayer.transform.x} onChange={(value) => updateTransform({ x: value })} /><NumberField label="Y" value={selectedLayer.transform.y} onChange={(value) => updateTransform({ y: value })} /><NumberField label="宽" value={selectedLayer.transform.width} onChange={(value) => updateTransform({ width: Math.max(2, value) })} /><NumberField label="高" value={selectedLayer.transform.height} onChange={(value) => updateTransform({ height: Math.max(2, value) })} /><NumberField label="旋转" value={selectedLayer.transform.rotation} onChange={(value) => updateTransform({ rotation: value })} /><NumberField label="透明度" step="0.05" value={selectedLayer.transform.opacity} onChange={(value) => updateTransform({ opacity: Math.min(1, Math.max(0, value)) })} /></div></div>
    {item?.type === 'image' && <div className="field-section"><span className="field-section-title">图片装饰</span><div className="field-grid"><NumberField label="圆角" value={item.style.cornerRadius} onChange={(value) => onUpdateItemStyle(item.id, { cornerRadius: Math.max(0, value) })} /><NumberField label="外边距" value={item.style.margin ?? 0} onChange={(value) => onUpdateItemStyle(item.id, { margin: Math.max(0, value) })} /></div><div className="preset-row"><button onClick={() => onUpdateItemStyle(item.id, { cornerRadius: 18, shadow: { color: 'rgba(2,6,23,.26)', blur: 18, offsetX: 0, offsetY: 8 } })}>柔和卡片</button><button onClick={() => onUpdateItemStyle(item.id, { cornerRadius: 0, border: { color: '#7c3aed', width: 2 } })}>清晰边框</button></div></div>}
    {annotation && <div className="field-section"><span className="field-section-title">{annotation.type === 'text' ? '文字样式' : '标注样式'}</span><AnnotationStyleControls type={annotation.type} style={annotation.style} onChange={(style) => {
      const patch: Partial<Annotation> = { style } as Partial<Annotation>;
      if (annotation.type === 'text' && style.fontSize !== annotation.style.fontSize) {
        const lines = annotation.text.split('\n'); const fontSize = style.fontSize ?? 24;
        patch.transform = { ...annotation.transform, width: Math.max(annotation.transform.width, fontSize * Math.max(...lines.map((line) => line.length))), height: Math.ceil(fontSize * 1.25 * lines.length) };
      }
      onUpdateAnnotation(annotation.id, patch);
    }} /></div>}
    {isRedaction && <div className="field-section"><span className="field-section-title">模糊设置</span><BlurBrushControls value={blurSettings(selectedLayer as Redaction)} showWidth={Boolean((selectedLayer as Redaction).points)} onChange={(value) => onUpdateRedaction(selectedLayer.id, updateBlurStroke(selectedLayer as Redaction, value))} /><small className="inspector-note">拖动笔迹可调整位置，导出保留当前模糊效果。</small></div>}
    <div className="inspector-note">画布 {project.canvas.width} × {project.canvas.height} · {project.canvas.layoutMode === 'auto' ? '自动布局' : '自由布局'}</div>
  </div></section>;
}

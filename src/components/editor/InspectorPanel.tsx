import type { ClipItemRecord } from '../../types/capture';
import type { CanvasItem, ClipProject } from '../../types/editor';

interface InspectorPanelProps {
  project: ClipProject;
  clips: ClipItemRecord[];
  selectedItem?: CanvasItem;
  onUpdate: (id: string, transform: Partial<CanvasItem['transform']>) => void;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }): React.JSX.Element {
  return <label className="inspector-field"><span>{label}</span><input type="number" value={Math.round(value * 10) / 10} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function InspectorPanel({ project, clips, selectedItem, onUpdate }: InspectorPanelProps): React.JSX.Element {
  if (!selectedItem) return <section className="panel inspector-panel"><div className="panel-heading"><div><span className="panel-kicker">INSPECTOR</span><h2>属性</h2></div></div><div className="inspector-empty"><div className="inspector-orbit">◎</div><p>选择画布中的素材查看属性</p></div></section>;
  const clip = selectedItem.type === 'image' ? clips.find((item) => item.id === selectedItem.clipId) : undefined;
  return <section className="panel inspector-panel"><div className="panel-heading"><div><span className="panel-kicker">INSPECTOR</span><h2>属性</h2></div></div>
    <div className="inspector-content">
      <div className="selected-title"><span className="selected-symbol">{selectedItem.type === 'image' ? '▧' : 'T'}</span><div><strong>{clip?.name ?? selectedItem.type}</strong><small>{selectedItem.type === 'image' ? clip?.source.domain : '标注对象'}</small></div></div>
      <div className="field-section"><span className="field-section-title">位置与尺寸</span><div className="field-grid"><NumberField label="X" value={selectedItem.transform.x} onChange={(value) => onUpdate(selectedItem.id, { x: value })} /><NumberField label="Y" value={selectedItem.transform.y} onChange={(value) => onUpdate(selectedItem.id, { y: value })} /><NumberField label="宽" value={selectedItem.transform.width} onChange={(value) => onUpdate(selectedItem.id, { width: Math.max(1, value) })} /><NumberField label="高" value={selectedItem.transform.height} onChange={(value) => onUpdate(selectedItem.id, { height: Math.max(1, value) })} /></div></div>
      <div className="field-section"><span className="field-section-title">外观</span><div className="field-grid"><NumberField label="旋转" value={selectedItem.transform.rotation} onChange={(value) => onUpdate(selectedItem.id, { rotation: value })} /><NumberField label="透明度" value={selectedItem.transform.opacity} onChange={(value) => onUpdate(selectedItem.id, { opacity: Math.min(1, Math.max(0, value)) })} /></div></div>
      <div className="inspector-note">画布 {project.canvas.width} × {project.canvas.height} · {project.canvas.layoutMode === 'auto' ? '自动布局' : '自由布局'}</div>
    </div>
  </section>;
}

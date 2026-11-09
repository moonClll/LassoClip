import { Icon } from '../Icon';
import type { ClipItemSummary } from '../../types/capture';
import { annotationSelectionId, redactionSelectionId, type ClipProject, type ProjectLayer } from '../../types/editor';

interface LayerPanelProps {
  project: ClipProject;
  clips: ClipItemSummary[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onReorder: (direction: 'up' | 'down' | 'top' | 'bottom') => void;
  onVisibility: (id: string, visible: boolean) => void;
  onLock: (id: string, locked: boolean) => void;
  onRename: (id: string, name: string) => void;
}

function selectionId(layer: ProjectLayer): string { return 'clipId' in layer ? layer.id : 'bounds' in layer ? redactionSelectionId(layer.id) : annotationSelectionId(layer.id); }
function labelFor(layer: ProjectLayer, clips: ClipItemSummary[]): string { return layer.name ?? ('clipId' in layer ? clips.find((clip) => clip.id === layer.clipId)?.name ?? '缺失素材' : 'text' in layer ? layer.text.slice(0, 24) || '文字标注' : 'bounds' in layer ? `${layer.type} 遮挡` : `${layer.type} 标注`); }

export function LayerPanel({ project, clips, selectedIds, onSelect, onDelete, onDuplicate, onReorder, onVisibility, onLock, onRename }: LayerPanelProps): React.JSX.Element {
  const items: ProjectLayer[] = [...project.items, ...project.annotations, ...project.redactions].sort((a, b) => b.zIndex - a.zIndex);
  return <section className="panel layer-panel">
    <div className="panel-heading"><div><span className="panel-kicker">图层管理</span><h2>图层</h2></div><div className="layer-actions"><button disabled={!selectedIds.length} onClick={() => onReorder('bottom')} title="置底" aria-label="置底"><Icon name="bottom" /></button><button disabled={!selectedIds.length} onClick={() => onReorder('down')} title="下移" aria-label="下移"><Icon name="down" /></button><button disabled={!selectedIds.length} onClick={() => onReorder('up')} title="上移" aria-label="上移"><Icon name="up" /></button><button disabled={!selectedIds.length} onClick={() => onReorder('top')} title="置顶" aria-label="置顶"><Icon name="top" /></button><button disabled={!selectedIds.length} onClick={onDuplicate} title="复制图层" aria-label="复制图层"><Icon name="copy" /></button><button disabled={!selectedIds.length} onClick={onDelete} title="删除图层" aria-label="删除图层"><Icon name="trash" /></button></div></div>
    {items.length === 0 ? <div className="layer-empty">添加素材或标注后会显示在这里</div> : <div className="layer-list">
      {items.map((item) => { const id = selectionId(item); const selected = selectedIds.includes(id); const label = labelFor(item, clips); return <div key={id} className={`layer-row ${selected ? 'selected' : ''}`} draggable onDragStart={(event) => event.dataTransfer.setData('text/layer-id', id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData('text/layer-id'); if (!sourceId || sourceId === id) return; onSelect([sourceId]); onReorder(event.nativeEvent.offsetY < event.currentTarget.clientHeight / 2 ? 'up' : 'down'); }}>
        <button className="layer-main" onClick={(event) => onSelect(event.shiftKey ? (selected ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]) : [id])} onDoubleClick={() => { const next = window.prompt('重命名图层', label); if (next) onRename(item.id, next); }}><span className={`layer-symbol ${'bounds' in item ? 'redaction' : 'text' in item ? 'text' : 'image'}`}><Icon name={'bounds' in item ? 'shield' : 'text' in item ? 'text' : 'layers'} /></span><span className="layer-label">{label}</span></button>
        <button className="layer-icon" onClick={() => onVisibility(item.id, !item.visible)} title={item.visible ? '隐藏' : '显示'} aria-label={item.visible ? '隐藏图层' : '显示图层'}><Icon name={item.visible ? 'eye' : 'eyeOff'} /></button><button className="layer-icon" onClick={() => onLock(item.id, !item.locked)} title={item.locked ? '解锁' : '锁定'} aria-label={item.locked ? '解锁图层' : '锁定图层'}><Icon name={item.locked ? 'lock' : 'unlock'} /></button>
      </div>; })}
    </div>}
    <div className="layer-hint">拖动图层行调整顺序 · 双击名称重命名</div>
  </section>;
}

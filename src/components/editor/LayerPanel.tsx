import type { ClipItemRecord } from '../../types/capture';
import type { ClipProject } from '../../types/editor';

interface LayerPanelProps {
  project: ClipProject;
  clips: ClipItemRecord[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onReorder: (direction: 'up' | 'down' | 'top' | 'bottom') => void;
  onVisibility: (id: string, visible: boolean) => void;
  onLock: (id: string, locked: boolean) => void;
  onRename: (id: string, name: string) => void;
}

export function LayerPanel({ project, clips, selectedIds, onSelect, onDelete, onDuplicate, onReorder, onVisibility, onLock, onRename }: LayerPanelProps): React.JSX.Element {
  const names = new Map(clips.map((clip) => [clip.id, clip.name]));
  const items = [...project.items].sort((a, b) => b.zIndex - a.zIndex);
  const selectedId = selectedIds[0];
  return <section className="panel layer-panel">
    <div className="panel-heading"><div><span className="panel-kicker">LAYERS</span><h2>图层</h2></div><div className="layer-actions"><button disabled={!selectedIds.length} onClick={() => onReorder('bottom')} title="置底">⇓</button><button disabled={!selectedIds.length} onClick={() => onReorder('down')} title="下移">↓</button><button disabled={!selectedIds.length} onClick={() => onReorder('up')} title="上移">↑</button><button disabled={!selectedIds.length} onClick={() => onReorder('top')} title="置顶">⇑</button><button disabled={!selectedIds.length} onClick={onDuplicate} title="复制图层">⧉</button><button disabled={!selectedIds.length} onClick={onDelete} title="删除图层">⌫</button></div></div>
    {items.length === 0 ? <div className="layer-empty">添加素材后会显示在这里</div> : <div className="layer-list">
      {items.map((item) => {
        const selected = selectedIds.includes(item.id);
        const label = item.name ?? (item.type === 'image' ? names.get(item.clipId) ?? '缺失素材' : item.type);
        return <div key={item.id} className={`layer-row ${selected ? 'selected' : ''}`} draggable onDragStart={(event) => { event.dataTransfer.setData('text/layer-id', item.id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData('text/layer-id'); if (!sourceId || sourceId === item.id) return; onSelect([sourceId]); onReorder(event.nativeEvent.offsetY < event.currentTarget.clientHeight / 2 ? 'up' : 'down'); }}>
          <button className="layer-main" onClick={(event) => onSelect(event.shiftKey ? (selected ? selectedIds.filter((id) => id !== item.id) : [...selectedIds, item.id]) : [item.id])} onDoubleClick={() => { const next = window.prompt('重命名图层', label); if (next) onRename(item.id, next); }}><span className={`layer-symbol ${item.type}`}>{item.type === 'image' ? '▧' : 'T'}</span><span className="layer-label">{label}</span></button>
          <button className="layer-icon" onClick={() => onVisibility(item.id, !item.visible)} title={item.visible ? '隐藏' : '显示'}>{item.visible ? '◉' : '◌'}</button>
          <button className="layer-icon" onClick={() => onLock(item.id, !item.locked)} title={item.locked ? '解锁' : '锁定'}>{item.locked ? '🔒' : '⌑'}</button>
        </div>;
      })}
    </div>}
    {selectedId && <div className="layer-hint">拖动图层行调整顺序 · 双击名称重命名</div>}
  </section>;
}

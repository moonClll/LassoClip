import { useEffect, useState } from 'react';
import type { ClipItemRecord } from '../../types/capture';
import type { ClipProject } from '../../types/editor';

interface AssetPanelProps {
  clips: ClipItemRecord[];
  project: ClipProject;
  onAdd: (clip: ClipItemRecord) => void;
}

function AssetThumbnail({ blob }: { blob: Blob }): React.JSX.Element {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return <>{src ? <img src={src} alt="" /> : <span className="thumb-placeholder" />}</>;
}

export function AssetPanel({ clips, project, onAdd }: AssetPanelProps): React.JSX.Element {
  const used = new Set(project.items.filter((item) => item.type === 'image').map((item) => item.clipId));
  return (
    <section className="panel asset-panel">
      <div className="panel-heading"><div><span className="panel-kicker">LIBRARY</span><h2>素材</h2></div><span className="count-pill">{clips.length}</span></div>
      {clips.length === 0 ? (
        <div className="empty-panel"><div className="empty-icon">✦</div><h3>还没有剪藏素材</h3><p>回到网页使用 Quick Clip，素材会自动出现在这里。</p></div>
      ) : (
        <div className="asset-list">
          {clips.map((clip) => (
            <article className="asset-card" key={clip.id}>
              <div className="asset-thumb"><AssetThumbnail blob={clip.imageBlob} /></div>
              <div className="asset-meta"><strong>{clip.name}</strong><span>{clip.source.domain || '本地素材'} · {clip.metadata.width}×{clip.metadata.height}</span></div>
              <button className="asset-add" onClick={() => onAdd(clip)} aria-label={`添加 ${clip.name}`}>+</button>
              {used.has(clip.id) && <span className="used-dot" title="已添加到项目" />}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

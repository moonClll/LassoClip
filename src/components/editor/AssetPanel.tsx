import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { ClipItemSummary } from '../../types/capture';
import type { ClipProject } from '../../types/editor';
import { getPreviewUrl } from '../../modules/media/blobPreview';

interface AssetPanelProps {
  clips: ClipItemSummary[];
  project: ClipProject;
  onAdd: (clip: ClipItemSummary) => void;
}

function AssetThumbnail({ clipId }: { clipId: string }): React.JSX.Element {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let disposed = false;
    void getPreviewUrl(clipId).then((url) => { if (!disposed && url) setSrc(url); });
    return () => { disposed = true; };
  }, [clipId]);
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
              <div className="asset-thumb"><AssetThumbnail clipId={clip.id} /></div>
              <div className="asset-meta"><strong>{clip.name}</strong><span>{clip.source.domain || '本地素材'} · {clip.metadata.width}×{clip.metadata.height}</span></div>
              <button className="asset-open-library" onClick={() => void browser.tabs.create({ url: browser.runtime.getURL(`/library.html?clipId=${encodeURIComponent(clip.id)}&projectId=${encodeURIComponent(project.id)}` as never) })} aria-label={`在素材库查看 ${clip.name}`}>↗</button><button className="asset-add" onClick={() => onAdd(clip)} aria-label={`添加 ${clip.name}`}>+</button>
              {used.has(clip.id) && <span className="used-dot" title="已添加到项目" />}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

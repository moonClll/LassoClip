import { useEffect, useMemo, useState } from 'react';
import { copyBlobToClipboard, renderProjectToBlob, resolveExportDimensions, type ExportFormat } from '../../modules/canvas-editor/export';
import type { ClipItemRecord, ClipItemSummary } from '../../types/capture';
import type { ClipProject } from '../../types/editor';
import { getClip } from '../../modules/storage/clipStore';
import { projectClipIds } from '../../types/editor';

interface ExportDialogProps { project: ClipProject; clips: ClipItemSummary[]; onClose: () => void; }

function extension(format: ExportFormat): string { return format === 'jpeg' ? 'jpg' : format; }

export function ExportDialog({ project, clips, onClose }: ExportDialogProps): React.JSX.Element {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [scale, setScale] = useState(2);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [lockAspect, setLockAspect] = useState(true);
  const [transparent, setTransparent] = useState(true);
  const [background, setBackground] = useState('#ffffff');
  const [quality, setQuality] = useState(.9);
  const [filename, setFilename] = useState(project.name || 'lassoclip-export');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewState, setPreviewState] = useState('正在生成预览…');
  const [actionState, setActionState] = useState('');
  const [loadedClips, setLoadedClips] = useState<ClipItemRecord[]>([]);

  useEffect(() => {
    let disposed = false;
    void Promise.all(projectClipIds(project).map((id) => getClip(id))).then((records) => { if (!disposed) setLoadedClips(records.filter((record): record is ClipItemRecord => Boolean(record))); });
    return () => { disposed = true; };
  }, [project]);

  const aspect = project.canvas.width / Math.max(1, project.canvas.height);
  const options = useMemo(() => ({ format, scale, width: width ? Math.max(1, Number(width)) : undefined, height: height ? Math.max(1, Number(height)) : undefined, background: format === 'jpeg' || !transparent ? background : null, quality }), [background, format, height, quality, scale, transparent, width]);
  const dimensions = useMemo(() => resolveExportDimensions(project, options), [options, project]);

  useEffect(() => {
    let disposed = false;
    setPreviewState('正在生成预览…');
    void renderProjectToBlob(project, loadedClips, options).then((blob) => {
      if (disposed) return;
      setPreviewUrl((oldUrl) => { if (oldUrl) URL.revokeObjectURL(oldUrl); return URL.createObjectURL(blob); });
      setPreviewState('预览已更新');
    }).catch((error) => { if (!disposed) setPreviewState(error instanceof Error ? error.message : '预览生成失败'); });
    return () => { disposed = true; };
  }, [loadedClips, options, project]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const setWidthLocked = (value: string) => { setWidth(value); if (lockAspect && value) setHeight(String(Math.max(1, Math.round(Number(value) / aspect)))); };
  const setHeightLocked = (value: string) => { setHeight(value); if (lockAspect && value) setWidth(String(Math.max(1, Math.round(Number(value) * aspect)))); };
  const safeFilename = filename.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\.+$/, '') || 'lassoclip-export';
  const makeBlob = async () => renderProjectToBlob(project, loadedClips, options);
  const download = async () => { try { setActionState('正在导出…'); const blob = await makeBlob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${safeFilename}.${extension(format)}`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setActionState(`已导出 ${dimensions.width} × ${dimensions.height}`); } catch (error) { setActionState(error instanceof Error ? error.message : '导出失败'); } };
  const copy = async () => { try { setActionState('正在复制…'); await copyBlobToClipboard(await renderProjectToBlob(project, loadedClips, { ...options, format: 'png' })); setActionState('已复制到剪贴板'); } catch (error) { setActionState(error instanceof Error ? error.message : '复制失败'); } };

  return <div className="export-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="export-dialog" role="dialog" aria-modal="true" aria-label="导出设置">
      <div className="export-heading"><div><span className="panel-kicker">EXPORT STUDIO</span><h2>导出与分享</h2></div><button className="dialog-close" onClick={onClose} aria-label="关闭">×</button></div>
      <div className="export-body"><div className="export-preview"><div className="preview-frame">{previewUrl ? <img src={previewUrl} alt="导出预览" /> : <div className="preview-loading">{previewState}</div>}</div><div className="preview-meta"><span>{previewState}</span><span>{dimensions.width} × {dimensions.height}px{dimensions.clamped ? ' · 已按浏览器上限缩小' : ''}</span></div></div>
        <div className="export-controls"><label>格式<select value={format} onChange={(event) => { const next = event.target.value as ExportFormat; setFormat(next); if (next === 'jpeg') setTransparent(false); }}><option value="png">PNG · 透明</option><option value="jpeg">JPG · 通用</option><option value="webp">WebP · 高效</option></select></label>
          <label>分辨率<select value={scale} onChange={(event) => setScale(Number(event.target.value))}><option value="1">1x · 标准</option><option value="2">2x · 高清</option><option value="3">3x · 超清</option></select></label>
          <div className="export-field-row"><label>宽度<input type="number" min="1" value={width} placeholder={String(Math.round(project.canvas.width * scale))} onChange={(event) => setWidthLocked(event.target.value)} /></label><button className={`lock-toggle ${lockAspect ? 'active' : ''}`} onClick={() => setLockAspect((value) => !value)} title="锁定宽高比">{lockAspect ? '锁' : '解'}</button><label>高度<input type="number" min="1" value={height} placeholder={String(Math.round(project.canvas.height * scale))} onChange={(event) => setHeightLocked(event.target.value)} /></label></div>
          <label className="checkbox-row"><input type="checkbox" checked={lockAspect} onChange={(event) => setLockAspect(event.target.checked)} />锁定宽高比</label>
          <label className="checkbox-row"><input type="checkbox" checked={transparent && format !== 'jpeg'} disabled={format === 'jpeg'} onChange={(event) => setTransparent(event.target.checked)} />透明背景</label>
          {!transparent || format === 'jpeg' ? <label>背景颜色<input type="color" value={background} onChange={(event) => setBackground(event.target.value)} /></label> : null}
          {format !== 'png' && <label>质量 <span className="quality-value">{Math.round(quality * 100)}%</span><input type="range" min=".1" max="1" step=".05" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label>}
          <label>文件名<input value={filename} onChange={(event) => setFilename(event.target.value)} /></label>
        </div></div>
      <div className="export-footer"><span className="export-action-state">{actionState}</span><button className="toolbar-button subtle" onClick={() => void copy()}>复制 PNG</button><button className="toolbar-button export-button" onClick={() => void download()}>下载 {extension(format).toUpperCase()}</button></div>
    </section>
  </div>;
}

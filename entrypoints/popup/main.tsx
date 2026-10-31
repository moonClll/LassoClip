import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { listClips } from '../../src/modules/storage/clipStore';
import '../../src/styles/popup.css';

function Popup(): React.JSX.Element {
  const [status, setStatus] = useState('准备就绪');
  const [recentCount, setRecentCount] = useState(0);

  useEffect(() => {
    void listClips().then((clips) => setRecentCount(clips.length)).catch(() => setRecentCount(0));
  }, []);

  const startCapture = async (): Promise<void> => {
    setStatus('正在启动截图…');
    try {
      const response = await browser.runtime.sendMessage({ type: 'capture:request' }) as { ok?: boolean; message?: string } | undefined;
      if (response?.ok) window.close();
      else setStatus(response?.message ?? '当前页面无法启动截图');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '扩展后台暂不可用');
    }
  };

  const openEditor = async (): Promise<void> => {
    setStatus('正在打开 Clip Studio…');
    try {
      await browser.runtime.sendMessage({ type: 'editor:open' });
      window.close();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '编辑器暂不可用');
    }
  };

  const openLibrary = async (): Promise<void> => {
    setStatus('正在打开 Clip Library…');
    try { await browser.runtime.sendMessage({ type: 'library:open' }); window.close(); }
    catch (error) { setStatus(error instanceof Error ? error.message : '素材库暂不可用'); }
  };

  return (
    <main className="popup-shell">
      <header className="brand-row">
        <div className="brand-mark">L</div>
        <div><div className="brand-name">LassoClip</div><div className="brand-tag">Capture anything. Shape it. Reuse it.</div></div>
      </header>
      <section className="hero-card">
        <div className="eyebrow">QUICK CLIP</div>
        <h1>把网页上的视觉内容剪下来</h1>
        <p>冻结当前画面，使用自由形状、几何选区或元素吸附完成一次剪藏。</p>
        <button className="primary-button" onClick={() => void startCapture()}><span>⌁</span> 开始截图</button>
        <div className="shortcut">快捷键 <kbd>Alt</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>L</kbd></div>
      </section>
      <section className="quick-grid">
        <button className="secondary-card" onClick={() => void startCapture()}><span className="card-icon purple">✦</span><span><b>Quick Clip</b><small>快速生成透明 PNG</small></span><span className="arrow">↗</span></button>
        <button className="secondary-card" onClick={() => void openLibrary()}><span className="card-icon blue">▦</span><span><b>Clip Library</b><small>浏览全部素材</small></span><span className="arrow">↗</span></button>
      </section>
      <button className="popup-studio-link" onClick={() => void openEditor()}>直接打开 Clip Studio <span>↗</span></button>
      <footer className="footer-row"><span>本地素材 <b>{recentCount}</b></span><span className="status"><i /> {status}</span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);

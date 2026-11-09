import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { listClipSummaries } from '../../src/modules/storage/clipStore';
import { Icon } from '../../src/components/Icon';
import '../../src/styles/popup.css';

function Popup(): React.JSX.Element {
  const [status, setStatus] = useState('准备就绪');
  const [recentCount, setRecentCount] = useState(0);
  const [projectCapture, setProjectCapture] = useState<{ active: boolean; projectName?: string }>({ active: false });

  useEffect(() => {
    void listClipSummaries().then((clips) => setRecentCount(clips.length)).catch(() => setRecentCount(0));
    void browser.runtime.sendMessage({ type: 'project-capture:status' }).then((result) => {
      const value = result as { active?: boolean; projectName?: string; error?: string } | undefined;
      setProjectCapture({ active: Boolean(value?.active), projectName: value?.projectName });
      if (value?.error) setStatus(value.error);
    }).catch(() => undefined);
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

  const exitProjectCapture = async (): Promise<void> => {
    await browser.runtime.sendMessage({ type: 'project-capture:stop' });
    setProjectCapture({ active: false });
    setStatus('已退出项目剪藏模式');
  };

  return (
    <main className="popup-shell">
      <header className="brand-row">
        <div className="brand-mark">L</div>
        <div><div className="brand-name">LassoClip</div><div className="brand-tag">留住灵感，自由创作</div></div>
      </header>
      <section className="hero-card">
        <h1>剪藏此刻的灵感</h1>
        <p>框选网页上的喜欢之处，<br />收进你的视觉素材库。</p>
        <button className="primary-button" onClick={() => void startCapture()}><Icon name="capture" /> 开始截图</button>
        <div className="shortcut">快捷键 <kbd>Alt</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>L</kbd></div>
      </section>
      {projectCapture.active && <section className="project-capture-card"><div className="eyebrow">连续剪藏中</div><strong>保存到「{projectCapture.projectName || '当前项目'}」</strong><p>下一次截图将自动加入此项目。</p><button className="text-button" onClick={() => void exitProjectCapture()}>退出连续剪藏</button></section>}
      <section className="quick-grid">
        <button className="secondary-card" onClick={() => void openLibrary()}><Icon name="grid" /><span><b>素材库</b><small>浏览剪藏</small></span><Icon name="arrowUpRight" /></button>
        <button className="secondary-card" onClick={() => void openEditor()}><Icon name="edit" /><span><b>编辑器</b><small>自由创作</small></span><Icon name="arrowUpRight" /></button>
      </section>
      <footer className="footer-row"><span>本地素材 <b>{recentCount}</b></span><span className="status" role="status">{status}</span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);

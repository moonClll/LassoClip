import { Component, type ErrorInfo, type ReactNode } from 'react';

interface EditorErrorBoundaryProps {
  children: ReactNode;
}

interface EditorErrorBoundaryState {
  error: Error | null;
}

/** Keeps an editor render failure recoverable instead of leaving a blank page. */
export class EditorErrorBoundary extends Component<EditorErrorBoundaryProps, EditorErrorBoundaryState> {
  state: EditorErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): EditorErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('LassoClip Editor render error', error, info);
  }

  private reloadEditor = (): void => {
    window.location.reload();
  };

  private openLibrary = (): void => {
    window.location.assign('library.html');
  };

  render(): React.JSX.Element {
    if (!this.state.error) return <>{this.props.children}</>;
    return (
      <main className="editor-state error-state" role="alert">
        <div className="state-orb">!</div>
        <h1>Clip Studio 暂时无法显示</h1>
        <p>编辑器遇到运行时错误，项目数据仍保留在本地。</p>
        <div>
          <button onClick={this.reloadEditor}>重新加载 Editor</button>
          <button onClick={this.openLibrary}>返回 Library</button>
        </div>
        <details>
          <summary>查看错误详情</summary>
          <pre>{this.state.error.message}</pre>
        </details>
      </main>
    );
  }
}

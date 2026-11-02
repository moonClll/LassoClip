import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';
import { createProject, DB_NAME } from '../src/modules/storage/clipStore';
import { createDefaultProject, type ClipProject } from '../src/types/editor';
import { selectedEntity } from '../src/stores/editorStore';
import { useEditorStore } from '../src/stores/editorStore';
import { EditorErrorBoundary } from '../src/components/editor/EditorErrorBoundary';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ active: false }),
      getURL: (path: string) => path,
    },
    tabs: { create: vi.fn() },
  },
}));

vi.mock('../src/components/editor/StudioViewport', () => ({
  StudioViewport: () => <div data-testid="studio-viewport" />,
}));

import { EditorShell } from '../src/components/editor/EditorShell';

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('test database was blocked'));
  });
}

async function waitForEditorDom(): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });
    if (document.querySelector('.editor-app') || document.querySelector('.editor-state.error-state')) return;
  }
}

describe('Editor runtime safety', () => {
  beforeEach(async () => {
    await deleteDatabase();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('treats an empty selection as a valid initial state', () => {
    const project: ClipProject = createDefaultProject('mount test');
    expect(selectedEntity(project, [])).toBeUndefined();
  });

  it('mounts the real EditorShell with an empty project selection', async () => {
    const rootElement = document.getElementById('root');
    expect(rootElement).not.toBeNull();
    const root = createRoot(rootElement!);
    await act(async () => {
      root.render(
        <EditorErrorBoundary>
          <EditorShell />
        </EditorErrorBoundary>,
      );
    });
    await waitForEditorDom();
    expect(document.querySelector('.editor-app')).not.toBeNull();
    expect(document.querySelector('.editor-state.error-state')).toBeNull();
    await act(async () => {
      root.unmount();
    });
  });

  it('keeps the blank loading editor recoverable before project initialization', async () => {
    const root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root.render(
        <EditorErrorBoundary>
          <EditorShell />
        </EditorErrorBoundary>,
      );
    });
    expect(document.querySelector('.editor-state:not(.error-state)')).not.toBeNull();
    await act(async () => {
      root.unmount();
    });
  });

  it('mounts an existing project without a selected layer', async () => {
    await createProject(createDefaultProject('existing project'));
    const root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root.render(
        <EditorErrorBoundary>
          <EditorShell />
        </EditorErrorBoundary>,
      );
    });
    await waitForEditorDom();
    expect(document.querySelector('.editor-app')).not.toBeNull();
    expect(document.querySelector('.editor-state.error-state')).toBeNull();
    await act(async () => {
      root.unmount();
    });
  });

  it('shows a recovery screen when an editor render throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rootElement = document.getElementById('root');
    const root = createRoot(rootElement!);
    function BrokenEditor(): React.JSX.Element {
      throw new Error('render failure');
    }
    await act(async () => {
      root.render(
        <EditorErrorBoundary>
          <BrokenEditor />
        </EditorErrorBoundary>,
      );
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Clip Studio 暂时无法显示');
    expect(document.querySelector('details')?.textContent).toContain('render failure');
    errorSpy.mockRestore();
    await act(async () => {
      root.unmount();
    });
  });
});

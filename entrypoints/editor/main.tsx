import { createRoot } from 'react-dom/client';
import { EditorErrorBoundary } from '../../src/components/editor/EditorErrorBoundary';
import { EditorShell } from '../../src/components/editor/EditorShell';

createRoot(document.getElementById('root')!).render(
  <EditorErrorBoundary>
    <EditorShell />
  </EditorErrorBoundary>,
);

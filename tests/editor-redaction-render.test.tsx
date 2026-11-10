import { Children, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';
import { createDefaultProject, type Redaction } from '../src/types/editor';
import { defaultToolStyle } from '../src/modules/canvas-editor/toolStyle';

// Konva containers only accept scene nodes. A raw JSX space becomes an invalid
// text instance and crashes the real renderer when the first redaction mounts.
vi.mock('react-konva', () => {
  const container = ({ children }: { children?: ReactNode }) => {
    Children.forEach(children, (child) => {
      if (typeof child === 'string' || typeof child === 'number') throw new Error('Konva containers cannot render raw text');
    });
    return <div>{children}</div>;
  };
  const shape = () => <span />;
  return { Stage: container, Layer: container, Group: container, Rect: shape, Text: shape, Arrow: shape, Ellipse: shape, Image: shape, Line: shape, Transformer: shape };
});

import { StudioViewport } from '../src/components/editor/StudioViewport';

describe('redaction scene rendering', () => {
  it.each(['blur', 'pixelate', 'solid'] as const)('renders an existing %s redaction without invalid Konva text nodes', (type) => {
    const project = createDefaultProject();
    const bounds = { x: 40, y: 60, width: 180, height: 90 };
    const redaction: Redaction = { id: 'mask', type, bounds, transform: { ...bounds, rotation: 0, opacity: 1 }, visible: true, locked: false, zIndex: 0, style: { color: '#111827', opacity: 1, blurRadius: 12, pixelSize: 10 } };
    project.redactions.push(redaction);
    const noop = () => undefined;
    expect(() => renderToStaticMarkup(<StudioViewport project={project} clips={[]} selectedIds={['redaction:mask']} activeTool="select" toolStyle={defaultToolStyle('select')} onTool={noop} onSelect={noop} onUpdateItems={noop} onAddAnnotation={noop} onUpdateAnnotation={noop} onUpdateAnnotations={noop} onAddRedaction={noop} onUpdateRedaction={noop} onUpdateRedactions={noop} onSetViewport={noop} onStageReady={noop} />)).not.toThrow();
  });
});

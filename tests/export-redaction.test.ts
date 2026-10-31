import { applyRedaction, resolveExportDimensions } from '../src/modules/canvas-editor/export';
import { createDefaultProject } from '../src/types/editor';
import type { Redaction } from '../src/types/editor';

function redaction(type: Redaction['type']): Redaction {
  return { id: 'r', type, transform: { x: 10, y: 20, width: 80, height: 40, rotation: 0, opacity: 1 }, bounds: { x: 10, y: 20, width: 80, height: 40 }, zIndex: 1, visible: true, locked: false, style: { color: '#000', opacity: 1, blurRadius: 8, pixelSize: 6 } };
}

describe('redaction export path', () => {
  it('writes a solid mask into the output context', () => {
    const calls: string[] = [];
    const context = { canvas: {}, save: () => calls.push('save'), restore: () => calls.push('restore'), translate: () => calls.push('translate'), rotate: () => calls.push('rotate'), fillRect: () => calls.push('fillRect'), set globalAlpha(_: number) {}, set fillStyle(_: string) {} } as unknown as CanvasRenderingContext2D;
    applyRedaction(context, redaction('solid'), 2);
    expect(calls).toEqual(['save', 'translate', 'rotate', 'fillRect', 'restore']);
  });

  it('keeps mask types distinct for the raster pass', () => {
    expect(redaction('blur').type).toBe('blur');
    expect(redaction('pixelate').type).toBe('pixelate');
    expect(redaction('solid').type).toBe('solid');
  });

  it('clamps oversized exports to browser-safe dimensions', () => {
    const project = createDefaultProject();
    project.canvas.width = 20_000;
    project.canvas.height = 20_000;
    const dimensions = resolveExportDimensions(project, { scale: 3 });
    expect(dimensions.clamped).toBe(true);
    expect(dimensions.width).toBeLessThanOrEqual(16384);
    expect(dimensions.height).toBeLessThanOrEqual(16384);
    expect(dimensions.width * dimensions.height).toBeLessThanOrEqual(268_000_000);
  });
});

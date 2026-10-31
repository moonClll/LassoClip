import { cropCanvasByImageSelection } from '../src/modules/image-processing/canvas';

describe('canvas crop contract', () => {
  it('creates an outward-rounded output and performs a real clip/draw sequence', () => {
    const calls: string[] = [];
    const context = {
      beginPath: () => calls.push('beginPath'),
      moveTo: () => calls.push('moveTo'),
      lineTo: () => calls.push('lineTo'),
      closePath: () => calls.push('closePath'),
      quadraticCurveTo: () => calls.push('quadraticCurveTo'),
      clip: () => calls.push('clip'),
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      drawImage: () => calls.push('drawImage'),
      ellipse: () => calls.push('ellipse'),
    } as unknown as CanvasRenderingContext2D;
    const output = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
    vi.stubGlobal('document', { createElement: () => output });
    const source = { width: 20, height: 20 } as HTMLCanvasElement;
    const result = cropCanvasByImageSelection(source, {
      type: 'polygon',
      points: [{ x: 1.2, y: 2.3 }, { x: 7.1, y: 2.3 }, { x: 4, y: 8.9 }],
      bounds: { x: 1.2, y: 2.3, width: 5.9, height: 6.6 },
    });
    expect(result.bounds).toEqual({ x: 1, y: 2, width: 7, height: 7 });
    expect(output.width).toBe(7);
    expect(output.height).toBe(7);
    expect(calls).toEqual(['save', 'beginPath', 'moveTo', 'lineTo', 'lineTo', 'closePath', 'clip', 'drawImage', 'restore']);
    vi.unstubAllGlobals();
  });

  it('smooths freehand paths before clipping', () => {
    const calls: string[] = [];
    const context = {
      beginPath: () => calls.push('beginPath'), moveTo: () => calls.push('moveTo'), lineTo: () => calls.push('lineTo'),
      quadraticCurveTo: () => calls.push('quadraticCurveTo'), closePath: () => calls.push('closePath'), clip: () => calls.push('clip'),
      save: () => calls.push('save'), restore: () => calls.push('restore'), drawImage: () => calls.push('drawImage'), ellipse: () => calls.push('ellipse'),
    } as unknown as CanvasRenderingContext2D;
    const output = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
    vi.stubGlobal('document', { createElement: () => output });
    cropCanvasByImageSelection({ width: 20, height: 20 } as HTMLCanvasElement, {
      type: 'freehand',
      points: [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 4 }, { x: 1, y: 5 }],
      bounds: { x: 1, y: 1, width: 4, height: 4 },
    });
    expect(calls).toContain('quadraticCurveTo');
    vi.unstubAllGlobals();
  });
});

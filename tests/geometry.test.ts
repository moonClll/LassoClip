import { applyAlphaMask, createSelection, normalizeRect, pointInSelection, rasterizeMask, rectFromPoints } from '../src/modules/selection/geometry';
import { resizeSelection, translateSelection } from '../src/modules/selection/transforms';

describe('selection geometry and alpha', () => {
  it('normalizes a drag in any direction', () => {
    expect(normalizeRect({ x: 90, y: 70 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 80, height: 50 });
  });

  it('creates geometric selections with explicit bounds', () => {
    expect(createSelection('rectangle', { x: 20, y: 30 }, { x: 5, y: 10 })).toEqual({ type: 'rectangle', bounds: { x: 5, y: 10, width: 15, height: 20 } });
    expect(createSelection('ellipse', { x: 2, y: 3 }, { x: 12, y: 13 })).toEqual({ type: 'ellipse', bounds: { x: 2, y: 3, width: 10, height: 10 } });
  });

  it('moves and resizes a selection without losing its path', () => {
    const selection = { type: 'polygon' as const, points: [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 3, y: 5 }], bounds: { x: 1, y: 1, width: 4, height: 4 } };
    const moved = translateSelection(selection, 2, -1);
    expect(moved.bounds).toEqual({ x: 3, y: 0, width: 4, height: 4 });
    expect(moved.points?.[0]).toEqual({ x: 3, y: 0 });
    const resized = resizeSelection(moved, 8, 6);
    expect(resized.bounds).toEqual({ x: 3, y: 0, width: 8, height: 6 });
    expect(resized.points?.[1]).toEqual({ x: 11, y: 0 });
  });

  it('computes polygon bounds and membership', () => {
    const selection = { type: 'polygon' as const, points: [{ x: 1, y: 1 }, { x: 9, y: 1 }, { x: 5, y: 9 }], bounds: rectFromPoints([{ x: 1, y: 1 }, { x: 9, y: 1 }, { x: 5, y: 9 }]) };
    expect(selection.bounds).toEqual({ x: 1, y: 1, width: 8, height: 8 });
    expect(pointInSelection({ x: 5, y: 4 }, selection)).toBe(true);
    expect(pointInSelection({ x: 1, y: 9 }, selection)).toBe(false);
  });

  it('creates antialiased coverage for an ellipse', () => {
    const selection = { type: 'ellipse' as const, bounds: { x: 1, y: 1, width: 6, height: 6 } };
    const mask = rasterizeMask(8, 8, selection, 4);
    expect(mask[3 * 8 + 3]).toBe(255);
    expect(mask[1]).toBeLessThan(255);
    expect(mask[0]).toBe(0);
  });

  it('keeps pixels outside an irregular path transparent', () => {
    const selection = { type: 'polygon' as const, points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }], bounds: { x: 0, y: 0, width: 2, height: 2 } };
    const mask = rasterizeMask(2, 2, selection, 8);
    const rgba = new Uint8ClampedArray(16).fill(255);
    const output = applyAlphaMask(rgba, mask);
    expect(output[3]).toBeGreaterThan(0);
    expect(output[15]).toBe(0);
  });

  it('rejects an alpha mask with mismatched RGBA dimensions', () => {
    expect(() => applyAlphaMask(new Uint8ClampedArray(4), new Uint8ClampedArray(2))).toThrow('dimensions do not match');
  });
});

import { createBlurStroke, updateBlurStroke } from '../src/modules/canvas-editor/blurBrush';
import type { Redaction } from '../src/types/editor';
import { createDefaultProject } from '../src/types/editor';
import { normalizeProject } from '../src/modules/storage/clipStore';

const curve = [{ x: 30, y: 40 }, { x: 130, y: 40 }, { x: 130, y: 160 }];
const stroke = (): Redaction => ({ ...createBlurStroke(curve, { mode: 'blur', width: 60, strength: 20 }), id: 'stroke', zIndex: 0 });

function worldPoints(r: Redaction) {
  const angle = r.transform.rotation * Math.PI / 180;
  return r.points!.map((p) => {
    const x = (p.x - r.bounds.width / 2) * r.transform.width / r.bounds.width;
    const y = (p.y - r.bounds.height / 2) * r.transform.height / r.bounds.height;
    return { x: r.transform.x + r.transform.width / 2 + x * Math.cos(angle) - y * Math.sin(angle), y: r.transform.y + r.transform.height / 2 + x * Math.sin(angle) + y * Math.cos(angle) };
  });
}

describe('freehand blur geometry', () => {
  it('preserves the complete curve and includes round brush caps in the editable box', () => {
    const r = stroke();
    expect(worldPoints(r)).toEqual(curve);
    expect(r.bounds).toEqual({ x: 0, y: 10, width: 160, height: 180 });
    expect(r.points).toHaveLength(3);
    expect(r.points).not.toBe(curve);
  });

  it('supports single-point dabs and the full brush size range', () => {
    const r = createBlurStroke([{ x: 10, y: 20 }], { mode: 'pixelate', width: 1000, strength: 100 });
    expect(r.bounds).toEqual({ x: -490, y: -480, width: 1000, height: 1000 });
    expect(r.points).toEqual([{ x: 500, y: 500 }]);
    expect(r.style).toMatchObject({ brushWidth: 1000, strength: 100, pixelSize: 200 });
  });

  it('keeps brush width and effect strength independent', () => {
    const r = stroke();
    const strong = { ...r, ...updateBlurStroke(r, { mode: 'pixelate', width: 60, strength: 90 }) };
    expect(strong.points).toEqual(r.points);
    expect(strong.transform).toEqual(r.transform);
    expect(strong.style).toMatchObject({ brushWidth: 60, strength: 90, pixelSize: 180 });
  });

  it.each([0, 35, 90])('keeps a resized and rotated curve stationary when widening or narrowing it (%s degrees)', (rotation) => {
    const r = stroke();
    r.transform = { ...r.transform, width: r.transform.width * 1.5, height: r.transform.height * 2, x: 200, y: 100, rotation };
    const initial = worldPoints(r);
    const wide = { ...r, ...updateBlurStroke(r, { mode: 'blur', width: 500, strength: 20 }) };
    const narrow = { ...wide, ...updateBlurStroke(wide, { mode: 'blur', width: 1, strength: 20 }) };
    for (const result of [worldPoints(wide), worldPoints(narrow)]) result.forEach((p, i) => { expect(p.x).toBeCloseTo(initial[i].x); expect(p.y).toBeCloseTo(initial[i].y); });
    expect(narrow.bounds.width).toBeGreaterThan(0);
    expect(narrow.bounds.height).toBeGreaterThan(0);
  });

  it('retains editable stroke data when serializing and reopening a project', () => {
    const project = createDefaultProject();
    project.redactions = [stroke()];
    const reopened = normalizeProject(JSON.parse(JSON.stringify(project)));
    expect(reopened.redactions).toEqual(project.redactions);
    expect(worldPoints(reopened.redactions[0])).toEqual(curve);
  });
});

import { normalizeProject } from '../src/modules/storage/clipStore';
import { annotationSelectionId, createDefaultProject, redactionSelectionId, type Annotation, type Redaction } from '../src/types/editor';

describe('Phase 2.4 annotation model', () => {
  it('creates independent annotation and redaction records without touching clips', () => {
    const project = createDefaultProject('annotation test');
    const annotation: Annotation = { id: 'a1', name: '箭头', type: 'arrow', transform: { x: 10, y: 20, width: 100, height: 40, rotation: 0, opacity: 1 }, points: [{ x: 0, y: 0 }, { x: 100, y: 40 }], zIndex: 0, visible: true, locked: false, style: { stroke: '#7c3aed', strokeWidth: 3 } };
    const redaction: Redaction = { id: 'r1', name: '敏感信息', type: 'pixelate', transform: { x: 30, y: 40, width: 80, height: 30, rotation: 0, opacity: 1 }, bounds: { x: 30, y: 40, width: 80, height: 30 }, zIndex: 1, visible: true, locked: false, style: { color: '#111827', opacity: 1, pixelSize: 8 } };
    const next = { ...project, annotations: [annotation], redactions: [redaction] };
    expect(next.items).toEqual([]);
    expect(annotationSelectionId('a1')).toBe('annotation:a1');
    expect(redactionSelectionId('r1')).toBe('redaction:r1');
    expect(next.annotations[0].points).toHaveLength(2);
    expect(next.redactions[0].type).toBe('pixelate');
  });

  it('upgrades v2 projects that predate the redactions field', () => {
    const project = createDefaultProject();
    const legacy = { ...project, schemaVersion: 1 } as unknown as Parameters<typeof normalizeProject>[0];
    delete (legacy as unknown as { redactions?: unknown }).redactions;
    const normalized = normalizeProject(legacy);
    expect(normalized.schemaVersion).toBe(2);
    expect(normalized.annotations).toEqual([]);
    expect(normalized.redactions).toEqual([]);
  });
});

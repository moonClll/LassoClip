import { createDrawingAnnotation, createTextAnnotation } from '../src/modules/canvas-editor/drawing';
import { colorInputValue, defaultToolStyle, replaceStrokeColor } from '../src/modules/canvas-editor/toolStyle';

describe('annotation tool styles', () => {
  const gesture = { start: { x: 100, y: 80 }, points: [{ x: 100, y: 80 }, { x: 70, y: 50 }, { x: 20, y: 30 }] };

  it('applies all text options and leaves enough room for large text', () => {
    const style = { fill: '#125678', fontSize: 96, fontFamily: 'SimSun, serif', fontStyle: 'bold' };
    const text = createTextAnnotation('文字测试', { x: 50, y: 60 }, style);
    expect(text.style).toEqual(style);
    expect(text.transform.height).toBeGreaterThanOrEqual(120);
    expect(text.transform.width).toBeGreaterThanOrEqual(384);
  });

  it.each(['drawing', 'highlight', 'rectangle', 'ellipse', 'arrow', 'line'] as const)('applies color and width to %s', (tool) => {
    const style = { ...defaultToolStyle(tool), stroke: '#126789', strokeWidth: 7 };
    const annotation = createDrawingAnnotation(tool, gesture, style)!;
    expect(annotation.style).toEqual(style);
    expect(annotation.style).not.toBe(style);
    expect(annotation.transform).toMatchObject({ x: 20, y: 30, width: 80, height: 50 });
    if (annotation.type !== 'text') {
      expect(annotation.points[0]).toEqual({ x: 80, y: 50 });
      expect(annotation.points.at(-1)).toEqual({ x: 0, y: 0 });
      if (tool === 'line' || tool === 'arrow') expect(annotation.points).toHaveLength(2);
    }
  });

  it('keeps a highlight translucent after changing an older RGBA color', () => {
    expect(colorInputValue('rgba(250,204,21,.48)')).toBe('#facc15');
    expect(replaceStrokeColor({ stroke: 'rgba(250,204,21,.48)', strokeWidth: 6 }, '#ff0000')).toMatchObject({ stroke: '#ff0000', opacity: .48, strokeWidth: 6 });
    expect(defaultToolStyle('highlight')).toMatchObject({ opacity: .45 });
  });

  it('does not create shapes from a click or a redaction gesture', () => {
    expect(createDrawingAnnotation('drawing', { start: { x: 0, y: 0 }, points: [{ x: 0, y: 0 }] }, {})).toBeUndefined();
    expect(createDrawingAnnotation('redact-blur', gesture, {})).toBeUndefined();
  });
});

import { readFileSync } from 'node:fs';

describe('Clip Studio fixed viewport layout contract', () => {
  it('keeps page scrolling disabled while allowing panel-local scrolling', () => {
    const css = readFileSync('src/styles/editor.css', 'utf8');
    expect(css).toContain('.editor-app { height: 100vh;');
    expect(css).toContain('overflow: hidden; background: radial-gradient');
    expect(css).toContain('.editor-grid { flex: 1 1 auto;');
    expect(css).toContain('min-height: 0; overflow: hidden;');
    expect(css).toContain('.asset-panel { flex: 1 1 58%; overflow: auto;');
    expect(css).toContain('.inspector-panel { min-height: 0; overflow: auto;');
  });
});

import { readFileSync } from 'node:fs';

describe('Clip Studio fixed viewport layout contract', () => {
  it('keeps page scrolling disabled while allowing panel-local scrolling', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/styles/editor.css', 'utf8').replace(/@import[^;]+;/g, '');
    document.head.append(style);
    try {
      const declarations = (selector: string): CSSStyleDeclaration => {
        const rule = Array.from(style.sheet!.cssRules).find((entry) => 'selectorText' in entry && entry.selectorText === selector) as CSSStyleRule | undefined;
        expect(rule, `Missing layout rule: ${selector}`).toBeDefined();
        return rule!.style;
      };
      expect(declarations('body').overflow).toBe('hidden');
      expect(declarations('.editor-app').height).toBe('100vh');
      expect(declarations('.editor-app').overflow).toBe('hidden');
      expect(declarations('.editor-grid').flex).toBe('1 1 auto');
      expect(declarations('.editor-grid').getPropertyValue('min-height')).toBe('0');
      expect(declarations('.editor-grid').overflow).toBe('hidden');
      for (const selector of ['.asset-panel', '.layer-panel', '.inspector-panel']) {
        expect(declarations(selector).overflow).toBe('auto');
      }
    } finally {
      style.remove();
    }
  });
});

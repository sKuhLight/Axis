import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Source pins for the settings dialog tab bar (AxisPanel.svelte is a runes component, not importable in this
// node-only suite). Regression: the bar was a single `overflow-x: auto; scrollbar-width: none` row, so with up to
// 7 tabs in a 440px card the trailing ones ("About" half hidden under the close button, "Debug" off-screen)
// were unreachable with a mouse. The bar must WRAP (never scroll sideways), reserve the close button's space, and
// still offer one button per `editor.axisTab` value.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const panel = read('./AxisPanel.svelte');
const editorSrc = read('./editor.svelte.ts');

/** The declaration block of the first top-level rule whose selector is exactly `selector` in the component's
 *  <style>. Throws when the rule is missing so a refactor fails loudly instead of matching nothing. */
function rule(selector: string): string {
  const style = panel.slice(panel.indexOf('<style>'));
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`).exec(style);
  if (!m) throw new Error(`axisPanelTabs pin: rule "${selector}" not found in AxisPanel.svelte <style>`);
  return m[1];
}

/** px value of a CSS property in a declaration block (first number of a shorthand at `index`). */
function px(block: string, prop: string, index = 0): number {
  const m = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`).exec(block);
  if (!m) throw new Error(`axisPanelTabs pin: "${prop}" not declared`);
  const parts = m[1].trim().split(/\s+/);
  return parseFloat(parts[Math.min(index, parts.length - 1)]);
}

describe('settings dialog tab bar (source pins)', () => {
  const tabbar = rule('.tabbar');

  it('wraps instead of scrolling sideways behind a hidden scrollbar', () => {
    expect(tabbar).toMatch(/display:\s*flex/);
    expect(tabbar).toMatch(/flex-wrap:\s*wrap/);
    // No hidden overflow: neither the bar nor a scrollbar-hiding rule may come back.
    expect(tabbar).not.toMatch(/overflow(-x)?\s*:\s*(auto|scroll|hidden)/);
    expect(tabbar).not.toMatch(/scrollbar-width/);
    expect(panel).not.toMatch(/\.tabbar::-webkit-scrollbar/);
  });

  it('tabs may grow but never shrink below their label, so a label is never clipped', () => {
    const tb = rule('.tb');
    expect(tb).toMatch(/flex:\s*1\s+0\s+auto/);
    expect(tb).not.toMatch(/overflow/);
    expect(tb).not.toMatch(/(?:max-)?width\s*:/);
  });

  it('reserves room for the absolutely positioned close button on every row', () => {
    const x = rule('.x');
    expect(x).toMatch(/position:\s*absolute/);
    // The button's footprint from the card's right edge = right offset + its width.
    const footprint = px(x, 'right') + px(x, 'width');
    // padding shorthand: top right bottom left -> right is the 2nd value.
    const reserved = px(tabbar, 'padding', 1);
    expect(reserved).toBeGreaterThan(footprint);
  });

  it('keeps an accent underline for the active tab and a baseline on the others (readable when wrapped)', () => {
    expect(rule('.tb')).toMatch(/border-bottom:\s*2px solid var\(--border\)/);
    expect(rule('.tb.on')).toMatch(/border-bottom-color:\s*var\(--accent\)/);
    // Rows must be visibly separated once the bar wraps.
    expect(px(tabbar, 'gap', 0)).toBeGreaterThan(0);
  });

  it('renders one button per editor.axisTab value, in a stable order, with the close button first in focus order', () => {
    const union = /axisTab = \$state<([^>]+)>\(/.exec(editorSrc);
    expect(union, 'axisTab union found in editor.svelte.ts').not.toBeNull();
    const tabs = [...union![1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(tabs.length).toBe(7);

    const bar = panel.slice(panel.indexOf('<div class="tabbar">'), panel.indexOf('</div>', panel.indexOf('<div class="tabbar">')));
    // One button per line; `[^\n]` (not `[^>]`) because the handlers contain `=>`.
    const rendered = [...bar.matchAll(/<button class="tb"[^\n]*?(?:axisTab = '(\w+)'|openAxis\('(\w+)'\))/g)].map((m) => m[1] ?? m[2]);
    expect([...rendered].sort()).toEqual([...tabs].sort());
    // Conditional tabs keep their relative position; the order the user sees is the documented one.
    expect(rendered).toEqual(['account', 'storage', 'device', 'performance', 'privacy', 'about', 'debug']);

    // Focus order unchanged: the close button precedes the tab bar in the DOM (it is only positioned, not reordered).
    expect(panel.indexOf('class="x"')).toBeGreaterThan(-1);
    expect(panel.indexOf('class="x"')).toBeLessThan(panel.indexOf('<div class="tabbar">'));
    expect(rule('.x')).not.toMatch(/\border\s*:/);
  });
});

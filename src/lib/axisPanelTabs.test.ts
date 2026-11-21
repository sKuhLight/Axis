import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Source pins for the settings dialog tab bar (AxisPanel.svelte is a runes component, not importable in this
// node-only suite; the overflow / zoom / placement arithmetic is covered behaviourally by tabOverflow.test.ts).
// Regression: the bar was a single `overflow-x: auto; scrollbar-width: none` row, so with up to 7 tabs in a 440px card
// the trailing ones ("About" half hidden under the close button, "Debug" off-screen) were unreachable with a mouse.
// The bar now stays on ONE row and the tabs that don't fit collapse into a "⋯" menu. These pins are deliberately
// limited to invariants (no hidden scroll, every tab reachable, close button clear, twin inert, menu unclipped) rather
// than exact source text, so a refactor that keeps the behaviour keeps the suite green.
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

/** px value of a CSS property in a declaration block (the `index`-th number of a shorthand). */
function px(block: string, prop: string, index = 0): number {
  const m = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`).exec(block);
  if (!m) throw new Error(`axisPanelTabs pin: "${prop}" not declared`);
  const parts = m[1].trim().split(/\s+/);
  return parseFloat(parts[Math.min(index, parts.length - 1)]);
}

/** Source of one top-level function (`function name(` … its closing brace at column 2). */
function fn(name: string): string {
  const start = panel.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`axisPanelTabs pin: function ${name} not found`);
  const end = panel.indexOf('\n  }\n', start);
  return panel.slice(start, end < 0 ? undefined : end + 4);
}

describe('settings dialog tab bar (source pins)', () => {
  const tabbar = rule('.tabbar');

  it('has no hidden horizontal scroll: one flex row, no scrolling overflow, no hidden scrollbar, no wrapping', () => {
    expect(tabbar).toMatch(/display:\s*flex/);
    expect(tabbar).not.toMatch(/overflow(-x)?\s*:\s*(auto|scroll|hidden)/);
    expect(tabbar).not.toMatch(/scrollbar-width/);
    expect(tabbar).not.toMatch(/flex-wrap/);
    expect(panel).not.toMatch(/\.tabbar::-webkit-scrollbar/);
    // a visible tab keeps its label whole
    expect(rule('.tb')).toMatch(/white-space:\s*nowrap/);
  });

  it('keeps the close button clear of the bar: reserved right padding exceeds the button footprint', () => {
    const x = rule('.x');
    expect(x).toMatch(/position:\s*absolute/);
    const footprint = px(x, 'right') + px(x, 'width'); // distance of the button's left edge from the card's right edge
    const reserved = px(tabbar, 'padding', 1); // padding shorthand: top right bottom left -> right is the 2nd value
    expect(reserved).toBeGreaterThan(footprint);
    // close button precedes the tab bar in the DOM and is only positioned, never reordered (focus order unchanged)
    expect(panel.indexOf('class="x"')).toBeGreaterThan(-1);
    expect(panel.indexOf('class="x"')).toBeLessThan(panel.indexOf('<div class="tabbar"'));
    expect(x).not.toMatch(/\border\s*:/);
  });

  it('offers one entry per editor.axisTab value, in the documented order', () => {
    const union = /axisTab = \$state<([^>]+)>\(/.exec(editorSrc);
    expect(union, 'axisTab union found in editor.svelte.ts').not.toBeNull();
    const values = [...union![1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(values.length).toBe(7);

    const start = panel.indexOf('const tabs = $derived<');
    expect(start).toBeGreaterThan(-1);
    const ids = [...panel.slice(start, panel.indexOf(']);', start)).matchAll(/id: '(\w+)'/g)].map((m) => m[1]);
    expect([...ids].sort()).toEqual([...values].sort());
    expect(ids).toEqual(['account', 'storage', 'device', 'performance', 'privacy', 'about', 'debug']);

    // switching keeps the old behaviour: Connection loads the ports through openAxis, the rest set the tab
    const select = /const selectTab = [^\n]+/.exec(panel);
    expect(select, 'selectTab').not.toBeNull();
    expect(select![0]).toContain("openAxis('device')");
    expect(select![0]).toContain('editor.axisTab = id');
  });

  it('measures in layout px: every getBoundingClientRect() width in measureBar goes through toLayoutPx (UI-scale zoom)', () => {
    const body = fn('measureBar');
    const rects = body.match(/getBoundingClientRect\(\)/g) ?? [];
    expect(rects.length).toBeGreaterThan(0);
    expect((body.match(/toLayoutPx\(/g) ?? []).length).toBe(rects.length);
    // the zoom is calibrated from the card (visual vs layout width), not assumed
    expect(panel).toMatch(/effectiveZoom\(cardEl\.getBoundingClientRect\(\)\.width, cardEl\.offsetWidth\)/);
    // the scrollbar gutter is always reserved, so short and tall tabs give the bar the same width
    expect(rule('.card')).toMatch(/scrollbar-gutter:\s*stable/);
  });

  it('the measuring twin is hidden, inert, out of flow and adds no scroll overflow', () => {
    expect(panel).toMatch(/class="tbclip"[^>]*aria-hidden="true"[^>]*inert|class="tbclip"[^>]*inert[^>]*aria-hidden="true"/);
    const clip = rule('.tbclip');
    expect(clip).toMatch(/position:\s*absolute/);
    expect(clip).toMatch(/height:\s*0/);
    expect(clip).toMatch(/overflow:\s*hidden/);
    expect(clip).toMatch(/visibility:\s*hidden/);
    expect(clip).toMatch(/pointer-events:\s*none/);
    // its buttons can never take focus, and it sits after the real bar
    expect(panel).toMatch(/class="tb tbm"[^>]*tabindex="-1"/);
    expect(panel.indexOf('<div class="tabbar"')).toBeLessThan(panel.indexOf('class="tbclip"'));
    // natural (not grown) widths are what is measured
    expect(rule('.tbm')).toMatch(/flex:\s*0\s+0\s+auto/);
    expect(panel).toMatch(/new ResizeObserver\(/);
  });

  it('the ⋯ button and menu are accessible, and the active tab is announced consistently', () => {
    expect(panel).toContain('aria-haspopup="menu"');
    expect(panel).toMatch(/aria-expanded=\{menuOpen\}/);
    expect(panel).toContain('role="menu"');
    expect(panel).toContain('role="menuitem"');
    // the ⋯ announces a hidden active tab, and bar tabs + menu items both carry aria-current
    expect(panel).toMatch(/aria-label=\{[^\n]*selected/);
    expect((panel.match(/aria-current=/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // keyboard: arrows move through the items, Escape closes, focus returns to the ⋯ button
    expect(fn('onMenuKey')).toContain('ArrowDown');
    expect(fn('onWinKey')).toContain("'Escape'");
    expect(fn('closeMenu')).toMatch(/moreBtn\?\.focus\(\)/);
  });

  it('the menu cannot be clipped by the card and sits above the dialog content and the close button', () => {
    const menu = rule('.menu');
    // `position: absolute` inside the card's `overflow-y: auto` was cut off (and scrolled) on short tabs
    expect(menu).toMatch(/position:\s*fixed/);
    expect(menu).not.toMatch(/position:\s*absolute/);
    expect(px(menu, 'z-index')).toBeGreaterThan(px(rule('.x'), 'z-index'));
    // placed from the ⋯ button's rect through the shared zoom-aware helper
    expect(fn('placeMenu')).toMatch(/resolveMenuPlacement\(/);
    expect(fn('placeMenu')).toMatch(/zoomOf\(\)/);
    // flips above the button when there is no room below (bottom sheet), and re-places once the sheet's slide-in ends
    expect(fn('placeMenu')).toMatch(/menuAnchorPlacement\(/);
    expect(panel).toMatch(/onanimationend=\{/);
  });

  it('window listeners are attached only while the menu is open, and a split change cannot strand focus', () => {
    // no component-lifetime window handlers for the menu
    expect(panel).not.toMatch(/<svelte:window/);
    expect(panel).toContain("window.addEventListener('keydown'");
    expect(panel).toContain("window.removeEventListener('keydown'");
    expect(panel).toContain("window.addEventListener('pointerdown'");
    expect(panel).toContain("window.removeEventListener('pointerdown'");
    // a vanished focused item falls back to the first item / the ⋯ button instead of <body>
    expect(panel).toMatch(/document\.activeElement === document\.body/);
  });
});

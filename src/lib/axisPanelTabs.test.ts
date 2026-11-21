import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Source pins for the settings dialog tab bar (AxisPanel.svelte is a runes component, not importable in this
// node-only suite; the overflow arithmetic itself is covered by tabOverflow.test.ts). Regression: the bar was a
// single `overflow-x: auto; scrollbar-width: none` row, so with up to 7 tabs in a 440px card the trailing ones
// ("About" half hidden under the close button, "Debug" off-screen) were unreachable with a mouse. The bar now stays
// on ONE row and the tabs that don't fit collapse into a "⋯" menu — never a hidden horizontal scroll.
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

  it('stays on one row: no wrapping and no hidden horizontal scroll', () => {
    expect(tabbar).toMatch(/display:\s*flex/);
    expect(tabbar).not.toMatch(/flex-wrap/);
    expect(tabbar).not.toMatch(/overflow(-x)?\s*:\s*(auto|scroll|hidden)/);
    expect(tabbar).not.toMatch(/scrollbar-width/);
    expect(panel).not.toMatch(/\.tabbar::-webkit-scrollbar/);
    // a tab never shrinks below its label, so a visible label is never clipped
    const tb = rule('.tb');
    expect(tb).toMatch(/flex:\s*1\s+0\s+auto/);
    expect(tb).toMatch(/white-space:\s*nowrap/);
  });

  it('reserves room for the absolutely positioned close button, so neither a tab nor the ⋯ can sit under it', () => {
    const x = rule('.x');
    expect(x).toMatch(/position:\s*absolute/);
    const footprint = px(x, 'right') + px(x, 'width'); // distance of the button's left edge from the card's right edge
    const reserved = px(tabbar, 'padding', 1); // padding shorthand: top right bottom left -> right is the 2nd value
    expect(reserved).toBeGreaterThan(footprint);
    // the bar's content box (padding excluded) is what gets measured, so the reserved padding is part of the split
    expect(fn('measureBar')).toMatch(/paddingRight/);
  });

  it('shows the ⋯ button only when something overflows, as an accessible menu button', () => {
    expect(panel).toMatch(/\{#if overflow\.hasMore\}[\s\S]*?class="tb more-btn"/);
    const btn = /<button class="tb more-btn" class:on=\{parts\.activeHidden\}[\s\S]*?<\/button>/.exec(panel);
    expect(btn, '⋯ button markup').not.toBeNull();
    expect(btn![0]).toContain('aria-haspopup="menu"');
    expect(btn![0]).toContain('aria-expanded={menuOpen}');
    expect(btn![0]).toMatch(/aria-label="[^"]+"/);
    expect(btn![0]).toContain('onclick={toggleMenu}');
    expect(btn![0]).toContain('onkeydown={onMoreKey}');
    expect(btn![0]).toContain('&#x22EF;'); // ⋯ glyph (Icon.svelte has no dots/more icon)
    // the ⋯ button takes the active look (accent + underline) from the same .tb.on rule as a real tab
    expect(rule('.tb.on')).toMatch(/color:\s*var\(--accent\)/);
    expect(rule('.tb.on')).toMatch(/border-bottom-color:\s*var\(--accent\)/);
  });

  it('the menu: role=menu with role=menuitem buttons, marks the active entry, sits above the dialog content', () => {
    const start = panel.indexOf('<div class="menu" role="menu"');
    expect(start, 'menu markup').toBeGreaterThan(-1);
    const menu = panel.slice(start, panel.indexOf('{/each}', start));
    expect(menu).toContain('onkeydown={onMenuKey}');
    expect(menu).toMatch(/<button class="mi"[^\n]*role="menuitem"/);
    expect(menu).toMatch(/aria-current=\{editor\.axisTab === t\.id \? 'true' : undefined\}/);
    expect(menu).toMatch(/class:on=\{editor\.axisTab === t\.id\}/);
    expect(menu).toContain('onclick={() => pickFromMenu(t.id)}');

    const css = rule('.menu');
    expect(css).toMatch(/position:\s*absolute/);
    expect(css).toMatch(/right:\s*0\b/); // aligned to the ⋯ button's right edge
    expect(css).toMatch(/top:\s*calc\(100%/); // opens below the button
    expect(px(css, 'z-index')).toBeGreaterThan(px(rule('.x'), 'z-index'));
    expect(css).toMatch(/var\(--surface2\)/);
    expect(css).toMatch(/var\(--border2\)/);
    expect(rule('.mi.on')).toMatch(/var\(--accent\)/);
  });

  it('menu behaviour: closes on selection, Escape and outside press; arrow keys move; focus returns to ⋯', () => {
    expect(fn('pickFromMenu')).toMatch(/selectTab\(id\);\s*closeMenu\(true\)/);
    // Escape: capture-phase on window + stopPropagation, so the page-level Escape handler does not also act
    expect(panel).toMatch(/<svelte:window[^>]*onkeydowncapture=\{onWinKey\}/);
    const esc = fn('onWinKey');
    expect(esc).toContain("'Escape'");
    expect(esc).toContain('e.stopPropagation()');
    expect(esc).toContain('closeMenu(true)');
    // outside press closes without stealing focus from what was clicked
    expect(panel).toMatch(/<svelte:window[^>]*onpointerdowncapture=\{onWinPointer\}/);
    expect(fn('onWinPointer')).toMatch(/!moreWrap\.contains\(/);
    expect(fn('onWinPointer')).toContain('closeMenu(false)');
    // focus goes back to the ⋯ button on keyboard/selection closes
    expect(fn('closeMenu')).toMatch(/if \(refocus\) moreBtn\?\.focus\(\)/);
    // ArrowUp/Down navigate the items (wrapping via the pure helper); the ⋯ button opens the menu with them too
    const keys = fn('onMenuKey');
    expect(keys).toContain('ArrowDown');
    expect(keys).toContain('nextMenuIndex(');
    expect(fn('onMoreKey')).toMatch(/ArrowDown[\s\S]*openMenu\('first'\)[\s\S]*ArrowUp[\s\S]*openMenu\('last'\)/);
    // the menu cannot outlive the dialog or the overflow
    expect(panel).toContain('$effect(() => { if (!editor.axisOpen || !overflow.hasMore) menuOpen = false; });');
  });

  it('measures with a ResizeObserver on the bar and a hidden, inert, zero-height twin row (re-measured on tab / viewport change)', () => {
    expect(panel).toMatch(/new ResizeObserver\(/);
    expect(panel).toMatch(/ro\.observe\(barEl\)/);
    expect(panel).toMatch(/ro\.observe\(measureEl\)/);
    expect(panel).toMatch(/\$effect\(\(\) => \{ void tabs\.length; void mob; /); // Storage/Performance appear + desktop <-> .mob
    expect(panel).toContain('<div class="tbclip" aria-hidden="true" inert>');
    expect(panel).toMatch(/\{#each tabs as t \(t\.id\)\}<button class="tb tbm" tabindex="-1" data-m=\{t\.id\}>/);
    expect(panel).toMatch(/computeTabOverflow\(tabs\.map\(/);
    const clip = rule('.tbclip');
    expect(clip).toMatch(/position:\s*absolute/);
    expect(clip).toMatch(/height:\s*0/);
    expect(clip).toMatch(/overflow:\s*hidden/); // out of flow + clipped: adds no scrollable overflow to the card
    expect(clip).toMatch(/visibility:\s*hidden/);
    expect(clip).toMatch(/pointer-events:\s*none/);
    expect(rule('.tbm')).toMatch(/flex:\s*0\s+0\s+auto/); // natural width, not the grown width
  });

  it('offers one entry per editor.axisTab value, in the documented order, keeping Connection on openAxis', () => {
    const union = /axisTab = \$state<([^>]+)>\(/.exec(editorSrc);
    expect(union, 'axisTab union found in editor.svelte.ts').not.toBeNull();
    const values = [...union![1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(values.length).toBe(7);

    const start = panel.indexOf('const tabs = $derived<');
    expect(start).toBeGreaterThan(-1);
    const block = panel.slice(start, panel.indexOf(']);', start));
    const ids = [...block.matchAll(/id: '(\w+)'/g)].map((m) => m[1]);
    expect([...ids].sort()).toEqual([...values].sort());
    expect(ids).toEqual(['account', 'storage', 'device', 'performance', 'privacy', 'about', 'debug']);
    // conditional tabs stay conditional
    expect(block).toMatch(/loc\.available \? \[\{ id: 'storage'/);
    expect(block).toMatch(/editor\.hasTelemetryControl \? \[\{ id: 'performance'/);

    // the bar buttons and the menu entries switch tabs through the SAME function the old inline buttons mirrored
    const sel = /const selectTab = [^\n]+/.exec(panel);
    expect(sel, 'selectTab').not.toBeNull();
    expect(sel![0]).toContain("if (id === 'device') editor.openAxis('device'); else editor.axisTab = id;");
    expect(panel).toContain('onclick={() => selectTab(t.id)}>{t.label}</button>');
  });

  it('keeps the close button first in the focus order (it is only positioned, never reordered)', () => {
    const x = panel.indexOf('class="x"');
    expect(x).toBeGreaterThan(-1);
    expect(x).toBeLessThan(panel.indexOf('<div class="tabbar"'));
    expect(rule('.x')).not.toMatch(/\border\s*:/);
    // the hidden measuring row comes after the real bar and is inert, so it never joins the focus order
    expect(panel.indexOf('<div class="tabbar"')).toBeLessThan(panel.indexOf('<div class="tbclip"'));
  });
});

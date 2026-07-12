import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * T16 guard: the generic workbench renderer must not hardcode hex color
 * literals. All colors flow through the `--aw-*` design tokens (mapped from the
 * host theme). This keeps the renderer app-agnostic and re-themeable.
 *
 * The scan targets CSS color positions only: it reads the `<style>` blocks of
 * every `.svelte` component under `workbench/svelte/` and flags any `#rgb` /
 * `#rgba` / `#rrggbb` / `#rrggbbaa` literal. Restricting to `<style>` content
 * intentionally excludes markup — SVG `d="…"` path data (no `#`) and `id=` /
 * `href="#…"` anchors — so we never false-positive on geometry or anchors, and
 * we never fall back to a per-file/per-line allowlist.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SVELTE_DIR = join(HERE, '..');

// CSS hex color: `#` + exactly 3, 4, 6, or 8 hex digits, then a CSS delimiter
// (end of token). This shape does not match longer identifier-like `#anchor`
// strings, and combined with the <style>-only scope it isolates real colors.
const HEX_COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
const STYLE_BLOCK = /<style[^>]*>([\s\S]*?)<\/style>/gi;

// The guard now enforces the WHOLE generic renderer with NO tolerance:
// WorkbenchHost consumes theme.ts `workbenchTokenDefaultsCss()` (no inline hex
// defaults) and TabStack's tab chrome is fully tokenized. Any new hex literal in
// a `workbench/svelte/*.svelte` <style> block fails the suite.

function styleCssOf(source: string): string {
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  STYLE_BLOCK.lastIndex = 0;
  while ((match = STYLE_BLOCK.exec(source))) blocks.push(match[1]);
  return blocks.join('\n');
}

describe('T16 · generic renderer uses --aw-* tokens, not hex colors', () => {
  const files = readdirSync(SVELTE_DIR).filter((name) => name.endsWith('.svelte'));

  it('finds workbench svelte components to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(file, () => {
      const css = styleCssOf(readFileSync(join(SVELTE_DIR, file), 'utf8'));
      const hits = css.match(HEX_COLOR) ?? [];
      expect(hits, `${file} has hardcoded hex color(s): ${hits.join(', ')} — use var(--aw-*) tokens`).toEqual([]);
    });
  }
});

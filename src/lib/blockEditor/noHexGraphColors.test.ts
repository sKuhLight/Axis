import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Guard for the graph tiles (AXIS-89): colours only through theme tokens, so the graphs follow the light /
// dark themes. Scans the graph component(s) in full — the <style> block AND the markup, SVG attributes
// included (fill= / stroke= / style:… / inline styles) — and the graph model modules, for hex colour
// literals. (Modelled on workbench/svelte/test/noHexColors.test.ts, which scans <style> blocks only.)

const HERE = dirname(fileURLToPath(import.meta.url));
const HEX_COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g;
/** Hex colours inside SVG attribute values / style declarations, e.g. fill="#fff", stroke='#35c9d6'. */
const SVG_COLOR_ATTR = /\b(?:fill|stroke|stop-color|color|background|border(?:-color)?)\s*[=:]\s*["']?#/gi;

const GRAPH_FILES = [join(HERE, 'BeGraph.svelte'), ...readdirSync(join(HERE, 'visuals')).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => join(HERE, 'visuals', f))];

/** Strip comments with a small scanner (prose may mention a colour, and the guard only cares about code).
 *  A scanner instead of chained replacements keeps every pass complete: no comment marker can survive it. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
    } else if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      i = end < 0 ? src.length : end + 3;
    } else if (src.startsWith('//', i) && (i === 0 || src[i - 1] !== ':')) {
      const end = src.indexOf('\n', i + 2);
      i = end < 0 ? src.length : end;
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

describe('graph tiles use theme tokens, not hex colours', () => {
  it('finds the graph files to scan', () => {
    expect(GRAPH_FILES.length).toBeGreaterThan(2);
  });
  for (const file of GRAPH_FILES) {
    it(file.slice(HERE.length + 1), () => {
      // comments may mention a colour in prose
      const code = stripComments(readFileSync(file, 'utf8'));
      expect(code.match(SVG_COLOR_ATTR) ?? []).toEqual([]);
      expect(code.match(HEX_COLOR) ?? []).toEqual([]);
    });
  }
});

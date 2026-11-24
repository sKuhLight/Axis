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

describe('graph tiles use theme tokens, not hex colours', () => {
  it('finds the graph files to scan', () => {
    expect(GRAPH_FILES.length).toBeGreaterThan(2);
  });
  for (const file of GRAPH_FILES) {
    it(file.slice(HERE.length + 1), () => {
      const src = readFileSync(file, 'utf8');
      // strip comments (`// …`, `/* … */`, `<!-- … -->`): prose may mention a colour
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(code.match(SVG_COLOR_ATTR) ?? []).toEqual([]);
      expect(code.match(HEX_COLOR) ?? []).toEqual([]);
    });
  }
});

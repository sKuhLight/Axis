import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Source pins: the monolith Preset Browser (a runes component, not importable in this node-only vitest)
// formats decoded preset params through catalogUnitSymbol() instead of printing the raw catalog code
// ("5 percent", "5 knob_0_10"), and shows an unranged raw value bare. Its wiring is pinned on the source;
// the docked browser (fmtVal) and the converter (buildParams) are covered by behaviour tests in their own
// suites, the symbol mapping in format.test.ts.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** The source text of `function <name>(` up to the next function declaration. Throws when either anchor is
 *  missing or the name is ambiguous, so a refactor fails this suite loudly instead of slicing garbage. */
function functionSource(src: string, name: string): string {
  const head = `function ${name}(`;
  const start = src.indexOf(head);
  if (start < 0) throw new Error(`catalogUnitDisplay pin: "${head}" not found`);
  if (src.indexOf(head, start + 1) >= 0) throw new Error(`catalogUnitDisplay pin: "${head}" is declared twice`);
  const rest = src.slice(start + head.length);
  const next = rest.search(/\n\s*(?:async\s+)?function\s+[\w$]+\s*\(/);
  if (next < 0) throw new Error(`catalogUnitDisplay pin: no function declaration follows "${head}"`);
  return head + rest.slice(0, next);
}

describe('catalog unit display wiring (source pins)', () => {
  it('the monolith Preset Browser formats params through catalogUnitSymbol + withUnit', () => {
    const src = read('./PresetBrowser.svelte');
    expect(src).toMatch(/import \{[^}]*\bcatalogUnitSymbol\b[^}]*\} from '\.\/format';/);
    expect(src).toMatch(/import \{[^}]*\bwithUnit\b[^}]*\} from '\.\/format';/);
    expect(src).toMatch(/import \{[^}]*\bisUnrangedParam\b[^}]*\} from '\.\/format';/);
    const fmtVal = functionSource(src, 'fmtVal');
    expect(fmtVal).toMatch(/withUnit\(\s*fmtNum\(p\.value\)\s*,/);
    expect(fmtVal).toContain('catalogUnitSymbol(p.unit)');
    // an unranged value (raw 0..65534) never gets a unit
    expect(fmtVal).toContain('isUnrangedParam(p)');
    // the raw-code concatenation is gone
    expect(fmtVal).not.toMatch(/' ' \+ p\.unit/);
    expect(fmtVal).not.toMatch(/p\.unit !== 'enum'/);
  });

  it('no other source file prints a decoded-param unit by concatenation', () => {
    // The deep-search / library / specs / autocomplete paths never render units; guard that none starts to
    // append a raw `p.unit` without the mapping.
    for (const f of [
      './library.svelte.ts',
      './axis-workbench/presetBrowser/presetBrowserWorkbenchSpecs.ts',
      './axis-workbench/presetBrowser/presetBrowserWorkbenchAutocomplete.ts',
      './convertConflicts.ts',
    ]) {
      expect(read(f), f).not.toMatch(/\+ ' ' \+ [a-z]+\.unit|\$\{[a-z]+\.unit\}/);
    }
  });
});

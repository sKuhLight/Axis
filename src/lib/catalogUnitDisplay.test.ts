import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Source pins: the call sites that render units from `/presets/:n/params` (decoded preset params) or from
// the converter go through catalogUnitSymbol() instead of printing the raw catalog code ("5 percent",
// "5 knob_0_10"). The runes components and the store cannot be unit-tested in this node-only vitest, so
// the wiring is pinned on the source; the mapping itself is covered in format.test.ts and the pure
// formatters (fmtVal, buildParams) in their own suites.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('catalog unit display wiring (source pins)', () => {
  it('the monolith Preset Browser formats params through catalogUnitSymbol + withUnit', () => {
    const src = read('./PresetBrowser.svelte');
    expect(src).toMatch(/import \{[^}]*\bcatalogUnitSymbol\b[^}]*\} from '\.\/format';/);
    expect(src).toMatch(/import \{[^}]*\bwithUnit\b[^}]*\} from '\.\/format';/);
    const fmtVal = src.slice(src.indexOf('function fmtVal('), src.indexOf('// which params are highlighted'));
    expect(fmtVal).toContain('withUnit(fmtNum(p.value), catalogUnitSymbol(p.unit))');
    // the raw-code concatenation is gone
    expect(fmtVal).not.toMatch(/' ' \+ p\.unit/);
    expect(fmtVal).not.toMatch(/p\.unit !== 'enum'/);
  });

  it('the docked Preset Browser (workbench) formats params through the same mapping', () => {
    const src = read('./axis-workbench/presetBrowser/presetBrowserWorkbenchParams.ts');
    expect(src).toMatch(/import \{ catalogUnitSymbol, withUnit \} from '\.\.\/\.\.\/format';/);
    expect(src).toContain('withUnit(fmtNum(p.value), catalogUnitSymbol(p.unit))');
    expect(src).not.toMatch(/' ' \+ p\.unit/);
  });

  it('the convert editor maps the converter unit through the mapping before it reaches a knob', () => {
    const src = read('./convertParams.ts');
    expect(src).toMatch(/import \{ catalogUnitSymbol, normFromValue \} from '\.\/format';/);
    expect(src).toContain("catalogUnitSymbol(str(o, 'unit')) || undefined");
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

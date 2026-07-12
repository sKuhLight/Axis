import { describe, expect, it } from 'vitest';
import {
  filterableSlugs,
  specFor,
  specUsable,
  specsBySlug,
  usableSpecs,
  type SpecLibEntry
} from '../presetBrowser/presetBrowserWorkbenchSpecs';

const entry = (over: Partial<SpecLibEntry> = {}): SpecLibEntry => ({
  summaryBlockSlugs: ['amp', 'reverb'],
  models: { amp: ['USA Clean', '5153 Red'], reverb: ['Large Hall'] },
  blocks: null,
  ...over
});

describe('Preset Browser filter specs', () => {
  it('seeds the six default slugs plus any summary slug, sorted', () => {
    const slugs = filterableSlugs([entry({ summaryBlockSlugs: ['amp', 'phaser'] })]);
    // seed set + phaser, all sorted
    expect(slugs).toEqual([...new Set(['amp', 'cab', 'comp', 'delay', 'drive', 'phaser', 'reverb'])].sort());
    expect(slugs).toContain('phaser');
  });

  it('seeds a Type enum from summary model names even with no hydrated params', () => {
    const specs = specsBySlug([entry()]);
    const type = specFor(specs, 'amp', 'type');
    expect(type?.kind).toBe('enum');
    expect([...(type?.enums ?? [])].sort()).toEqual(['5153 Red', 'USA Clean']);
  });

  it('collects enum options and numeric ranges from hydrated params', () => {
    const specs = specsBySlug([
      entry({
        blocks: [
          {
            slug: 'amp',
            params: [
              { label: 'Gain', kind: 'float', value: 3, enumLabel: null },
              { label: 'Gain', kind: 'float', value: 9, enumLabel: null },
              { label: 'Bright', kind: 'enum', value: null, enumLabel: 'On' },
              { label: 'Bright', kind: 'enum', value: null, enumLabel: 'Off' }
            ]
          }
        ]
      })
    ]);
    const gain = specFor(specs, 'amp', 'Gain');
    expect(gain?.kind).toBe('num');
    expect(gain?.min).toBe(3);
    expect(gain?.max).toBe(9);
    const bright = specFor(specs, 'amp', 'Bright');
    expect(bright?.kind).toBe('enum');
    expect([...(bright?.enums ?? [])].sort()).toEqual(['Off', 'On']);
  });

  it('specUsable drops constant numeric params but keeps varying ones and non-empty enums', () => {
    expect(specUsable({ label: 'X', kind: 'num', enums: new Set(), min: 5, max: 5 })).toBe(false);
    expect(specUsable({ label: 'X', kind: 'num', enums: new Set(), min: 1, max: 5 })).toBe(true);
    expect(specUsable({ label: 'X', kind: 'enum', enums: new Set(['On']), min: Infinity, max: -Infinity })).toBe(true);
    expect(specUsable({ label: 'X', kind: 'enum', enums: new Set(), min: Infinity, max: -Infinity })).toBe(false);
  });

  it('usableSpecs lists Type first, then alphabetical, dropping dead params', () => {
    const specs = specsBySlug([
      entry({
        blocks: [
          {
            slug: 'amp',
            params: [
              { label: 'Master', kind: 'float', value: 2, enumLabel: null },
              { label: 'Master', kind: 'float', value: 8, enumLabel: null },
              { label: 'Bass', kind: 'float', value: 5, enumLabel: null } // constant → dropped
            ]
          }
        ]
      })
    ]);
    const labels = usableSpecs(specs, 'amp').map((s) => s.label);
    expect(labels[0]).toBe('Type');
    expect(labels).toContain('Master');
    expect(labels).not.toContain('Bass');
  });
});

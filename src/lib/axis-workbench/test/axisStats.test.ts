import { describe, expect, it } from 'vitest';
import type { PresetSummary, PresetSummaryBlock } from '$lib/api/types';
import { computeAxisStats, familyStats, topAmpDrivePairings, type AxisStatsEntry } from '../axisStats';

function block(slug: string | null, name = slug ?? 'block'): PresetSummaryBlock {
  return { effectId: 1, slug, name, instance: null };
}

function summary(overrides: Partial<PresetSummary> = {}): PresetSummary {
  return {
    number: 0,
    name: 'Preset',
    model: 'FM3',
    crcValid: true,
    scenes: [],
    blocks: [],
    models: {},
    amps: [],
    ...overrides
  };
}

function entry(id: string, overrides: Partial<PresetSummary> = {}, fav = false): AxisStatsEntry {
  return { id, fav, summary: summary(overrides) };
}

describe('computeAxisStats — families and models', () => {
  it('counts a family once per preset even when the block slug repeats', () => {
    const stats = computeAxisStats([
      entry('a', { blocks: [block('delay'), block('delay')], models: { delay: ['Tube Tape'] } }),
      entry('b', { blocks: [block('delay')], models: { delay: ['Tube Tape'] } })
    ]);
    expect(familyStats(stats, 'delay')?.used).toBe(2);
  });

  it('ranks models by how many presets use them, then alphabetically', () => {
    const stats = computeAxisStats([
      entry('a', { models: { amp: ['USA Lead'] } }),
      entry('b', { models: { amp: ['USA Lead'] } }),
      entry('c', { models: { amp: ['Brit JM45'] } })
    ]);
    const amp = familyStats(stats, 'amp');
    expect(amp?.models).toEqual([
      { name: 'USA Lead', count: 2 },
      { name: 'Brit JM45', count: 1 }
    ]);
  });

  it('orders families by preset count, then slug', () => {
    const stats = computeAxisStats([
      entry('a', { models: { amp: ['Brit JM45'], reverb: ['Large Hall'] } }),
      entry('b', { models: { reverb: ['Large Hall'] } })
    ]);
    expect(stats.families.map((f) => f.slug)).toEqual(['reverb', 'amp']);
  });

  it('excludes the hidden utility/routing families', () => {
    const stats = computeAxisStats([
      entry('a', {
        blocks: ['input', 'output', 'peq', 'send', 'return', 'looper', 'amp'].map((slug) => block(slug)),
        models: { amp: ['Brit JM45'], peq: ['Parametric EQ'] }
      })
    ]);
    expect(stats.families.map((f) => f.slug)).toEqual(['amp']);
  });

  it('falls back to the legacy amps list when models is missing', () => {
    const legacy = entry('a', { models: {} });
    (legacy.summary as { models?: unknown }).models = undefined;
    legacy.summary.amps = ['Plexi 100W'];
    const stats = computeAxisStats([legacy]);
    expect(familyStats(stats, 'amp')?.models).toEqual([{ name: 'Plexi 100W', count: 1 }]);
  });

  it('counts a family present via a block slug even without a decoded model', () => {
    const stats = computeAxisStats([entry('a', { blocks: [block('chorus')], models: {} })]);
    const chorus = familyStats(stats, 'chorus');
    expect(chorus?.used).toBe(1);
    expect(chorus?.models).toEqual([]);
  });

  it('counts distinct family+model pairs across the library', () => {
    const stats = computeAxisStats([
      entry('a', { models: { amp: ['USA Lead', 'USA Lead'], reverb: ['Large Hall'] } }),
      entry('b', { models: { amp: ['USA Lead'] } })
    ]);
    expect(stats.distinctModels).toBe(2);
  });

  it('counts favorites', () => {
    const stats = computeAxisStats([entry('a', {}, true), entry('b')]);
    expect(stats.favorites).toBe(1);
  });
});

describe('computeAxisStats — tags', () => {
  it('counts presets per tag, de-dupes case-insensitively, and reports untagged', () => {
    const stats = computeAxisStats(
      [entry('a'), entry('b'), entry('c')],
      { a: ['Lead', 'lead', 'Metal'], b: ['lead'], c: [] }
    );
    expect(stats.tags).toEqual([
      { tag: 'Lead', count: 2 },
      { tag: 'Metal', count: 1 }
    ]);
    expect(stats.tagAssignments).toBe(3);
    expect(stats.untagged).toBe(1);
  });

  it('sorts equal-count tags alphabetically and ignores blank tags', () => {
    const stats = computeAxisStats([entry('a'), entry('b')], { a: ['Rock', '  ', 'Blues'], b: ['Rock', 'Ambient'] });
    expect(stats.tags.map((t) => t.tag)).toEqual(['Rock', 'Ambient', 'Blues']);
  });

  it('handles entries with no tag mapping', () => {
    const stats = computeAxisStats([entry('a')]);
    expect(stats.tags).toEqual([]);
    expect(stats.untagged).toBe(1);
    expect(stats.tagAssignments).toBe(0);
  });
});

describe('topAmpDrivePairings', () => {
  it('ranks the amp+drive model pairs carried by the most presets', () => {
    const stats = topAmpDrivePairings([
      entry('a', { models: { amp: ['Brit JM45'], drive: ['T808 Mod'] } }),
      entry('b', { models: { amp: ['Brit JM45'], drive: ['T808 Mod'] } }),
      entry('c', { models: { amp: ['USA Lead'], drive: ['Full OD'] } })
    ]);
    expect(stats[0]).toEqual({ amp: 'Brit JM45', drive: 'T808 Mod', count: 2 });
  });

  it('ignores presets missing either model list', () => {
    const stats = topAmpDrivePairings([
      entry('a', { models: { amp: ['Brit JM45'] } }),
      entry('b', { models: { drive: ['T808 Mod'] } })
    ]);
    expect(stats).toEqual([]);
  });
});

describe('familyStats', () => {
  it('looks up a slug case-insensitively and returns undefined when absent', () => {
    const stats = computeAxisStats([entry('a', { models: { amp: ['USA Lead'] } })]);
    expect(familyStats(stats, 'AMP')?.slug).toBe('amp');
    expect(familyStats(stats, 'cab')).toBeUndefined();
  });
});

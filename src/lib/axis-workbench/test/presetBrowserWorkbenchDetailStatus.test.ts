import { describe, expect, it } from 'vitest';
import { detailStatusItems } from '../presetBrowser/presetBrowserWorkbenchDetailStatus';
import type { AxisPresetBrowserDetailState } from '../presetBrowser/presetBrowserWorkbenchRuntime';

function detail(overrides: Partial<AxisPresetBrowserDetailState> = {}): AxisPresetBrowserDetailState {
  return {
    entryId: 'dev:10',
    paramsLoaded: false,
    gridLoaded: false,
    versionsLoaded: false,
    blockCount: 0,
    grid: null,
    versions: [],
    ...overrides
  };
}

describe('detailStatusItems', () => {
  it('returns all three items unloaded, with no count in the label, for null detail', () => {
    const items = detailStatusItems(null);
    expect(items.map((item) => item.key)).toEqual(['grid', 'params', 'versions']);
    expect(items.every((item) => item.loaded === false)).toBe(true);
    expect(items.find((item) => item.key === 'versions')?.label).toBe('VERSIONS');
  });

  it('returns all three items unloaded, with no count in the label, for undefined detail', () => {
    const items = detailStatusItems(undefined);
    expect(items.map((item) => item.key)).toEqual(['grid', 'params', 'versions']);
    expect(items.every((item) => item.loaded === false)).toBe(true);
    expect(items.find((item) => item.key === 'versions')?.label).toBe('VERSIONS');
  });

  it('omits the count when there are zero versions', () => {
    const items = detailStatusItems(detail({ versions: [] }));
    const versions = items.find((item) => item.key === 'versions')!;
    expect(versions.label).toBe('VERSIONS');
    expect(versions.loaded).toBe(false);
    expect(versions.title).toBe('No versions');
  });

  it('uses a singular title at exactly one version', () => {
    const items = detailStatusItems(detail({ versions: [{ id: 'v1' }] }));
    const versions = items.find((item) => item.key === 'versions')!;
    expect(versions.label).toBe('VERSIONS 1');
    expect(versions.loaded).toBe(true);
    expect(versions.title).toBe('1 version');
  });

  it('uses a plural title and count label at three versions', () => {
    const items = detailStatusItems(
      detail({ versions: [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }] })
    );
    const versions = items.find((item) => item.key === 'versions')!;
    expect(versions.label).toBe('VERSIONS 3');
    expect(versions.loaded).toBe(true);
    expect(versions.title).toBe('3 versions');
  });

  it('derives the version count from versions.length, not versionsLoaded', () => {
    const items = detailStatusItems(
      detail({ versionsLoaded: false, versions: [{ id: 'v1' }] })
    );
    const versions = items.find((item) => item.key === 'versions')!;
    expect(versions.loaded).toBe(true);
    expect(versions.label).toBe('VERSIONS 1');
  });

  it('reflects grid loaded state in both directions', () => {
    const loaded = detailStatusItems(detail({ gridLoaded: true }));
    const unloaded = detailStatusItems(detail({ gridLoaded: false }));
    expect(loaded.find((item) => item.key === 'grid')?.title).toBe('Grid preview ready');
    expect(loaded.find((item) => item.key === 'grid')?.loaded).toBe(true);
    expect(unloaded.find((item) => item.key === 'grid')?.title).toBe('No grid preview');
    expect(unloaded.find((item) => item.key === 'grid')?.loaded).toBe(false);
  });

  it('reflects params loaded state in both directions', () => {
    const loaded = detailStatusItems(detail({ paramsLoaded: true }));
    const unloaded = detailStatusItems(detail({ paramsLoaded: false }));
    expect(loaded.find((item) => item.key === 'params')?.title).toBe('Params loaded');
    expect(loaded.find((item) => item.key === 'params')?.loaded).toBe(true);
    expect(unloaded.find((item) => item.key === 'params')?.title).toBe('Summary params only');
    expect(unloaded.find((item) => item.key === 'params')?.loaded).toBe(false);
  });

  it('keeps a stable key order across calls', () => {
    expect(detailStatusItems(detail()).map((item) => item.key)).toEqual([
      'grid',
      'params',
      'versions'
    ]);
  });
});

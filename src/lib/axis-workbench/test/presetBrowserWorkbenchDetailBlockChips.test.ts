import { describe, expect, it } from 'vitest';
import {
  detailBlockNodes,
  nextBlockFocus
} from '../presetBrowser/presetBrowserWorkbenchDetailBlockChips';
import { axisPbCatColor } from '../presetBrowser/presetBrowserWorkbenchRowChips';
import type { AxisPresetBrowserBlockSummary } from '../presetBrowser/presetBrowserWorkbenchData';

describe('detailBlockNodes', () => {
  it('returns [] for null blocks', () => {
    expect(detailBlockNodes(null, null)).toEqual([]);
  });

  it('returns [] for undefined blocks', () => {
    expect(detailBlockNodes(undefined, null)).toEqual([]);
  });

  it('returns [] for an empty blocks array', () => {
    expect(detailBlockNodes([], null)).toEqual([]);
  });

  it('puts the All node first, active only when nothing is focused', () => {
    const blocks: AxisPresetBrowserBlockSummary[] = [{ effectId: 1, slug: 'amp', name: 'Amp 1' }];
    const unfocused = detailBlockNodes(blocks, null);
    expect(unfocused[0]).toMatchObject({ key: 'all', label: 'All', color: null, effectId: null, active: true, selectable: true });

    const focused = detailBlockNodes(blocks, 1);
    expect(focused[0].active).toBe(false);
  });

  it('marks exactly one block node active for a given focused id', () => {
    const blocks: AxisPresetBrowserBlockSummary[] = [
      { effectId: 1, slug: 'amp', name: 'Amp 1' },
      { effectId: 2, slug: 'drive', name: 'Drive 1' }
    ];
    const nodes = detailBlockNodes(blocks, 2);
    const active = nodes.filter((n) => n.active);
    expect(active).toHaveLength(1);
    expect(active[0].effectId).toBe(2);
  });

  it('label falls back name -> slug -> Block N', () => {
    const blocks: AxisPresetBrowserBlockSummary[] = [
      { effectId: 1, slug: 'amp', name: 'Amp 1' },
      { effectId: 2, slug: 'drive', name: null },
      { effectId: 3, slug: null, name: null }
    ];
    const nodes = detailBlockNodes(blocks, null);
    expect(nodes[1].label).toBe('Amp 1');
    expect(nodes[2].label).toBe('drive');
    expect(nodes[3].label).toBe('Block 3');
  });

  it('distinguishes two same-family blocks by name and key', () => {
    const blocks: AxisPresetBrowserBlockSummary[] = [
      { effectId: 10, slug: 'drive', name: 'Drive 1' },
      { effectId: 11, slug: 'drive', name: 'Drive 2' }
    ];
    const nodes = detailBlockNodes(blocks, null);
    expect(nodes[1].label).toBe('Drive 1');
    expect(nodes[2].label).toBe('Drive 2');
    expect(nodes[1].key).not.toBe(nodes[2].key);
  });

  it('is not selectable and keyed by index when effectId is null', () => {
    const blocks: AxisPresetBrowserBlockSummary[] = [{ effectId: null, slug: 'amp', name: 'Amp' }];
    const nodes = detailBlockNodes(blocks, null);
    expect(nodes[1].selectable).toBe(false);
    expect(nodes[1].key).toBe('idx-0');
  });

  it('color matches axisPbCatColor for a known slug', () => {
    const blocks: AxisPresetBrowserBlockSummary[] = [{ effectId: 1, slug: 'amp', name: 'Amp 1' }];
    const nodes = detailBlockNodes(blocks, null);
    expect(nodes[1].color).toBe(axisPbCatColor('amp'));
  });
});

describe('nextBlockFocus', () => {
  const blocks: AxisPresetBrowserBlockSummary[] = [
    { effectId: 1, slug: 'amp', name: 'Amp 1' },
    { effectId: 2, slug: 'drive', name: 'Drive 1' }
  ];

  it('returns null for the All node', () => {
    const nodes = detailBlockNodes(blocks, 1);
    expect(nextBlockFocus(nodes[0], 1)).toBeNull();
  });

  it('returns null when re-clicking the already-active node', () => {
    const nodes = detailBlockNodes(blocks, 1);
    const activeNode = nodes.find((n) => n.effectId === 1)!;
    expect(nextBlockFocus(activeNode, 1)).toBeNull();
  });

  it('returns the effectId otherwise', () => {
    const nodes = detailBlockNodes(blocks, null);
    const target = nodes.find((n) => n.effectId === 2)!;
    expect(nextBlockFocus(target, null)).toBe(2);
  });
});

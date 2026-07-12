import { describe, expect, it } from 'vitest';
import {
  axisPbCatColor,
  axisPbCatLabel,
  axisPbCloudChip,
  axisPbCpuColor,
  axisPbDeviceColor,
  axisPbRowAnatomy,
  axisPbRowBlockChips,
  axisPbRowCpuMeter
} from '../presetBrowser/presetBrowserWorkbenchRowChips';
import type { AxisPresetBrowserEntrySummary } from '../presetBrowser/presetBrowserWorkbenchData';

function entry(over: Partial<AxisPresetBrowserEntrySummary> = {}): AxisPresetBrowserEntrySummary {
  return {
    id: 'dev:1',
    sourceId: 'device',
    sourceLabel: 'Device',
    number: 1,
    name: 'Studio Clean',
    model: 'FM3',
    sceneCount: 2,
    blockCount: 0,
    fav: false,
    folder: null,
    tags: [],
    blocks: [],
    syncState: 'none',
    cloudOnly: false,
    ...over
  };
}

describe('row block chips (§4.3)', () => {
  it('maps family slugs to design labels + colours, dropping IO blocks', () => {
    const chips = axisPbRowBlockChips(
      entry({
        blocks: [
          { effectId: 1, slug: 'input', name: 'In 1', instance: 1 },
          { effectId: 2, slug: 'amp', name: '5153 100W Red', instance: 1 },
          { effectId: 3, slug: 'reverb', name: 'Reverb', instance: 1 },
          { effectId: 4, slug: 'output', name: 'Out 1', instance: 1 }
        ]
      })
    );
    // input + output excluded → 2 chips
    expect(chips.map((c) => c.label)).toEqual(['Amp · 5153 100W Red', 'Reverb']);
    expect(chips[0].color).toBe(axisPbCatColor('amp'));
    // block name that just echoes the category collapses to the bare category label.
    expect(chips[1].type).toBeNull();
    expect(chips[1].label).toBe('Reverb');
  });

  it('carries a title of "instance — TYPE"', () => {
    const chips = axisPbRowBlockChips(
      entry({ blocks: [{ effectId: 2, slug: 'drive', name: 'TS808 Mod', instance: 2 }] })
    );
    expect(chips[0].title).toBe('Drive 2 — TS808 Mod');
  });

  it('falls back for unknown slugs', () => {
    expect(axisPbCatLabel('mystery')).toBe('Mystery');
    expect(axisPbCatColor('mystery')).toBe('#7a7a84');
  });
});

describe('CPU meter (§4.3)', () => {
  it('estimates from block count and colours by threshold', () => {
    expect(axisPbCpuColor(50)).toBe('#33c46b');
    expect(axisPbCpuColor(70)).toBe('#f5a623');
    expect(axisPbCpuColor(85)).toBe('#e87b6a');
  });

  it('derives a meter from an entry', () => {
    const meter = axisPbRowCpuMeter(entry({ blockCount: 10 }));
    expect(meter.pct).toBe(35);
    expect(meter.color).toBe('#33c46b');
  });
});

describe('cloud/device chips (§5.1 / §6)', () => {
  it('returns null for signed-out / none state so the row omits the chip', () => {
    expect(axisPbCloudChip('none')).toBeNull();
  });

  it('maps each sync state to short label + colour + glyph', () => {
    expect(axisPbCloudChip('synced')).toMatchObject({ short: 'Synced', color: '#33c46b', glyph: '☁' });
    expect(axisPbCloudChip('modified')).toMatchObject({ short: 'Local edit', color: '#f5a623', glyph: '↑' });
    expect(axisPbCloudChip('outdated')).toMatchObject({ short: 'Update', color: '#4a82e0', glyph: '↓' });
    expect(axisPbCloudChip('cloudOnly')).toMatchObject({ short: 'Cloud', color: '#9b8cf0' });
    expect(axisPbCloudChip('deviceOnly')).toMatchObject({ short: 'Device', glyph: '▪' });
  });

  it('picks a device colour by model family', () => {
    expect(axisPbDeviceColor('Axe-Fx III')).toBe('#4f6bed');
    expect(axisPbDeviceColor('FM9')).toBe('#2fb0c9');
    expect(axisPbDeviceColor('FM3')).toBe('#d98a2b');
    expect(axisPbDeviceColor(null)).toBe('#8a8a94');
  });
});

describe('full row anatomy', () => {
  it('bundles chips, meter, cloud chip, capped tag pills and scenes', () => {
    const anatomy = axisPbRowAnatomy(
      entry({
        blockCount: 3,
        blocks: [{ effectId: 2, slug: 'amp', name: 'JCM800', instance: 1 }],
        tags: ['Lead', 'Hi-Gain', 'Rock', 'Extra'],
        sceneCount: 4,
        syncState: 'synced'
      })
    );
    expect(anatomy.blockChips).toHaveLength(1);
    expect(anatomy.tagPills).toEqual(['Lead', 'Hi-Gain', 'Rock']); // capped at 3
    expect(anatomy.cloud?.short).toBe('Synced');
    expect(anatomy.sceneCount).toBe(4);
    expect(anatomy.cpu.pct).toBeGreaterThan(0);
  });
});

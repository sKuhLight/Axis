import { describe, expect, it } from 'vitest';
import { AxisFcWorkbenchRuntime } from '../fc/fcWorkbenchRuntime';
import type { AxisFcModelLike } from '../fc/fcWorkbenchData';

const model: AxisFcModelLike = {
  effectId: 199,
  paramsWidth: 4,
  configs: 24,
  liveState: true,
  layouts: 3,
  views: 2,
  switches: 4,
  configsPerLayout: 8,
  labelLen: 3,
  fields: {
    tapCategory: { base: 100, stride: 10 },
    tapFunction: { base: 200, stride: 10 },
    tapDisplay: { base: 300, stride: 10 },
    tapParams: { base: 400, stride: 10, width: 4 },
    tapLabel: { base: 500, stride: 10 },
    holdCategory: { base: 600, stride: 10 },
    holdFunction: { base: 700, stride: 10 },
    holdDisplay: { base: 800, stride: 10 },
    holdParams: { base: 900, stride: 10, width: 4 },
    holdLabel: { base: 1000, stride: 10 },
    color: { base: 1100, stride: 10 }
  },
  labelModes: {
    '0': 'Default',
    '2': 'Custom'
  }
};

describe('FC Workbench runtime', () => {
  it('restores the previous host when multiple FC panes bind and unbind', async () => {
    const runtime = new AxisFcWorkbenchRuntime();
    const hostA = { loadModel: async () => ({ ...model, effectId: 101 }) };
    const hostB = { loadModel: async () => ({ ...model, effectId: 202 }) };
    const unbindA = runtime.bindHost(hostA);
    const unbindB = runtime.bindHost(hostB);

    expect((await runtime.loadModel())?.effectId).toBe(202);

    unbindB();
    expect((await runtime.loadModel())?.effectId).toBe(101);

    unbindA();
    await expect(runtime.loadModel()).resolves.toBeNull();
    expect(runtime.snapshot.error).toContain('No FC runtime host');
  });

  it('loads the model and merges live read-back state', async () => {
    const runtime = new AxisFcWorkbenchRuntime();
    runtime.bindHost({
      loadModel: async () => model,
      readState: async () => ({
        config: 14,
        fields: {
          tapCategory: 1,
          holdCategory: 0,
          color: 3
        },
        tapLabel: 'TAP',
        holdLabel: 'HLD'
      })
    });

    await runtime.loadModel();
    await runtime.readSelection({ layout: 1, view: 1, switchIndex: 2, side: 'tap' });

    expect(runtime.snapshot.edits).toMatchObject({
      'tapCategory:14': 1,
      'holdCategory:14': 0,
      'color:14': 3
    });
    expect(runtime.snapshot.labelText).toMatchObject({
      'tapLabel:14': 'TAP',
      'holdLabel:14': 'HLD'
    });
    expect(runtime.snapshot.present[14]).toBe(true);
  });

  it('writes fields, categories, slots, labels, and colors through model pid formulas', async () => {
    const runtime = new AxisFcWorkbenchRuntime();
    const writes: string[] = [];
    runtime.bindHost({
      loadModel: async () => model,
      setParam: async (effectId, paramId, value, refresh) => {
        writes.push(`${effectId}:${paramId}:${value}:${refresh}`);
      }
    });

    await runtime.loadModel();
    await runtime.setCategory('tap', 5, 14);
    await runtime.writeSlot('tap', 2, 7, 14);
    await runtime.writeLabel('tap', 'AB', 14);
    await runtime.writeField('color', 3, 14);

    expect(writes).toEqual([
      '199:240:5:false',
      '199:340:0:false',
      '199:542:7:false',
      '199:640:65:false',
      '199:641:66:false',
      '199:642:0:false',
      '199:440:2:false',
      '199:1240:3:false'
    ]);
    expect(runtime.snapshot.edits).toMatchObject({
      'tapCategory:14': 5,
      'tapFunction:14': 0,
      'tapParams#2:14': 7,
      'tapLabel:14': 2,
      'tapDisplay:14': 2,
      'color:14': 3
    });
    expect(runtime.snapshot.labelText['tapLabel:14']).toBe('AB');
  });
});

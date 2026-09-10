import { describe, expect, it } from 'vitest';
import { graphInstance, graphSlotsForPage } from './deviceWidgets';

const graph = (graphIndex?: string) => ({ widget: 'graph' as const, ...(graphIndex ? { render: { graphIndex } } : {}) });
const knob = { widget: 'knob' as const };

describe('graphInstance', () => {
  it('reads the device-authored instance id', () => {
    // The compressor's Basic-page transfer curve; its Sidechain filter response is '0'.
    expect(graphInstance(graph('1'))).toBe(1);
    expect(graphInstance(graph('0'))).toBe(0);
  });

  it('takes the leading entry of a comma-list', () => {
    // The cab Align page authors one widget that draws several curves: '0,1' / '0,1,2,3'.
    expect(graphInstance(graph('0,1'))).toBe(0);
    expect(graphInstance(graph('0,1,2,3'))).toBe(0);
  });

  it('is null when the control carries no render metadata', () => {
    expect(graphInstance(graph())).toBeNull();
    expect(graphInstance({ render: {} })).toBeNull();
    expect(graphInstance(null)).toBeNull();
    expect(graphInstance(undefined)).toBeNull();
  });

  it('rejects a non-integer or negative index rather than trusting it', () => {
    expect(graphInstance({ render: { graphIndex: 'x' } })).toBeNull();
    expect(graphInstance({ render: { graphIndex: '-1' } })).toBeNull();
    expect(graphInstance({ render: { graphIndex: '1.5' } })).toBeNull();
  });
});

describe('graphSlotsForPage', () => {
  it('numbers graphs by the device id, not by position', () => {
    // Controllers puts LFO 1 and LFO 2 on one page and calls them 2 and 3 — counting says 0 and 1.
    const lfo1 = graph('2');
    const lfo2 = graph('3');
    const slots = graphSlotsForPage([knob, lfo1, knob, lfo2]);
    expect(slots.get(lfo1)).toBe(2);
    expect(slots.get(lfo2)).toBe(3);
  });

  it('falls back to ordinals when the layout authors no ids', () => {
    const a = graph();
    const b = graph();
    const slots = graphSlotsForPage([a, knob, b]);
    expect(slots.get(a)).toBe(0);
    expect(slots.get(b)).toBe(1);
  });

  it('falls back wholesale on a page that mixes authored and missing ids', () => {
    // Mixing an id space with an ordinal space could collide, so the page picks one or the other.
    const authored = graph('3');
    const bare = graph();
    const slots = graphSlotsForPage([authored, bare]);
    expect(slots.get(authored)).toBe(0);
    expect(slots.get(bare)).toBe(1);
  });

  it('skips non-graph controls and maps nothing for a page without graphs', () => {
    expect(graphSlotsForPage([knob, knob]).size).toBe(0);
  });
});

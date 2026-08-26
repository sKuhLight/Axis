import { describe, expect, it } from 'vitest';
import { geqBandsFromLayout, hzFromLabel, shapeFromLabel } from './eq';
import type { DeviceLayout, LayoutControl } from './types';

const slider = (label: string, paramId: number): LayoutControl => ({ label, paramName: label, paramId, widget: 'slider' });
const knob = (label: string, paramId: number): LayoutControl => ({ label, paramName: label, paramId, widget: 'knob' });
const page = (name: string, rows: LayoutControl[][]) => ({ name, rows: rows.map((controls) => ({ controls })) });
const lay = (pages: ReturnType<typeof page>[]): DeviceLayout => ({ family: 'AMP', pages });

describe('shapeFromLabel', () => {
  it('maps device type labels to curve shapes', () => {
    expect(shapeFromLabel('Blocking', true)).toBe('lowcut');
    expect(shapeFromLabel('Shelving', false)).toBe('highshelf');
    expect(shapeFromLabel('Peaking', true)).toBe('bell');
  });
});

describe('hzFromLabel', () => {
  it('reads plain and k-suffixed labels', () => {
    expect(hzFromLabel('100')).toBe(100);
    expect(hzFromLabel('1.6K')).toBe(1600);
    expect(hzFromLabel('8k')).toBe(8000);
    expect(hzFromLabel('Presence')).toBe(0);
  });
});

describe('geqBandsFromLayout', () => {
  it('returns [] with no layout', () => {
    expect(geqBandsFromLayout(null)).toEqual([]);
    expect(geqBandsFromLayout(lay([]))).toEqual([]);
  });

  // Verified against a live FM3: the amp's output EQ is eight sliders, ids 57..64. The param list
  // names 57..60 `Bass 2`/`Mid 2`/`Treble 2`/`Presence 2`, so only the layout gets this right.
  it('finds all eight amp output-EQ bands with the layout labels', () => {
    const layout = lay([
        page('Preamp', [[knob('Drive', 10), knob('Bass', 11), knob('Mid', 12)]]),
        page('Input EQ', [[knob('Frequency', 74), knob('Q', 73), knob('Gain', 75)]]),
        page('Output EQ', [
          [slider('62', 57), slider('125', 58), slider('250', 59), slider('500', 60),
           slider('1K', 61), slider('2K', 62), slider('4K', 63), slider('8K', 64)],
          [knob('Level', 1), knob('Balance', 2)]
        ])
    ]);
    const bands = geqBandsFromLayout(layout);
    expect(bands.map((b) => b.paramId)).toEqual([57, 58, 59, 60, 61, 62, 63, 64]);
    expect(bands.map((b) => b.label)).toEqual(['62', '125', '250', '500', '1K', '2K', '4K', '8K']);
    expect(bands.map((b) => b.hz)).toEqual([62, 125, 250, 500, 1000, 2000, 4000, 8000]);
  });

  // A live `7 Band Constant Q` GEQ: seven layout bands at 100..6400, against ten stale param names.
  it('takes the band count from the layout, not the param list', () => {
    const layout = lay([
        page('Graphic EQ', [
          [slider('100', 0), slider('200', 1), slider('400', 2), slider('800', 3),
           slider('1600', 4), slider('3200', 5), slider('6400', 6)],
          [knob('Balance', 12), knob('Level', 11)]
        ])
    ]);
    const bands = geqBandsFromLayout(layout);
    expect(bands).toHaveLength(7);
    expect(bands.map((b) => b.hz)).toEqual([100, 200, 400, 800, 1600, 3200, 6400]);
  });

  it('ignores rows of non-slider controls and word-labelled sliders', () => {
    const layout = lay([page('Amp', [
        [knob('100', 1), knob('200', 2), knob('400', 3), knob('800', 4)],
        [slider('Drive', 5), slider('Master', 6), slider('Presence', 7), slider('Depth', 8)]
      ])]);
    expect(geqBandsFromLayout(layout)).toEqual([]);
  });

  it('needs at least four bands before a row counts as a bank', () => {
    const three = lay([page('X', [[slider('100', 1), slider('200', 2), slider('400', 3)]])]);
    expect(geqBandsFromLayout(three)).toEqual([]);
    const four = lay([page('X', [[slider('100', 1), slider('200', 2), slider('400', 3), slider('800', 4)]])]);
    expect(geqBandsFromLayout(four)).toHaveLength(4);
  });

  it('takes only the frequency sliders from a mixed row', () => {
    const layout = lay([page('X', [[
        { label: '', paramName: null, paramId: null, widget: 'spacer' } as LayoutControl,
        slider('62', 57), slider('125', 58), slider('250', 59), slider('500', 60),
        knob('Level', 1)
      ]])]);
    expect(geqBandsFromLayout(layout).map((b) => b.paramId)).toEqual([57, 58, 59, 60]);
  });
});

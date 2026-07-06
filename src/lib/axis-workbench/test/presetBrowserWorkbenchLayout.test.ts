import { describe, expect, it } from 'vitest';
import {
  AXIS_PB_SOFT_ROW_CAP,
  applyRowCap,
  axisPbRank,
  electAxisPbOwner
} from '../presetBrowser/presetBrowserWorkbenchLayout';

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('Preset Browser soft row cap (§4.1)', () => {
  it('does not cap at or below the soft cap', () => {
    const cap = applyRowCap(rows(AXIS_PB_SOFT_ROW_CAP), false);
    expect(cap.capped).toBe(false);
    expect(cap.rows).toHaveLength(AXIS_PB_SOFT_ROW_CAP);
    expect(cap.hiddenCount).toBe(0);
  });

  it('caps to 14 rows and reports the hidden count when over cap', () => {
    const cap = applyRowCap(rows(40), false);
    expect(cap.capped).toBe(true);
    expect(cap.rows).toHaveLength(14);
    expect(cap.totalRows).toBe(40);
    expect(cap.hiddenCount).toBe(26);
  });

  it('shows all rows once expanded', () => {
    const cap = applyRowCap(rows(40), true);
    expect(cap.capped).toBe(false);
    expect(cap.rows).toHaveLength(40);
    expect(cap.hiddenCount).toBe(0);
  });
});

describe('Preset Browser overlay owner rank (§1)', () => {
  it('ranks list < detail < sources < full', () => {
    expect(axisPbRank('list')).toBeLessThan(axisPbRank('detail'));
    expect(axisPbRank('detail')).toBeLessThan(axisPbRank('sources'));
    expect(axisPbRank('sources')).toBeLessThan(axisPbRank('full'));
  });

  it('elects the lowest-rank mounted part as owner', () => {
    expect(electAxisPbOwner(['sources', 'list', 'detail'])).toBe('list');
    expect(electAxisPbOwner(['sources', 'detail'])).toBe('detail');
    expect(electAxisPbOwner(['sources'])).toBe('sources');
    expect(electAxisPbOwner(['full'])).toBe('full');
  });

  it('returns null when nothing is mounted', () => {
    expect(electAxisPbOwner([])).toBeNull();
  });
});

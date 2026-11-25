import { describe, expect, it } from 'vitest';
import {
  EDIT_BAR_DROPDOWN_MAX,
  EDIT_BAR_OVERFLOW_ORDER,
  EDIT_BAR_STATUS_RESERVE,
  editBarControlHeight,
  editBarIsTouch,
  estimateDropdownWidth,
  estimateEditBarGroups,
  estimateErrorWidth,
  estimateSegmentWidth,
  estimateStatusWidth,
  resolveEditBarLayout,
  type EditBarEstimateInput
} from '../editBarLayout';
import { EDIT_BAR_STATUS_IDLE } from '../editBarMenus';

/** Bar padding: 10px left + 12px right on desktop, 10px each side on touch. */
const available = (windowWidth: number) => windowWidth - (editBarIsTouch(windowWidth) ? 20 : 22);

/** Axis-like labels: Auto as text + Desktop / Tablet / Mobile as glyphs. */
function axisLike(windowWidth: number, overrides: Partial<EditBarEstimateInput> = {}): EditBarEstimateInput {
  return {
    touch: editBarIsTouch(windowWidth),
    pageLabel: 'Grid',
    layoutLabel: 'Default',
    profile: {
      label: 'Auto · Desktop',
      options: [
        { label: 'Auto', icon: false },
        { label: 'Desktop', icon: true },
        { label: 'Tablet', icon: true },
        { label: 'Mobile', icon: true }
      ]
    },
    ...overrides
  };
}

function layoutAt(windowWidth: number, extra: { errorWidth?: number; slack?: number; input?: Partial<EditBarEstimateInput> } = {}) {
  const input = axisLike(windowWidth, extra.input);
  return resolveEditBarLayout({
    available: available(windowWidth),
    touch: input.touch,
    groups: estimateEditBarGroups(input),
    statusWidth: estimateStatusWidth(EDIT_BAR_STATUS_IDLE),
    errorWidth: extra.errorWidth,
    slack: extra.slack
  });
}

describe('edit bar estimates', () => {
  it('switches to touch at or below the 760px phone breakpoint (same as the shell)', () => {
    expect(editBarIsTouch(759)).toBe(true);
    expect(editBarIsTouch(760)).toBe(true);
    expect(editBarIsTouch(761)).toBe(false);
    expect(editBarControlHeight(false)).toBe(28);
    expect(editBarControlHeight(true)).toBe(44);
  });

  it('caps dropdowns at their CSS max width and grows with the label', () => {
    expect(estimateDropdownWidth('Page', 'Grid')).toBeLessThan(estimateDropdownWidth('Page', 'Preset Browser'));
    expect(estimateDropdownWidth('Page', 'x'.repeat(200))).toBe(EDIT_BAR_DROPDOWN_MAX);
    expect(estimateDropdownWidth('', 'Add', { icon: true })).toBeGreaterThan(estimateDropdownWidth('', 'Add'));
  });

  it('sizes icon segments by the control height (bigger touch targets)', () => {
    const segs = [
      { label: 'Auto', icon: false },
      { label: 'Desktop', icon: true }
    ];
    expect(estimateSegmentWidth(segs, true)).toBeGreaterThan(estimateSegmentWidth(segs, false));
  });

  it('reserves at most the status reserve and caps the error chip', () => {
    expect(estimateStatusWidth(EDIT_BAR_STATUS_IDLE)).toBe(EDIT_BAR_STATUS_RESERVE);
    expect(estimateStatusWidth('ok')).toBeLessThan(EDIT_BAR_STATUS_RESERVE);
    expect(estimateErrorWidth('x'.repeat(400))).toBe(340);
  });

  it('lists the groups in bar order and omits profile without a host profile control', () => {
    expect(estimateEditBarGroups(axisLike(1440)).map((g) => g.id)).toEqual(['tag', 'hist', 'page', 'layout', 'profile', 'add']);
    expect(estimateEditBarGroups(axisLike(1440, { profile: null })).map((g) => g.id)).toEqual([
      'tag',
      'hist',
      'page',
      'layout',
      'add'
    ]);
    const profile = estimateEditBarGroups(axisLike(1440)).find((g) => g.id === 'profile');
    expect(profile?.altWidth).toBeGreaterThan(0);
  });
});

describe('resolveEditBarLayout', () => {
  it('@1440: nothing hidden, status shown, no More', () => {
    const result = layoutAt(1440);
    expect(result.hidden).toEqual([]);
    expect(result.alt).toEqual([]);
    expect(result.showStatus).toBe(true);
    expect(result.overflow).toEqual([]);
    expect(result.showMore).toBe(false);
    expect(result.width).toBeLessThanOrEqual(available(1440));
  });

  it('@1100: every group still fits in one row', () => {
    const result = layoutAt(1100);
    expect(result.hidden).toEqual([]);
    expect(result.showMore).toBe(false);
    expect(result.width).toBeLessThanOrEqual(available(1100));
  });

  it('@834: the status text goes first; every group stays in the bar', () => {
    const result = layoutAt(834);
    expect(result.showStatus).toBe(false);
    expect(result.hidden).toEqual([]);
    expect(result.showMore).toBe(false);
    expect(result.width).toBeLessThanOrEqual(available(834));
  });

  it('@390 touch: history + page + More + Done; the rest collapses into More in scope order', () => {
    const result = layoutAt(390);
    expect(result.showStatus).toBe(false);
    expect(result.hidden).toEqual(['tag', 'add', 'profile', 'layout']);
    expect(result.hidden).not.toContain('page');
    expect(result.overflow).toEqual(['layout', 'profile', 'add']);
    expect(result.showMore).toBe(true);
    // A hidden profile drops its alternate form.
    expect(result.alt).toEqual([]);
    expect(result.width).toBeLessThanOrEqual(available(390));
  });

  it('collapses the profile control to its dropdown form before hiding Add', () => {
    // Text-labelled options make the segmented control wider than the dropdown.
    const input = axisLike(1440, {
      profile: {
        label: 'Desktop',
        options: [
          { label: 'Automatic', icon: false },
          { label: 'Desktop computer', icon: false },
          { label: 'Tablet device', icon: false },
          { label: 'Mobile phone', icon: false }
        ]
      }
    });
    const groups = estimateEditBarGroups(input);
    // Everything shown, minus the (zero-width) status text and its 6px gap.
    const full = resolveEditBarLayout({ available: 100000, touch: false, groups, statusWidth: 0 }).width - 6;
    const tag = groups.find((g) => g.id === 'tag')!.width;
    const result = resolveEditBarLayout({
      available: full - tag - 13 - 1, // dropping the status text and the tag is not enough
      touch: false,
      groups,
      statusWidth: 240
    });
    expect(result.hidden).toEqual(['tag']);
    expect(result.alt).toEqual(['profile']);
    expect(result.showMore).toBe(false);
  });

  it('an error chip suppresses the status text', () => {
    const result = layoutAt(1440, { errorWidth: estimateErrorWidth('Page label cannot be empty.') });
    expect(result.showStatus).toBe(false);
    expect(result.hidden).toEqual([]);
  });

  it('a wide error chip makes groups collapse like any other width (desktop, one row)', () => {
    expect(layoutAt(834, { errorWidth: 340 }).hidden.length).toBeGreaterThan(0);
  });

  it('touch: the error chip takes the second row and never pushes a group into More', () => {
    for (const width of [390, 480, 600]) {
      const without = layoutAt(width);
      const withError = layoutAt(width, { errorWidth: 340 });
      expect(withError.hidden).toEqual(without.hidden);
      expect(withError.overflow).toEqual(without.overflow);
      expect(withError.showStatus).toBe(false);
    }
  });

  it('collapses deterministically in the documented order', () => {
    const input = axisLike(1440);
    const groups = estimateEditBarGroups(input);
    const seen: string[][] = [];
    for (let width = 1500; width >= 0; width -= 10) {
      const result = resolveEditBarLayout({ available: width, touch: false, groups, statusWidth: 240 });
      seen.push(result.hidden);
      // Same input → same output.
      expect(resolveEditBarLayout({ available: width, touch: false, groups, statusWidth: 240 })).toEqual(result);
    }
    const order = seen.reduce<string[]>((acc, hidden) => {
      for (const id of hidden) if (!acc.includes(id)) acc.push(id);
      return acc;
    }, []);
    expect(order).toEqual(['tag', 'add', 'profile', 'layout', 'page']);
  });

  it('lists every collapsed group in scope order regardless of collapse order', () => {
    const result = layoutAt(1440, { slack: 100000 });
    expect(result.overflow).toEqual([...EDIT_BAR_OVERFLOW_ORDER]);
  });

  it('never hides history or Done, even with no room at all', () => {
    for (const touch of [false, true]) {
      const groups = estimateEditBarGroups({ ...axisLike(touch ? 390 : 1440), touch });
      const result = resolveEditBarLayout({ available: 0, touch, groups, statusWidth: 240, errorWidth: 200 });
      expect(result.hidden).not.toContain('hist');
      expect(result.hidden).toEqual(expect.arrayContaining(['tag', 'page', 'layout', 'profile', 'add']));
      expect(result.showMore).toBe(true);
    }
  });

  it('skips steps for groups the bar does not have', () => {
    const result = layoutAt(390, { input: { profile: null } });
    expect(result.hidden).not.toContain('profile');
    expect(result.overflow).not.toContain('profile');
    expect(result.alt).toEqual([]);
  });

  it('measured slack collapses further groups', () => {
    const base = layoutAt(1440);
    const squeezed = layoutAt(1440, { slack: 700 });
    expect(base.showStatus).toBe(true);
    expect(squeezed.showStatus).toBe(false);
    expect(squeezed.hidden.length).toBeGreaterThan(base.hidden.length);
  });
});

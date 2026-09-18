import { describe, expect, it } from 'vitest';
import {
  buildNarrowGroups,
  clearAllNarrow,
  clearNarrowDim,
  isNarrowGroupActive,
  isNarrowValueSelected,
  sceneCondsFor,
  toggleNarrowValue,
  type AxisPbNarrowEntry,
  type AxisPbNarrowGroup
} from '../presetBrowser/presetBrowserWorkbenchNarrow';
import type { AxisPbCond, AxisPbMatchEntry } from '../presetBrowser/presetBrowserWorkbenchQuery';

function entry(
  name: string,
  models: Record<string, string[]>,
  tags: string[] = [],
  sceneCount = 0
): AxisPbNarrowEntry {
  const blocks = Object.keys(models).map((slug) => ({ slug, params: [] }));
  const match: AxisPbMatchEntry = { name, tags, sceneCount, models, blockSlugs: Object.keys(models), blocks };
  const hay = [name, tags.join(' '), Object.values(models).flat().join(' ')].join(' ').toLowerCase();
  return { match, hay };
}

const A = entry('Studio Clean Lead', { amp: ['USA Clean'], drive: ['TS808'], cab: ['4×12 Greenback'] }, ['Clean'], 4);
const B = entry('Session Clean Boost', { amp: ['USA Clean'], drive: ['TS808'], cab: ['1×12 Deluxe'] }, ['Clean'], 2);
const C = entry('Ambient Bloom', { amp: ['Double Verb'], cab: ['1×12 Deluxe'] }, ['Ambient'], 5);
const ALL = [A, B, C];

const groupOf = (groups: AxisPbNarrowGroup[], key: string) => groups.find((g) => g.key === key)!;
const valueOf = (group: AxisPbNarrowGroup, value: string) => group.values.find((v) => v.value === value);

const ampType = (val: string): AxisPbCond => ({ kind: 'block', block: 'amp', params: [{ name: 'Type', op: '=', val }] });
const tag = (val: string): AxisPbCond => ({ kind: 'tag', val });
const AMP = { key: 'amp', kind: 'block' } as const;
const TAG = { key: 'tag', kind: 'tag' } as const;
const SCENES = { key: 'scenes', kind: 'scenes' } as const;

describe('buildNarrowGroups', () => {
  it('groups type/tag/scene values with counts over the scope', () => {
    const groups = buildNarrowGroups(ALL, [], '');
    expect(valueOf(groupOf(groups, 'amp'), 'USA Clean')?.count).toBe(2);
    expect(valueOf(groupOf(groups, 'amp'), 'Double Verb')?.count).toBe(1);
    expect(valueOf(groupOf(groups, 'tag'), 'Clean')?.count).toBe(2);
    expect(valueOf(groupOf(groups, 'scenes'), '3–4')?.count).toBe(1);
  });

  it('omits a block family with fewer than two distinct types', () => {
    expect(groupOf(buildNarrowGroups(ALL, [], ''), 'drive')).toBeUndefined();
  });

  it('with a typed condition, only offers values still inside it', () => {
    const amp = groupOf(buildNarrowGroups(ALL, [ampType('USA Clean')], ''), 'amp');
    expect(valueOf(amp, 'USA Clean')?.count).toBe(2);
    expect(valueOf(amp, 'USA Clean')?.selected).toBe(true);
    expect(valueOf(amp, 'Double Verb')).toBeUndefined();
  });

  it('applies the free-text search to the offered values', () => {
    const groups = buildNarrowGroups(ALL, [], 'clean');
    expect(valueOf(groupOf(groups, 'tag'), 'Clean')?.count).toBe(2);
    expect(valueOf(groupOf(groups, 'tag'), 'Ambient')).toBeUndefined();
  });

  it('refreshes the offered values to those still matching after a pick', () => {
    const X = entry('Blue Rig', { amp: ['5153 100W Blue'] }, [], 3);
    const Y = entry('Green Rig', { amp: ['5153 100W Green'] }, [], 3);
    const Z = entry('Hook Rig', { amp: ['Capt Hook 2B'] }, [], 3);
    const conds: AxisPbCond[] = [ampType('5153'), ampType('5153 100W Blue')];
    const amp = groupOf(buildNarrowGroups([X, Y, Z], conds, ''), 'amp');
    expect(valueOf(amp, '5153 100W Blue')?.selected).toBe(true);
    expect(valueOf(amp, '5153 100W Blue')?.count).toBe(1);
    expect(valueOf(amp, '5153 100W Green')).toBeUndefined();
    expect(valueOf(amp, 'Capt Hook 2B')).toBeUndefined();
  });
});

describe('toggleNarrowValue', () => {
  it('appends a clause and removes exactly it again', () => {
    const conds: AxisPbCond[] = [];
    const group = groupOf(buildNarrowGroups(ALL, conds, ''), 'amp');
    toggleNarrowValue(conds, group, 'USA Clean');
    expect(conds).toEqual([ampType('USA Clean')]);
    toggleNarrowValue(conds, group, 'USA Clean');
    expect(conds).toEqual([]);
  });

  it('is additive — a hand-typed clause is never rewritten', () => {
    const X = entry('Blue Rig', { amp: ['5153 100W Blue'] }, [], 3);
    const Y = entry('Green Rig', { amp: ['5153 100W Green'] }, [], 3);
    const conds: AxisPbCond[] = [ampType('5153')];
    const group = groupOf(buildNarrowGroups([X, Y], conds, ''), 'amp');
    toggleNarrowValue(conds, group, '5153 100W Blue');
    expect(conds).toEqual([ampType('5153'), ampType('5153 100W Blue')]);
    toggleNarrowValue(conds, group, '5153 100W Blue');
    expect(conds).toEqual([ampType('5153')]);
  });

  it('narrows to the pick, then widens again when it is removed', () => {
    const X = entry('Blue Rig', { amp: ['5153 100W Blue'] }, [], 3);
    const Y = entry('Green Rig', { amp: ['5153 100W Green'] }, [], 3);
    const conds: AxisPbCond[] = [ampType('5153')];
    const entries = [X, Y];

    let group = groupOf(buildNarrowGroups(entries, conds, ''), 'amp');
    toggleNarrowValue(conds, group, '5153 100W Blue');
    expect(conds).toEqual([ampType('5153'), ampType('5153 100W Blue')]);

    // The list has refreshed down to the selected value only.
    group = groupOf(buildNarrowGroups(entries, conds, ''), 'amp');
    expect(group.values.map((v) => v.value)).toEqual(['5153 100W Blue']);

    toggleNarrowValue(conds, group, '5153 100W Blue');
    expect(conds).toEqual([ampType('5153')]);

    // Removing it widens the list back, so the other variant is pickable again.
    group = groupOf(buildNarrowGroups(entries, conds, ''), 'amp');
    expect(group.values.map((v) => v.value)).toContain('5153 100W Green');
    toggleNarrowValue(conds, group, '5153 100W Green');
    expect(conds).toEqual([ampType('5153'), ampType('5153 100W Green')]);
  });

  it('is additive for tags', () => {
    const conds: AxisPbCond[] = [tag('Lead')];
    const group = groupOf(buildNarrowGroups(ALL, [], ''), 'tag');
    toggleNarrowValue(conds, group, 'Clean');
    expect(conds).toEqual([tag('Lead'), tag('Clean')]);
    toggleNarrowValue(conds, group, 'Clean');
    expect(conds).toEqual([tag('Lead')]);
  });

  it('appends and removes a scene bucket without touching a typed scene clause', () => {
    const conds: AxisPbCond[] = [{ kind: 'scenes', op: '>', val: '4' }];
    const group = groupOf(buildNarrowGroups(ALL, conds, ''), 'scenes');
    toggleNarrowValue(conds, group, '5+');
    expect(conds).toEqual([{ kind: 'scenes', op: '>', val: '4' }, ...sceneCondsFor('5+')]);
    toggleNarrowValue(conds, group, '5+');
    expect(conds).toEqual([{ kind: 'scenes', op: '>', val: '4' }]);
  });
});

describe('clear', () => {
  it('clears a group back to the typed query', () => {
    const conds: AxisPbCond[] = [ampType('5153'), ampType('5153 100W Blue'), tag('Lead')];
    const group = groupOf(buildNarrowGroups([entry('b', { amp: ['5153 100W Blue', 'jcm'] })], conds, ''), 'amp');
    clearNarrowDim(conds, group);
    expect(conds).toEqual([ampType('5153'), tag('Lead')]);
  });

  it('clearAllNarrow removes every group clause, keeping the typed query', () => {
    const conds: AxisPbCond[] = [ampType('5153'), ampType('5153 100W Blue')];
    const groups = buildNarrowGroups([entry('b', { amp: ['5153 100W Blue', 'jcm'] })], conds, '');
    clearAllNarrow(conds, groups);
    expect(conds).toEqual([ampType('5153')]);
  });
});

describe('selection helpers', () => {
  it('matches a value exactly, never as a substring', () => {
    expect(isNarrowValueSelected([ampType('USA Clean')], AMP, 'USA Clean')).toBe(true);
    expect(isNarrowValueSelected([ampType('5153')], AMP, '5153 100W Blue')).toBe(false);
    expect(isNarrowValueSelected([tag('Clean')], TAG, 'clean')).toBe(true);
  });

  it('detects group activity', () => {
    expect(isNarrowGroupActive([ampType('USA Clean')], AMP)).toBe(true);
    expect(isNarrowGroupActive([], AMP)).toBe(false);
    expect(isNarrowGroupActive([{ kind: 'scenes', op: '>', val: '4' }], SCENES)).toBe(true);
  });
});

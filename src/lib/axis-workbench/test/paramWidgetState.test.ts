import { describe, expect, it } from 'vitest';
import { resolveParamWidgetState } from '../widgets/paramWidgetState';

describe('resolveParamWidgetState', () => {
  it('is live when the bound block is the open block', () => {
    expect(
      resolveParamWidgetState({ boundEffectId: 106, openEffectId: 106, presetEffectIds: [106, 100] })
    ).toBe('live');
  });

  it('is readonly when the bound block exists in the preset but is not open', () => {
    expect(
      resolveParamWidgetState({ boundEffectId: 106, openEffectId: 100, presetEffectIds: [106, 100] })
    ).toBe('readonly');
  });

  it('is readonly when the block exists but nothing is open', () => {
    expect(
      resolveParamWidgetState({ boundEffectId: 106, openEffectId: undefined, presetEffectIds: [106] })
    ).toBe('readonly');
  });

  it('is missing when the bound block is absent from the current preset', () => {
    expect(
      resolveParamWidgetState({ boundEffectId: 999, openEffectId: 100, presetEffectIds: [106, 100] })
    ).toBe('missing');
  });

  it('accepts a Set roster (fast path) as well as an array', () => {
    expect(
      resolveParamWidgetState({ boundEffectId: 106, openEffectId: undefined, presetEffectIds: new Set([106]) })
    ).toBe('readonly');
    expect(
      resolveParamWidgetState({ boundEffectId: 5, openEffectId: undefined, presetEffectIds: new Set([106]) })
    ).toBe('missing');
  });

  it('never reports missing while the preset roster is unknown', () => {
    expect(
      resolveParamWidgetState({ boundEffectId: 999, openEffectId: undefined, presetEffectIds: undefined })
    ).toBe('readonly');
  });

  it('treats an unbound widget (no effectId) as a readonly preview, not missing', () => {
    expect(
      resolveParamWidgetState({ boundEffectId: undefined, openEffectId: 100, presetEffectIds: [] })
    ).toBe('readonly');
    expect(
      resolveParamWidgetState({ boundEffectId: undefined, openEffectId: undefined, presetEffectIds: undefined })
    ).toBe('readonly');
  });

  it('prefers live even if the roster is empty (open block is authoritative)', () => {
    expect(
      resolveParamWidgetState({ boundEffectId: 106, openEffectId: 106, presetEffectIds: [] })
    ).toBe('live');
  });

  it('is live when the block is in the preset and its params are hydrated (T20 bug #4)', () => {
    expect(
      resolveParamWidgetState({ boundEffectId: 106, openEffectId: 100, presetEffectIds: [106, 100], hasLiveData: true })
    ).toBe('live');
  });

  it('is live when nothing is open but the pinned block is hydrated', () => {
    expect(
      resolveParamWidgetState({ boundEffectId: 106, openEffectId: undefined, presetEffectIds: [106], hasLiveData: true })
    ).toBe('live');
  });

  it('stays readonly when in-preset but not yet hydrated (brief flash / slow link)', () => {
    expect(
      resolveParamWidgetState({ boundEffectId: 106, openEffectId: undefined, presetEffectIds: [106], hasLiveData: false })
    ).toBe('readonly');
  });

  it('reports missing over hydrated data when the block left the preset', () => {
    expect(
      resolveParamWidgetState({ boundEffectId: 999, openEffectId: undefined, presetEffectIds: [106], hasLiveData: true })
    ).toBe('missing');
  });
});

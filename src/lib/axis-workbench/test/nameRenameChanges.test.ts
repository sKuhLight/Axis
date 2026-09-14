import { describe, expect, it } from 'vitest';
import { changedNameRenames } from '../widgets/nameRenameChanges';

const base = {
  presetBaseline: 'Clean',
  presetDraft: 'Clean',
  sceneBaseline: 'Verse',
  sceneDraft: 'Verse',
  canPreset: true,
  canScene: true
};

describe('changedNameRenames', () => {
  it('returns nothing when neither name changed', () => {
    expect(changedNameRenames(base)).toEqual({});
  });

  it('returns a changed preset, trimmed', () => {
    expect(changedNameRenames({ ...base, presetDraft: '  Lead  ' })).toEqual({ preset: 'Lead' });
  });

  it('returns a changed scene, trimmed', () => {
    expect(changedNameRenames({ ...base, sceneDraft: '  Chorus  ' })).toEqual({ scene: 'Chorus' });
  });

  it('returns both when both changed', () => {
    expect(changedNameRenames({ ...base, presetDraft: 'Lead', sceneDraft: 'Chorus' })).toEqual({
      preset: 'Lead',
      scene: 'Chorus'
    });
  });

  it('treats a whitespace-only draft as unchanged', () => {
    expect(changedNameRenames({ ...base, presetDraft: 'Clean ', sceneDraft: ' Verse ' })).toEqual({});
  });

  it('rejects a blank preset name', () => {
    expect(changedNameRenames({ ...base, presetDraft: '   ' })).toEqual({});
  });

  it('allows clearing a scene name', () => {
    expect(changedNameRenames({ ...base, sceneDraft: '' })).toEqual({ scene: '' });
  });

  it('ignores a field the device cannot write', () => {
    expect(changedNameRenames({ ...base, presetDraft: 'Lead', canPreset: false })).toEqual({});
    expect(changedNameRenames({ ...base, sceneDraft: 'Chorus', canScene: false })).toEqual({});
  });
});

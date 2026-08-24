import { describe, expect, it } from 'vitest';
import {
  SCENE_NAME_MAX,
  SCENE_NAME_PLACEHOLDER,
  sceneNameDisplay,
  storedSceneName
} from '../widgets/sceneNameState';

describe('sceneNameDisplay', () => {
  it('returns the decoded name for a named slot (1-based scene number)', () => {
    expect(sceneNameDisplay(['Clean', 'Rhythm', 'Lead'], 2)).toEqual({ text: 'Rhythm', empty: false });
  });

  it('trims surrounding whitespace the device padded in', () => {
    expect(sceneNameDisplay(['  Rhythm Verse  '], 1)).toEqual({ text: 'Rhythm Verse', empty: false });
  });

  it('falls back to the rename affordance for a blank slot', () => {
    expect(sceneNameDisplay(['', 'Lead'], 1)).toEqual({ text: SCENE_NAME_PLACEHOLDER, empty: true });
  });

  it('treats a whitespace-only slot as empty', () => {
    expect(sceneNameDisplay(['   '], 1)).toEqual({ text: SCENE_NAME_PLACEHOLDER, empty: true });
  });

  it('treats a missing slot as empty (scene beyond the decoded array)', () => {
    expect(sceneNameDisplay(['Clean'], 8)).toEqual({ text: SCENE_NAME_PLACEHOLDER, empty: true });
    expect(sceneNameDisplay([], 1)).toEqual({ text: SCENE_NAME_PLACEHOLDER, empty: true });
  });

  it('never falls back to "Scene N" — that is editor.sceneName, used for the chip tooltips', () => {
    expect(sceneNameDisplay([], 3).text).not.toBe('Scene 3');
  });
});

describe('storedSceneName', () => {
  it('returns the trimmed stored name — the baseline a rename draft is diffed against', () => {
    expect(storedSceneName(['  Rhythm  '], 1)).toBe('Rhythm');
  });

  it('returns an empty string for blank or missing slots so a first rename registers as a change', () => {
    expect(storedSceneName([''], 1)).toBe('');
    expect(storedSceneName([], 4)).toBe('');
  });
});

describe('SCENE_NAME_MAX', () => {
  it('mirrors the device limit applied in editor.renameScene', () => {
    expect(SCENE_NAME_MAX).toBe(32);
  });
});

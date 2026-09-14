import { describe, it, expect, beforeEach, vi } from 'vitest';

// `*.runes.test.ts` runs in the `runes` vitest project, which compiles rune modules against the
// CLIENT svelte runtime (see vitest.config.ts) — `$state` is inert under the server runtime, so the
// propagation assertions here would be meaningless without that.

const h = vi.hoisted(() => {
  const renameScene = vi.fn(async (_n: number, _name: string) => {});
  const deviceSession = {
    canRenamePresets: true,
    canRenameScenes: true,
    preset: { number: 1, name: 'Clean' } as { number: number; name: string } | null,
    scene: 2,
    sceneCount: 8,
    sceneNames: ['Intro', 'Verse', ''],
    renameScene
  };
  return { renamePreset: vi.fn(async (_name: string) => {}), renameScene, deviceSession };
});

vi.mock('$lib/editor/editorClients.svelte', () => ({
  deviceSession: h.deviceSession,
  presetBuffer: { renamePreset: h.renamePreset }
}));

import { nameRename } from '../widgets/nameRename.svelte';

beforeEach(() => {
  nameRename.cancel();
  h.renamePreset.mockClear();
  h.renameScene.mockClear();
  h.deviceSession.canRenamePresets = true;
  h.deviceSession.canRenameScenes = true;
  h.deviceSession.preset = { number: 1, name: 'Clean' };
  h.deviceSession.scene = 2;
  h.deviceSession.sceneCount = 8;
  h.deviceSession.sceneNames = ['Intro', 'Verse', ''];
});

describe('nameRename session', () => {
  it('reports editability from the device gates', () => {
    expect(nameRename.canEditPreset).toBe(true);
    expect(nameRename.canEditScene).toBe(true);
    expect(nameRename.canEditAny).toBe(true);

    h.deviceSession.canRenamePresets = false;
    h.deviceSession.preset = null;
    expect(nameRename.canEditPreset).toBe(false);
    expect(nameRename.canEditAny).toBe(true); // scene still renameable

    h.deviceSession.canRenameScenes = false;
    expect(nameRename.canEditAny).toBe(false);
  });

  it('begin seeds both drafts from the live device and clamps the scene target', () => {
    h.deviceSession.scene = 99;
    nameRename.begin();
    expect(nameRename.active).toBe(true);
    expect(nameRename.scene).toBe(8);
    expect(nameRename.presetDraft).toBe('Clean');
    expect(nameRename.sceneDraft).toBe(''); // scene 8 is blank → clearing baseline
  });

  it('begin is a no-op when neither name is writable', () => {
    h.deviceSession.canRenamePresets = false;
    h.deviceSession.preset = null;
    h.deviceSession.canRenameScenes = false;
    nameRename.begin();
    expect(nameRename.active).toBe(false);
  });

  it('commit writes both changed names and closes', () => {
    nameRename.begin();
    nameRename.presetDraft = '  Lead  ';
    nameRename.sceneDraft = 'Chorus';
    nameRename.commit();
    expect(h.renamePreset).toHaveBeenCalledWith('Lead');
    expect(h.renameScene).toHaveBeenCalledWith(2, 'Chorus');
    expect(nameRename.active).toBe(false);
  });

  it('commit writes only the changed field', () => {
    nameRename.begin();
    nameRename.presetDraft = 'Lead';
    nameRename.commit();
    expect(h.renamePreset).toHaveBeenCalledWith('Lead');
    expect(h.renameScene).not.toHaveBeenCalled();
  });

  it('commit ignores an unchanged or blank preset', () => {
    nameRename.begin();
    nameRename.commit();
    expect(h.renamePreset).not.toHaveBeenCalled();

    nameRename.begin();
    nameRename.presetDraft = '   ';
    nameRename.commit();
    expect(h.renamePreset).not.toHaveBeenCalled();
  });

  it('commit allows clearing a scene name', () => {
    h.deviceSession.sceneNames = ['Intro', 'Verse', ''];
    h.deviceSession.scene = 2;
    nameRename.begin();
    nameRename.sceneDraft = '';
    nameRename.commit();
    expect(h.renameScene).toHaveBeenCalledWith(2, '');
  });

  it('cancel closes without writing', () => {
    nameRename.begin();
    nameRename.presetDraft = 'Lead';
    nameRename.cancel();
    expect(nameRename.active).toBe(false);
    expect(h.renamePreset).not.toHaveBeenCalled();
    expect(h.renameScene).not.toHaveBeenCalled();
  });

  it('toggle opens then closes', () => {
    nameRename.toggle();
    expect(nameRename.active).toBe(true);
    nameRename.toggle();
    expect(nameRename.active).toBe(false);
  });
});

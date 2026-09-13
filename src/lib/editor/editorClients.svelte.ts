import {
  deviceSession,
  editor,
  gridEditing,
  paramEditing,
  presetBuffer,
  telemetry
} from './editor.svelte';

export { deviceSession, gridEditing, paramEditing, presetBuffer, telemetry };

type Editor = typeof editor;

export const editorLifecycle: Pick<Editor, 'init'> = editor;

export const editorViewport: Pick<Editor, 'isMobile' | 'vw' | 'vh' | 'setViewport'> = editor;

export const editorNavigation: Pick<
  Editor,
  'inLibrary' | 'railActive' | 'drawerOpen' | 'openBuild' | 'openLibrary' | 'openVirtual'
> = editor;

export const editorOverlays: Pick<
  Editor,
  | 'axisOpen'
  | 'axisTab'
  | 'themeOpen'
  | 'paletteOpen'
  | 'paletteMode'
  | 'placeTarget'
  | 'quickBuildOpen'
  | 'presetOpen'
  | 'presetPick'
  | 'presetSearchOpen'
  | 'cabPickerOpen'
  | 'cabPickerSlot'
  | 'deviceToolsOpen'
  | 'openAxis'
  | 'openPaletteAt'
  | 'openRetype'
  | 'openCabPicker'
  | 'openSlotPicker'
> = editor;

export const editorNotifications: Pick<Editor, 'toast' | 'showToast'> = editor;

export const editorUpdates: Pick<
  Editor,
  'update' | 'autoUpdate' | 'dismissUpdate' | 'downloadUpdate' | 'installUpdate'
> = editor;

export const editorOnboarding: Pick<
  Editor,
  | 'kofiNoticeOpen'
  | 'tourActive'
  | 'tourStep'
  | 'dismissKofiNotice'
  | 'startTour'
  | 'tourNext'
  | 'tourPrev'
  | 'endTour'
> = editor;

export const editorProfile: Pick<Editor, 'contact' | 'setContact'> = editor;

export const editorHints: Pick<Editor, 'hint' | 'setHint' | 'clearHint'> = editor;

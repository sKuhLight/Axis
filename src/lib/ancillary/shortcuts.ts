/**
 * The keyboard-shortcut cheat sheet, in one place so the `?` help modal can never drift
 * from what the app actually binds.
 *
 * Keys are rendered as chips. `Mod` is a platform token — the modal shows ⌘ on macOS and
 * `Ctrl` elsewhere — because every global binding accepts both (`metaKey || ctrlKey`).
 */

export interface ShortcutSpec {
  /** Key tokens, in press order. `Mod` is the platform command/control key. */
  keys: string[];
  label: string;
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutSpec[];
}

/** Every token a shortcut may use — a typo'd token fails `shortcuts.test.ts`. */
export const SHORTCUT_TOKENS = new Set([
  '?',
  'Esc',
  'Mod',
  'Shift',
  'Z',
  'Space',
  'Backspace',
  'T',
  'B',
  'Q',
  'P',
  '/',
  'H'
]);

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Essentials',
    items: [
      { keys: ['?'], label: 'Show this shortcut list' },
      { keys: ['Esc'], label: 'Close the top dialog or overlay' }
    ]
  },
  {
    title: 'Editing',
    items: [
      { keys: ['Mod', 'Z'], label: 'Undo' },
      { keys: ['Mod', 'Shift', 'Z'], label: 'Redo' },
      { keys: ['Space'], label: 'Bypass the selected block' },
      { keys: ['Backspace'], label: 'Remove the hovered or selected block' }
    ]
  },
  {
    title: 'Tools',
    items: [
      { keys: ['T'], label: 'Tuner' },
      { keys: ['B'], label: 'Tap tempo' },
      { keys: ['Q'], label: 'Quick Build' },
      { keys: ['/'], label: 'Find a block control' },
      { keys: ['P'], label: 'Search presets' },
      { keys: ['H'], label: 'Show or hide block names on the grid map' }
    ]
  }
];

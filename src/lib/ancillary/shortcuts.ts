/**
 * The keyboard-shortcut cheat sheet, in one place so the `?` help modal can never drift
 * from what the app actually binds.
 *
 * Keys are rendered as chips. `Mod` is a platform token — the modal shows ⌘ on macOS and
 * `Ctrl` elsewhere — because every global binding accepts both (`metaKey || ctrlKey`).
 */

/**
 * Where a shortcut works: `grid` only while the Grid page is active, `global` (the default)
 * anywhere. Device-gated shortcuts additionally list the capability they need, and the cheat
 * sheet filters on both so it never advertises a key that would do nothing right now.
 */
export type ShortcutScope = 'global' | 'grid' | 'presetBrowser';
export type ShortcutRequires = 'tuner' | 'tempo';

export interface ShortcutSpec {
  /** Key tokens, in press order. `Mod` is the platform command/control key. */
  keys: string[];
  label: string;
  /** Defaults to `global`. */
  scope?: ShortcutScope;
  /** Device capability this key needs; omit when it needs none. */
  requires?: ShortcutRequires;
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
  'H',
  'M'
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
      { keys: ['Mod', 'Z'], label: 'Undo', scope: 'grid' },
      { keys: ['Mod', 'Shift', 'Z'], label: 'Redo', scope: 'grid' },
      { keys: ['Space'], label: 'Bypass the selected block', scope: 'grid' },
      { keys: ['Backspace'], label: 'Remove the hovered or selected block', scope: 'grid' }
    ]
  },
  {
    title: 'Preset Browser',
    items: [
      { keys: ['M'], label: 'Move presets to another location', scope: 'presetBrowser' }
    ]
  },
  {
    title: 'Tools',
    items: [
      { keys: ['T'], label: 'Tuner', requires: 'tuner' },
      { keys: ['B'], label: 'Tap tempo', scope: 'grid', requires: 'tempo' },
      { keys: ['Q'], label: 'Quick Build', scope: 'grid' },
      { keys: ['/'], label: 'Find a block control', scope: 'grid' },
      { keys: ['P'], label: 'Search presets', scope: 'grid' },
      { keys: ['H'], label: 'Show or hide block names on the grid map', scope: 'grid' }
    ]
  }
];

/** The live context the cheat sheet filters against. */
export interface ShortcutAvailabilityContext {
  gridActive: boolean;
  /** The Preset Browser page is the active page (its `M` move shortcut is page-scoped). */
  presetBrowserActive: boolean;
  hasTuner: boolean;
  hasTempo: boolean;
}

/** True when `item` can actually fire in `context`. */
export function shortcutAvailable(item: ShortcutSpec, context: ShortcutAvailabilityContext): boolean {
  const scope = item.scope ?? 'global';
  if (scope === 'grid' && !context.gridActive) return false;
  if (scope === 'presetBrowser' && !context.presetBrowserActive) return false;
  if (item.requires === 'tuner' && !context.hasTuner) return false;
  if (item.requires === 'tempo' && !context.hasTempo) return false;
  return true;
}

/**
 * The catalog narrowed to what works right now — items filtered per context, and any group
 * left with no available items dropped so the sheet never shows an empty section.
 */
export function visibleShortcutGroups(context: ShortcutAvailabilityContext): ShortcutGroup[] {
  return SHORTCUT_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => shortcutAvailable(item, context))
  })).filter((group) => group.items.length > 0);
}

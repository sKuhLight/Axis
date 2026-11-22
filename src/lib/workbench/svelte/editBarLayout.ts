/**
 * Edit bar overflow logic (pure, unit-tested).
 *
 * The edit bar is ONE row across the full window. When the estimated content is
 * wider than the bar, groups collapse progressively — never wrap on desktop —
 * and every collapsed group stays reachable through the "⋯ More" menu. Widths are
 * estimates from the type scale (labels × a per-character width), calibrated
 * against measured renders of the bar's fonts (12px UI labels, 10px mono keys);
 * the component measures only the bar's own width.
 *
 * Collapse order (first collapses first): the status text, the CUSTOMIZE tag,
 * the profile control → its dropdown form, Add, the profile dropdown, Layout,
 * Page. History (Undo/Redo) and Done never collapse.
 */

/** Groups the bar renders, in bar order. */
export type EditBarGroupId = 'tag' | 'hist' | 'page' | 'layout' | 'profile' | 'add';

/** Groups that can collapse into the ⋯ More menu. */
export type EditBarOverflowGroupId = 'page' | 'layout' | 'profile' | 'add';

/** The More menu lists collapsed groups in scope order: page · layout · profile · add. */
export const EDIT_BAR_OVERFLOW_ORDER: readonly EditBarOverflowGroupId[] = ['page', 'layout', 'profile', 'add'];

/**
 * One collapse step each: `status` hides the status text, `profile~` swaps the
 * profile control for its dropdown form, any other id hides that group.
 */
export type EditBarCollapseStep = 'status' | 'tag' | 'profile~' | 'add' | 'profile' | 'layout' | 'page';
export const EDIT_BAR_COLLAPSE_STEPS: readonly EditBarCollapseStep[] = [
  'status',
  'tag',
  'profile~',
  'add',
  'profile',
  'layout',
  'page'
];

/**
 * At or below this window width the bar switches to touch presentation — the
 * Axis phone breakpoint, matching the shell's `isPhone` and its
 * `(max-width: 760px)` CSS.
 */
export const EDIT_BAR_TOUCH_BREAKPOINT = 760;
/** Control height: 28px on desktop, 44px touch targets on a narrow window. */
export const EDIT_BAR_CONTROL_HEIGHT = 28;
export const EDIT_BAR_TOUCH_CONTROL_HEIGHT = 44;
/** Between two visible groups: gap + 1px separator + gap. */
export const EDIT_BAR_GROUP_GAP = 13;
/** Flex gap between the bar's direct children. */
export const EDIT_BAR_ITEM_GAP = 6;
/** Dropdown triggers cap their width (CSS max-width) and ellipsize the value. */
export const EDIT_BAR_DROPDOWN_MAX = 220;
/** Space reserved for the status text before it is worth showing (it ellipsizes). */
export const EDIT_BAR_STATUS_RESERVE = 240;
/** The error chip never grows past this (it ellipsizes). */
export const EDIT_BAR_ERROR_MAX = 340;

export function editBarIsTouch(windowWidth: number): boolean {
  return windowWidth <= EDIT_BAR_TOUCH_BREAKPOINT;
}

export function editBarControlHeight(touch: boolean): number {
  return touch ? EDIT_BAR_TOUCH_CONTROL_HEIGHT : EDIT_BAR_CONTROL_HEIGHT;
}

/** Character-count width estimate. */
export function estimateTextWidth(text: string | null | undefined, perChar: number): number {
  return String(text ?? '').length * perChar;
}

/** A `KEY value ▾` dropdown trigger (padding + key + value + chevron [+ icon]). */
export function estimateDropdownWidth(key: string, value: string, options: { icon?: boolean } = {}): number {
  const width =
    22 +
    (key ? estimateTextWidth(key, 6.2) + 6 : 0) +
    estimateTextWidth(value, 7.0) +
    18 +
    (options.icon ? 20 : 0);
  return Math.min(EDIT_BAR_DROPDOWN_MAX, width);
}

/** A labelled text button. */
export function estimateButtonWidth(label: string): number {
  return 38 + estimateTextWidth(label, 6.6);
}

/** A segmented control: text segments by label, icon segments as square-ish cells. */
export function estimateSegmentWidth(segments: ReadonlyArray<{ label: string; icon: boolean }>, touch: boolean): number {
  const cell = editBarControlHeight(touch) - 4;
  const inner = segments.reduce((sum, seg) => sum + (seg.icon ? cell : 16 + estimateTextWidth(seg.label, 6.0)), 0);
  return 6 + inner + 2 * Math.max(0, segments.length - 1);
}

/** The CUSTOMIZE mode tag (pulse dot + mono label). */
export function estimateTagWidth(label = 'CUSTOMIZE'): number {
  return 22 + estimateTextWidth(label, 6.6) + 12;
}

/** Undo + Redo icon buttons. */
export function estimateHistoryWidth(touch: boolean): number {
  return 2 * editBarControlHeight(touch) + EDIT_BAR_ITEM_GAP;
}

/** The status text's reserved width (capped: it ellipsizes when longer). */
export function estimateStatusWidth(text: string): number {
  return Math.min(EDIT_BAR_STATUS_RESERVE, estimateTextWidth(text, 6.4));
}

/** The error chip: dot + message + dismiss button (capped, ellipsizes). */
export function estimateErrorWidth(message: string): number {
  return Math.min(EDIT_BAR_ERROR_MAX, 64 + estimateTextWidth(message, 6.7));
}

/** The accent Done button (check icon + label). */
export function estimateDoneWidth(touch: boolean): number {
  return touch ? 86 : 72;
}

/** The ⋯ More icon button. */
export function estimateMoreWidth(touch: boolean): number {
  return editBarControlHeight(touch);
}

export interface EditBarGroupEstimate {
  id: EditBarGroupId;
  width: number;
  /** Width of the alternate (dropdown) form, for groups that have one (profile). */
  altWidth?: number;
}

export interface EditBarEstimateInput {
  touch: boolean;
  pageLabel: string;
  layoutLabel: string;
  /** Omit when the host supplies no profile control. */
  profile?: {
    label: string;
    options: ReadonlyArray<{ label: string; icon: boolean }>;
  } | null;
}

/** Estimated widths of every group the bar would render, in bar order. */
export function estimateEditBarGroups(input: EditBarEstimateInput): EditBarGroupEstimate[] {
  const groups: EditBarGroupEstimate[] = [
    { id: 'tag', width: estimateTagWidth() },
    { id: 'hist', width: estimateHistoryWidth(input.touch) },
    { id: 'page', width: estimateDropdownWidth('Page', input.pageLabel) },
    { id: 'layout', width: estimateDropdownWidth('Layout', input.layoutLabel, { icon: true }) }
  ];
  if (input.profile) {
    groups.push({
      id: 'profile',
      width: estimateSegmentWidth(input.profile.options, input.touch),
      altWidth: estimateDropdownWidth('Profile', input.profile.label, { icon: true })
    });
  }
  groups.push({ id: 'add', width: estimateDropdownWidth('', 'Add', { icon: true }) });
  return groups;
}

export interface EditBarLayoutInput {
  /** The bar's content width (bar width minus its horizontal padding). */
  available: number;
  touch: boolean;
  /** Present groups in bar order (see {@link estimateEditBarGroups}). */
  groups: ReadonlyArray<EditBarGroupEstimate>;
  /** Reserved width of the status text when it shows. */
  statusWidth: number;
  /**
   * Width of the error chip; > 0 means an error shows (it suppresses the status
   * text). On touch the chip wraps onto its own second row, so it never counts
   * against the single-row budget there.
   */
  errorWidth?: number;
  /** Extra width measured as overflow after render (self-correction for estimate drift). */
  slack?: number;
}

export interface EditBarLayoutResult {
  /** Hidden groups, in the order they collapsed. */
  hidden: EditBarGroupId[];
  /** Groups rendered in their alternate (dropdown) form. */
  alt: EditBarGroupId[];
  showStatus: boolean;
  /** Collapsed groups the More menu lists, in scope order. */
  overflow: EditBarOverflowGroupId[];
  /** True when the ⋯ More button renders (some menu group collapsed). */
  showMore: boolean;
  /** The final estimated content width. */
  width: number;
}

function isOverflowGroup(id: EditBarGroupId): id is EditBarOverflowGroupId {
  return (EDIT_BAR_OVERFLOW_ORDER as readonly string[]).includes(id);
}

/**
 * Decide which groups show, which collapse into More, and whether the status
 * text fits. Walks {@link EDIT_BAR_COLLAPSE_STEPS} while the estimated total
 * exceeds the available width; a step for a group the bar does not have is a
 * no-op. History and Done are never hidden.
 */
export function resolveEditBarLayout(input: EditBarLayoutInput): EditBarLayoutResult {
  const hidden = new Set<EditBarGroupId>();
  const alt = new Set<EditBarGroupId>();
  const present = new Set(input.groups.map((group) => group.id));
  const hasError = (input.errorWidth ?? 0) > 0;
  // Touch: the chip takes the second row (CSS), outside the first row's budget.
  const errorWidth = hasError && !input.touch ? input.errorWidth ?? 0 : 0;
  let showStatus = !hasError;

  const total = (): number => {
    let width = 0;
    let visible = 0;
    for (const group of input.groups) {
      if (hidden.has(group.id)) continue;
      width += (alt.has(group.id) ? group.altWidth ?? group.width : group.width) + (visible ? EDIT_BAR_GROUP_GAP : 0);
      visible += 1;
    }
    const more = [...hidden].some(isOverflowGroup);
    width += EDIT_BAR_ITEM_GAP; // before the flexible spacer
    if (showStatus) width += EDIT_BAR_ITEM_GAP + input.statusWidth;
    if (errorWidth > 0) width += EDIT_BAR_ITEM_GAP + errorWidth;
    if (more) width += EDIT_BAR_ITEM_GAP + estimateMoreWidth(input.touch);
    width += EDIT_BAR_ITEM_GAP + estimateDoneWidth(input.touch);
    return width + Math.max(0, input.slack ?? 0);
  };

  for (const step of EDIT_BAR_COLLAPSE_STEPS) {
    if (total() <= input.available) break;
    if (step === 'status') {
      showStatus = false;
    } else if (step === 'profile~') {
      const profile = input.groups.find((group) => group.id === 'profile');
      if (profile?.altWidth !== undefined) alt.add('profile');
    } else if (present.has(step)) {
      hidden.add(step);
      alt.delete(step);
    }
  }

  const overflow = EDIT_BAR_OVERFLOW_ORDER.filter((id) => hidden.has(id));
  return {
    hidden: [...hidden],
    alt: [...alt],
    showStatus,
    overflow,
    showMore: overflow.length > 0,
    width: total()
  };
}

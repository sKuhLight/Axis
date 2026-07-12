import { selectActiveProfile } from './selectors';
import type { WorkbenchDocument, WorkbenchProfile } from './schema';

/** Viewport class the resolver reasons about — mirrors the design's device profiles. */
export type ViewportClass = 'desktop' | 'tablet' | 'phone';

/**
 * Breakpoint thresholds (px, `width < threshold` picks the class).
 *
 * Rationale / provenance:
 * - `phone` at `< 760`: the Workbench shell's mobile gate — `WorkbenchHost.svelte`
 *   switches to overlay-drawer / hamburger chrome at `max-width: 760px`, and the
 *   design's `computeDock()` mobile overlay path keys off the mobile profile
 *   (`01-shell.md` §2.1). Keeping the resolver's phone boundary equal to the
 *   CSS gate means the profile and the chrome flip together.
 * - `tablet` at `< 1366`: the old Axis shell's `editor.isMobile` boundary
 *   (`<1366`) — the plan's open question #8 marks 761–1365 as the tablet band.
 * - `desktop` at `>= 1366`.
 *
 * Boundaries are `<` (exclusive) so 760 is tablet and 1366 is desktop.
 */
export const VIEWPORT_BREAKPOINTS = {
  /** width strictly below this → 'phone'. */
  phone: 760,
  /** width strictly below this (and >= phone) → 'tablet'; at/above → 'desktop'. */
  tablet: 1366
} as const;

/** Map a viewport width (px) to a device class using {@link VIEWPORT_BREAKPOINTS}. */
export function classifyViewportWidth(width: number): ViewportClass {
  if (!(width > 0) || width < VIEWPORT_BREAKPOINTS.phone) return 'phone';
  if (width < VIEWPORT_BREAKPOINTS.tablet) return 'tablet';
  return 'desktop';
}

/** A device-preview frame size (px) — the in-window canvas a profile edits inside. */
export interface PreviewFrameSize {
  width: number;
  height: number;
  /** Corner radius for the letterboxed device frame (mobile is more rounded). */
  radius: number;
}

/**
 * Real editing-surface size for a device-preview frame, mirroring the design's
 * constrained "frame" canvas (Axis Layout System.dc.html `frameStyle`): tablet is
 * a 1024×760 device canvas, mobile a 400×820 phone canvas, both centered and
 * letterboxed on a dark backdrop. Desktop returns `null` (full-window, no frame).
 *
 * The frame is a REAL smaller viewport — never a CSS transform/scale — so pointer
 * coordinates stay 1:1 and the drag/menu de-zoom calibration (DragLayer) is
 * unaffected (the round-13 de-zoom bug class only bites under an ancestor scale).
 */
export function previewFrameForClass(cls: ViewportClass): PreviewFrameSize | null {
  if (cls === 'tablet') return { width: 1024, height: 760, radius: 18 };
  if (cls === 'phone') return { width: 400, height: 820, radius: 28 };
  return null;
}

/**
 * A profile's declared breakpoint, defaulting to 'desktop' when unset (matches the
 * schema's documented default: `WorkbenchProfile.breakpoint` is
 * `'desktop' | 'tablet' | 'phone'` and desktop is the implicit baseline).
 */
function profileClass(profile: WorkbenchProfile): ViewportClass {
  return profile.breakpoint ?? 'desktop';
}

export interface ResolveProfileOptions {
  /** Content/window width in px used to classify the viewport. */
  width: number;
  /**
   * Explicit user profile choice. When it names an existing profile it always
   * wins over viewport resolution. `null`/`undefined`/dangling ids are ignored.
   */
  userOverride?: string | null;
}

/**
 * Pure profile resolver: pick the id of the profile that best matches the current
 * viewport, honouring an explicit user override.
 *
 * Order of precedence:
 * 1. **User override** — if it names an existing profile, return it verbatim.
 * 2. **Exact class match** — a profile whose `breakpoint` equals the viewport class.
 * 3. **Fallback** — the document's current active profile (never mutate on a miss),
 *    so an unmatched class (e.g. no tablet profile) leaves the layout untouched.
 *
 * The resolver never reads or writes layouts — it only chooses a profile id. It is
 * deterministic and side-effect free; the svelte layer decides whether the chosen
 * id differs from `activeProfileId` and, if so, dispatches `profile.activate`.
 */
export function resolveProfileForViewport(
  doc: WorkbenchDocument,
  options: ResolveProfileOptions
): string {
  const override = options.userOverride;
  if (override && doc.profiles[override]) return override;

  const target = classifyViewportWidth(options.width);
  const profiles = Object.values(doc.profiles);

  // Prefer an exact class match. When several profiles share a class, keep the
  // first in declaration order for determinism (Object.values preserves it).
  const exact = profiles.find((profile) => profileClass(profile) === target);
  if (exact) return exact.id;

  // No profile owns this class — hold the current profile so resize never mutates
  // a layout the user is on. Fall back to any profile id if the active one is gone.
  if (doc.profiles[doc.activeProfileId]) return doc.activeProfileId;
  return profiles[0]?.id ?? doc.activeProfileId;
}

/** Read the persisted, still-valid user override profile id (or undefined). */
export function selectProfileOverride(doc: WorkbenchDocument): string | undefined {
  const id = doc.profileOverrideId;
  return id && doc.profiles[id] ? id : undefined;
}

function uniqueProfileId(base: string, doc: WorkbenchDocument): string {
  if (!doc.profiles[base]) return base;
  for (let index = 1; ; index += 1) {
    const id = `${base}.copy${index}`;
    if (!doc.profiles[id]) return id;
  }
}

export function isProfileReferenced(doc: WorkbenchDocument, profileId: string): boolean {
  return doc.activeProfileId === profileId;
}

export function isLastProfile(doc: WorkbenchDocument): boolean {
  return Object.keys(doc.profiles).length <= 1;
}

export function canDeleteProfile(doc: WorkbenchDocument, profileId: string): boolean {
  return !!doc.profiles[profileId] && !isLastProfile(doc) && !isProfileReferenced(doc, profileId);
}

export function createProfileSnapshot(
  doc: WorkbenchDocument,
  options: {
    id?: string;
    label?: string;
    layoutId?: string;
    breakpoint?: WorkbenchProfile['breakpoint'];
    deviceClass?: string;
  } = {}
): WorkbenchProfile | null {
  const active = selectActiveProfile(doc);
  if (!active) return null;
  const id = uniqueProfileId(options.id ?? active.id, doc);
  return {
    ...active,
    id,
    label: options.label ?? `${active.label} Copy`,
    layoutId: options.layoutId ?? active.layoutId,
    breakpoint: options.breakpoint ?? active.breakpoint,
    deviceClass: options.deviceClass ?? active.deviceClass,
    state: active.state ? JSON.parse(JSON.stringify(active.state)) as WorkbenchProfile['state'] : undefined
  };
}

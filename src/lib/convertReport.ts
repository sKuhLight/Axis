// Pure logic for the cross-device preset-converter diff report (P4a · META-24 · AXIS-47/48).
// Everything here is framework-free and unit-tested: severity mapping, human-readable event
// formatting (all 11 ConversionEvent kinds), free-text + severity filtering, severity/kind grouping,
// the target-device roster + display names, connected-device detection, the convert-flow state
// reducers (so the runes store stays a thin shell), and error-message mapping. The `.svelte.ts` store
// and the report components consume these — no logic lives in the components.

import type {
  ConversionEvent,
  ConversionEventKind,
  ConverterDeviceId,
  ConvertResponse
} from './types';

// ── target devices ────────────────────────────────────────────────────────────────────────────────

/** The seven convertible targets, in a stable display order (gen-3 flagships first). */
export const CONVERTER_DEVICES: ConverterDeviceId[] = [
  'axe-fx-iii',
  'fm9',
  'fm3',
  'vp4',
  'am4',
  'axe-fx-ii',
  'axe-fx-gen1'
];

/** Human display name for each target id. */
export const DEVICE_NAMES: Record<ConverterDeviceId, string> = {
  'axe-fx-iii': 'Axe-Fx III',
  fm9: 'FM9',
  fm3: 'FM3',
  vp4: 'VP4',
  am4: 'AM4',
  'axe-fx-ii': 'Axe-Fx II',
  'axe-fx-gen1': 'Axe-Fx (Gen 1)'
};

export const deviceName = (id: ConverterDeviceId): string => DEVICE_NAMES[id] ?? id;

/** Map the connected unit's Fractal model byte (from GET /device/detect) to a converter target id, so
 *  the picker can flag "this is your connected device". Null for an unknown/unsupported model. */
export function deviceIdFromModel(modelId: number | null | undefined): ConverterDeviceId | null {
  switch (modelId) {
    case 0x10:
      return 'axe-fx-iii';
    case 0x11:
      return 'fm3';
    case 0x12:
      return 'fm9';
    case 0x14:
      return 'vp4';
    case 0x15:
      return 'am4';
    // gen-2 family (Axe-Fx II and variants) → the converter's single gen-2 target
    case 0x03:
    case 0x06:
    case 0x07:
      return 'axe-fx-ii';
    // gen-1 family
    case 0x00:
    case 0x01:
      return 'axe-fx-gen1';
    default:
      return null;
  }
}

// ── severity ──────────────────────────────────────────────────────────────────────────────────────

export type Severity = 'info' | 'warn' | 'loss';

/** Display order: losses first (most consequential), then warnings, then info. */
export const SEVERITY_ORDER: Severity[] = ['loss', 'warn', 'info'];

/** Derive a severity from a raw event, per the wire-contract mapping. */
export function eventSeverity(e: ConversionEvent): Severity {
  switch (e.kind) {
    case 'block-dropped':
    case 'block-unplaced':
    case 'param-dropped':
    case 'scene-collapsed':
    case 'channel-collapsed':
      return 'loss';
    case 'source-partial':
    case 'type-unresolved':
    case 'param-clamped':
    case 'routing-simplified':
      return 'warn';
    case 'type-substituted':
      return e.confidence === 'exact' || e.confidence === 'lineage' ? 'info' : 'warn';
    case 'param-unverified':
    case 'block-merged':
      return 'info';
    default:
      return 'info';
  }
}

// ── block-key accessor (for click-to-focus) ─────────────────────────────────────────────────────────

/** The single block a row focuses, or undefined for preset-wide events (source-partial,
 *  routing-simplified, scene-collapsed) that don't point at one block. */
export function eventBlockKey(e: ConversionEvent): string | undefined {
  return 'blockKey' in e ? e.blockKey : undefined;
}

// ── formatting ───────────────────────────────────────────────────────────────────────────────────

/** Title-case a family slug for display ("amp" → "Amp", "multi_delay" → "Multi Delay"). */
export function familyLabel(family: string): string {
  const s = (family ?? '').trim();
  if (!s) return 'Block';
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** A rendered event row: a one-line `title`, an optional `detail`, its severity, and the block it
 *  focuses (if any). `title`/`detail` are human English — no device jargon leaks through raw. */
export interface FormattedEvent {
  title: string;
  detail?: string;
  severity: Severity;
  blockKey?: string;
  kind: ConversionEventKind;
}

const confidenceWord: Record<'exact' | 'lineage' | 'fuzzy' | 'fallback', string> = {
  exact: 'exact match',
  lineage: 'lineage match',
  fuzzy: 'fuzzy match',
  fallback: 'fallback'
};

/** Turn a raw ConversionEvent into a display row. Covers all 11 kinds. */
export function formatEvent(e: ConversionEvent): FormattedEvent {
  const base = { severity: eventSeverity(e), blockKey: eventBlockKey(e), kind: e.kind };
  switch (e.kind) {
    case 'source-partial':
      return { ...base, title: `Source decoded partially (${e.decodeDepth})`, detail: e.detail };
    case 'block-dropped': {
      const why =
        e.reason === 'family-missing'
          ? 'not available on the target device'
          : e.reason === 'capacity-exceeded'
            ? 'the target ran out of slots for this block'
            : 'exceeds the target’s instance limit';
      return { ...base, title: `${familyLabel(e.family)} block dropped`, detail: why };
    }
    case 'block-unplaced':
      return { ...base, title: `${familyLabel(e.family)} block not placed`, detail: `Converted but left off the grid — ${e.reason}` };
    case 'type-substituted': {
      const conf = confidenceWord[e.confidence];
      const score = e.score != null ? `, score ${e.score}` : '';
      return {
        ...base,
        title: `${familyLabel(e.family)} ‘${e.sourceTypeName}’ → ‘${e.targetTypeName}’`,
        detail: `${conf}${score}`
      };
    }
    case 'type-unresolved':
      return { ...base, title: `${familyLabel(e.family)} ‘${e.sourceTypeName}’ has no match`, detail: 'Kept the target’s default type' };
    case 'param-clamped': {
      const range =
        e.targetMin != null && e.targetMax != null ? ` (target range ${e.targetMin}–${e.targetMax})` : '';
      return { ...base, title: `${e.nativeName} clamped`, detail: `${e.sourceValue} → ${e.targetValue}${range}` };
    }
    case 'param-dropped': {
      const why = e.reason === 'no-concept-mapping' ? 'no equivalent on the target' : 'target block lacks this parameter';
      return { ...base, title: `${e.nativeName} dropped`, detail: why };
    }
    case 'param-unverified':
      return { ...base, title: `${e.nativeName} carried over unverified`, detail: `value ${e.value}` };
    case 'block-merged':
      // the source cab has no standalone block on the target — it folds into the host (amp). Focus the
      // host block (it exists on the grid), not the removed source block.
      return {
        ...base,
        blockKey: e.intoBlockKey ?? base.blockKey,
        title: `${familyLabel(e.family)} folded into the ${familyLabel(e.intoFamily)} block`,
        detail: `The target’s ${familyLabel(e.intoFamily)} block includes the ${familyLabel(e.family)} — merged in, not dropped`
      };
    case 'routing-simplified':
      return { ...base, title: 'Routing simplified', detail: e.detail };
    case 'scene-collapsed':
      return { ...base, title: 'Scenes collapsed', detail: `${e.sourceScenes} → ${e.targetScenes} scenes` };
    case 'channel-collapsed':
      return { ...base, title: 'Channels collapsed', detail: `${e.sourceChannels} → ${e.targetChannels} channels` };
    default: {
      // Exhaustiveness guard: a new kind added to the union without a case here fails typecheck.
      const _never: never = e;
      return { title: 'Unknown conversion event', severity: 'info', kind: (_never as ConversionEvent).kind };
    }
  }
}

// ── filtering ────────────────────────────────────────────────────────────────────────────────────

export interface EventFilter {
  /** Which severities to include. Empty set = include all (no severity filter active). */
  severities?: Set<Severity>;
  /** Case-insensitive free-text match over the formatted title + detail + family + block key. */
  text?: string;
}

/** Apply a severity + free-text filter. Preserves input order. */
export function filterEvents(events: ConversionEvent[], filter: EventFilter = {}): ConversionEvent[] {
  const sev = filter.severities;
  const q = (filter.text ?? '').trim().toLowerCase();
  return events.filter((e) => {
    if (sev && sev.size > 0 && !sev.has(eventSeverity(e))) return false;
    if (!q) return true;
    const f = formatEvent(e);
    const hay = [f.title, f.detail ?? '', 'family' in e ? e.family : '', eventBlockKey(e) ?? '']
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

// ── grouping ─────────────────────────────────────────────────────────────────────────────────────

/** Events of one kind within a severity band. */
export interface KindGroup {
  kind: ConversionEventKind;
  events: ConversionEvent[];
}
/** All events at one severity, sub-grouped by kind. */
export interface SeverityGroup {
  severity: Severity;
  count: number;
  kinds: KindGroup[];
}

/** Group by severity (loss → warn → info), then by kind within each. Empty bands are omitted; kind
 *  order within a band follows first appearance in the input. */
export function groupEvents(events: ConversionEvent[]): SeverityGroup[] {
  const out: SeverityGroup[] = [];
  for (const severity of SEVERITY_ORDER) {
    const inBand = events.filter((e) => eventSeverity(e) === severity);
    if (inBand.length === 0) continue;
    const kinds: KindGroup[] = [];
    const byKind = new Map<ConversionEventKind, ConversionEvent[]>();
    for (const e of inBand) {
      const arr = byKind.get(e.kind);
      if (arr) arr.push(e);
      else {
        const created = [e];
        byKind.set(e.kind, created);
        kinds.push({ kind: e.kind, events: created });
      }
    }
    out.push({ severity, count: inBand.length, kinds });
  }
  return out;
}

/** Recompute the summary tally from a raw event list (for a client-side cross-check of the server's
 *  summary, or when filtering). */
export function summarize(events: ConversionEvent[]): { total: number; info: number; warn: number; loss: number } {
  const s = { total: events.length, info: 0, warn: 0, loss: 0 };
  for (const e of events) s[eventSeverity(e)]++;
  return s;
}

// ── convert-flow state (pure reducers; the runes store applies these) ────────────────────────────────

/** What was asked of the converter — surfaced in the report header + used to re-run. */
export interface ConvertRequestInfo {
  targetDevice: ConverterDeviceId;
  /** True when converting an imported file rather than the connected device's current preset. */
  hasSource: boolean;
  /** Display name of the imported source file, when `hasSource`. */
  sourceName?: string;
}

export interface ConvertState {
  status: 'idle' | 'running' | 'error';
  result?: ConvertResponse;
  error?: string;
  lastRequest?: ConvertRequestInfo;
}

export const initialConvertState: ConvertState = { status: 'idle' };

/** Enter the running state for a fresh request (clears any prior result/error). */
export function beginConvert(req: ConvertRequestInfo): ConvertState {
  return { status: 'running', lastRequest: req };
}

/** Record a successful conversion. Per the P4b seam contract, success returns to `idle` with `result`
 *  populated (result presence — not a distinct status — signals "a report is ready"). */
export function succeedConvert(state: ConvertState, result: ConvertResponse): ConvertState {
  return { status: 'idle', lastRequest: state.lastRequest, result, error: undefined };
}

/** Record a failure. */
export function failConvert(state: ConvertState, error: string): ConvertState {
  return { status: 'error', lastRequest: state.lastRequest, result: undefined, error };
}

/** Human error copy for the failure banner. 501 and 400 get specific wording (per deliverable). */
export function convertErrorMessage(status: number, fallback?: string): string {
  if (status === 501) return 'The connected device can’t provide a preset to convert. Import a .syx file instead.';
  if (status === 400) return fallback || 'The conversion request was invalid.';
  if (status === 0) return 'Couldn’t reach the ForgeFX engine. Is it running?';
  return fallback || `Conversion failed (error ${status}).`;
}

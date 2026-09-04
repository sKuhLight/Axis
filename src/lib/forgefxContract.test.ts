// Contract test (plan Phase 2): `types.ts` is a HAND-MIRRORED copy of ForgeFX's HTTP DTOs — no
// codegen, no OpenAPI (see src/lib/CLAUDE.md). A server-side shape change not reflected here
// typechecks green and fails only at runtime, because TS structural typing accepts any object with
// compatible optional fields. This test closes that gap with a RUNTIME check: real
// `GET /preset/blocks/:eid/params` fixtures (see fixtures/blockParams/README.md for provenance),
// parsed against a Zod schema that mirrors the widened NamedParam/EnumParam/DeviceLayout contract
// (Phase 1.1/1.2/1.4/1.5) — a `.parse()` failure here means Axis's types have drifted from what
// ForgeFX actually serves.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import ampFixture from './fixtures/blockParams/amp.json';
import cabFixture from './fixtures/blockParams/cab.json';
import reverbFixture from './fixtures/blockParams/reverb.json';
import type { BlockParams } from './types';

const fwRangeSchema = z.object({ gtet: z.string().optional(), lt: z.string().optional() });

const widgetBoundsSchema = z.object({ w: z.number(), h: z.number() });

const renderMetaSchema = z.object({
  sectionSpan: z.object({ cols: z.number().optional(), pixels: z.number().optional() }).optional(),
  minDb: z.number().optional(),
  maxDb: z.number().optional(),
  separatorHeight: z.number().optional(),
  controllingParamName: z.string().optional(),
  controllingParamValue: z.string().optional(),
  secondaryParameterName: z.string().optional(),
  parameterOffset: z.number().optional(),
  lock: z.string().optional(),
  graphIndex: z.string().optional(),
  graphOScope: z.boolean().optional(),
  graphMarkerX: z.string().optional(),
  dynamicParamInfo: z.boolean().optional(),
  dynamicParamId: z.boolean().optional(),
  knobDirection: z.string().optional(),
  disabledText: z.string().optional(),
  ctrlLabelColor: z.string().optional(),
  markerColor: z.string().optional(),
  useMarker: z.boolean().optional(),
  message: z.string().optional()
});

const pageLayoutSchema = z.object({
  name: z.string(),
  parametersX: z.number().optional(),
  parametersY: z.number().optional(),
  parametersSpacingX: z.number().optional(),
  parametersSpacingY: z.number().optional(),
  mixerX: z.number().optional(),
  mixerY: z.number().optional(),
  mixerSpacingX: z.number().optional(),
  mixerSpacingY: z.number().optional(),
  btnBypassPosition: z.string().optional(),
  btnIgnoreScenePosition: z.string().optional(),
  btnKillDryPosition: z.string().optional()
});

// Fields ADDITIVE to a param beyond the original value/norm/unit/min/max/log (ForgeFX Phase 1.1/1.2/1.5).
const paramMetaSchema = z.object({
  paramName: z.string().optional(),
  family: z.string().optional(),
  step: z.number().optional(),
  default: z.number().optional(),
  taper: z.enum(['linear', 'log', 'flat', 'custom']).optional(),
  taperPoints: z.array(z.tuple([z.number(), z.number()])).optional(),
  unitCode: z.string().optional(),
  kind: z.enum(['enum', 'float']).optional(),
  unusable: z.enum(['no-range', 'degenerate-range', 'duplicate-id']).optional(),
  help: z.object({ blurb: z.string(), tip: z.string().optional() }).optional()
});

const namedParamSchema = paramMetaSchema.extend({
  id: z.number().optional(),
  name: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  norm: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  log: z.boolean().optional()
});

const enumParamSchema = paramMetaSchema.extend({
  id: z.number(),
  name: z.string(),
  value: z.number(),
  options: z.array(z.object({ value: z.number(), label: z.string() }))
});

const layoutControlSchema = z.object({
  label: z.string(),
  paramName: z.string().nullable(),
  paramId: z.number().nullable(),
  widget: z.enum(['knob', 'toggle', 'slider', 'dropdown', 'graph', 'spacer', 'button', 'meter', 'label', 'readout', 'unknown']),
  // ALWAYS present as of Phase 1.4/2 — the widened contract this test guards.
  rawWidget: z.string(),
  placement: z.object({
    col: z.number().optional(),
    offsetX: z.number().optional(),
    offsetY: z.number().optional(),
    positionExact: z.string().optional()
  }).optional(),
  crossBlock: z.object({
    effect: z.string(),
    family: z.string().nullable(),
    paramName: z.string().nullable(),
    paramId: z.number().nullable()
  }).optional(),
  fw: fwRangeSchema.optional(),
  render: renderMetaSchema.optional(),
  bounds: widgetBoundsSchema.optional()
});

const layoutRowSchema = z.object({
  // ALWAYS present as of Phase 1.4/2 (non-optional on LayoutRow).
  section: z.enum(['parameters', 'mixer']),
  controls: z.array(layoutControlSchema)
});

const layoutPageSchema = z.object({
  name: z.string(),
  pageNum: z.number().optional(),
  fw: fwRangeSchema.optional(),
  value: z.string().optional(),
  selectorParamName: z.string().optional(),
  layout: z.string().optional(),
  geometry: pageLayoutSchema.optional(),
  rows: z.array(layoutRowSchema)
});

const deviceLayoutSchema = z.object({
  editorName: z.string().optional(),
  family: z.string(),
  variantName: z.string().optional(),
  variantValue: z.string().nullable().optional(),
  fw: fwRangeSchema.optional(),
  pinned: z.unknown().optional(),
  pages: z.array(layoutPageSchema)
});

const blockParamsSchema = z.object({
  block: z.string(),
  slug: z.string().optional(),
  page: z.number(),
  named: z.array(namedParamSchema),
  enums: z.array(enumParamSchema),
  type: z.object({ value: z.number(), name: z.string() }).nullable(),
  layout: deviceLayoutSchema.optional()
});

const FIXTURES: Record<string, unknown> = { amp: ampFixture, cab: cabFixture, reverb: reverbFixture };

describe('ForgeFX blockParams contract (fixtures/blockParams/*.json)', () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    describe(name, () => {
      it('matches the Axis BlockParams shape exactly (no drift)', () => {
        const parsed = blockParamsSchema.parse(fixture) satisfies BlockParams;
        expect(parsed.block).toBeTruthy();
      });

      it('carries the Phase 1.1/1.2 widened param fields for at least one param', () => {
        const dto = fixture as BlockParams;
        const all = [...dto.named, ...dto.enums];
        expect(all.some((p) => p.paramName)).toBe(true);
        expect(all.some((p) => p.family)).toBe(true);
        expect(all.some((p) => p.kind === 'float')).toBe(true);
        expect(all.some((p) => p.kind === 'enum')).toBe(true);
      });

      it('every layout control carries a non-empty rawWidget and every row a section (Phase 1.4)', () => {
        const dto = fixture as BlockParams;
        const controls = (dto.layout?.pages ?? []).flatMap((p) => p.rows.flatMap((r) => r.controls));
        const rows = (dto.layout?.pages ?? []).flatMap((p) => p.rows);
        expect(controls.length).toBeGreaterThan(0);
        expect(controls.every((c) => typeof c.rawWidget === 'string' && c.rawWidget.length > 0)).toBe(true);
        expect(rows.every((r) => r.section === 'parameters' || r.section === 'mixer')).toBe(true);
      });

      it('pages carry resolved PageLayout geometry and controls carry widget bounds (renderer profile)', () => {
        const dto = fixture as BlockParams;
        const pages = dto.layout?.pages ?? [];
        const controls = pages.flatMap((p) => p.rows.flatMap((r) => r.controls));
        const withGeometry = pages.filter((p) => p.geometry != null).length;
        const withBounds = controls.filter((c) => c.bounds != null).length;
        expect(withGeometry).toBeGreaterThan(0);
        expect(withBounds).toBeGreaterThan(0);
        // Every page with a `layout` reference has a resolved geometry.
        expect(pages.filter((p) => p.layout != null && p.geometry == null)).toEqual([]);
      });

      it('crossBlock carries a string effect token and a nullable family (Phase 2)', () => {
        // The schema is the contract: a cross-block ref's `effect` is the editor's cross-effect TOKEN
        // (e.g. 'ID_GLOBAL'), not a wire eid, and `family` is null when the reference is unresolved.
        const ok = layoutControlSchema.pick({ crossBlock: true }).safeParse({
          crossBlock: { effect: 'ID_GLOBAL', family: null, paramName: 'GLOBAL_TEMPO', paramId: null },
        });
        const bad = layoutControlSchema.pick({ crossBlock: true }).safeParse({
          crossBlock: { effect: 199, family: 'GLOBAL', paramName: 'GLOBAL_TEMPO', paramId: null },
        });
        expect(ok.success).toBe(true);
        expect(bad.success).toBe(false);
      });

      it('labels are served UNCHANGED — catalog-only, not deduped (Phase 1.3)', () => {
        // The deleted `dedupeLabels` pipeline appended " 1"/" 2" the moment a name repeated, so a
        // fixture with ANY verbatim-duplicate name (e.g. the cab's four "Low Cut" mic knobs) proves
        // that pipeline is gone. A fixture with none is inconclusive, not a failure, for a block that
        // simply has no repeats — so only assert where this fixture is known to carry duplicates.
        const dto = fixture as BlockParams;
        const names = [...dto.named, ...dto.enums].map((p) => p.name);
        const counts = new Map<string, number>();
        for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
        const duplicated = [...counts.values()].some((n) => n > 1);
        expect(duplicated, `${name} fixture: expected at least one verbatim-duplicate param name`).toBe(true);
      });
    });
  }
});

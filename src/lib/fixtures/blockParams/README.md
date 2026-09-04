# blockParams contract fixtures

Frozen `GET /preset/blocks/:eid/params` responses for the FM3's Amp / Cab / Reverb blocks —
consumed by `../../forgefxContract.test.ts`, the guard from the plan's Phase 2 that keeps "ForgeFX
is the only source of UI knowledge" true: server↔`types.ts` shape drift otherwise typechecks green
and fails only at runtime (see `src/lib/CLAUDE.md`).

## Provenance

Generated from ForgeFX's REAL production driver (`createGen3Driver` over the real FM3
`DeviceProfile` — real catalogs, real ranges, real editor layouts) via a **mocked transport**, not
a live device — this environment has no FM3 attached. This is the same no-hardware idiom ForgeFX's
own unit tests use (`ForgeFX/server/test/drivers/definition-completeness.test.ts`,
`.../modelbyte.test.ts`): every param in the response is device-true; only the live wire *value* is
synthetic (every param read back as the same raw value, 30000/65534).

To regenerate against real hardware instead, capture `GET /preset/blocks/<eid>/params` from a
running ForgeFX (`:5056`) with an FM3 attached for effect ids `58` (Amp 1), `40` (Cab 1), `28`
(Reverb) — see `ForgeFX/server/src/devices.ts` `SLUG_FAMILY` / `effectRoster()` for other blocks —
and overwrite the corresponding file here verbatim (`curl localhost:5056/preset/blocks/58/params
| jq . > amp.json`).

## Refresh after a ForgeFX contract change

Regenerate (mocked-transport method above still works with no hardware) whenever
`ForgeFX/server/src/drivers/gen3.ts`'s `blockParams` response shape changes, then re-run
`forgefxContract.test.ts` — a shape it can no longer parse is real drift, not a stale fixture.

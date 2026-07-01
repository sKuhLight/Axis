# Axis + ForgeFX Observability / Telemetry Plan (Grafana Faro / Tempo / Loki)

> Planning deliverable. No app source is modified by this document. Default position: **telemetry ships dark — opt-in, default OFF**, mirroring the existing `AXIS_CLOUD` gating exactly.

---

## 0. Context recap (what the codebase already gives us)

Read and confirmed:

- **Cloud opt-in is the template.** `AXIS_CLOUD=1` gates everything in `ForgeFX/server/src/index.ts` (lines 292-304): when off, the route handlers are never registered and `cloud.js` is never even dynamically imported, so `@supabase/supabase-js` ships dark. Creds are **env-only** (`SUPABASE_URL` / `SUPABASE_ANON_KEY` via `process.loadEnvFile()`, `ForgeFX/server/src/cloud.ts` lines 11-13). `cloudEnabled()` requires `AXIS_CLOUD === '1' && URL && KEY`.
- **The consent UI pattern** lives in `Axis/src/lib/CloudPanel.svelte`: a modal `<dialog>`-style card, checkbox "items" with `.chk`/`.chk.on` toggles, an "auto-sync" toggle, a privacy/legal footnote, all driven from `editor.svelte.ts`. Toggles persist to `localStorage` (`editor.svelte.ts` lines 20-25, 399-401: `loadAutoSync`/`setAutoSync`, `loadScopes`/`saveScopes`). **Mirror this verbatim** for telemetry.
- **The debug log already exists.** `Axis/electron/main.cjs` (lines 15-67): on every launch it opens `app.getPath('logs')/axis-debug.txt` (fresh, `flags: 'w'`), writes a header (app version, electron/node/chrome versions, `process.platform`/`arch`, `os.release()`), **tees stdout+stderr** (so it captures ForgeFX's Pino JSON + every `console.*`), mirrors the **renderer console** via `webContents.on('console-message')`, captures `render-process-gone`, `uncaughtException`, `unhandledRejection`, and appends the full `/diag` JSON at startup (`logDiagnostics()`). Today users send this manually (Help → Open Debug Log). **This is the artifact the "Upload Debug Log" button uploads.**
- **ForgeFX already uses Pino** (`Fastify({ logger: { level: ... } })`, `index.ts` line 17). No redaction configured yet (`grep redact` → none). It runs **in-process inside Electron's Node** (`main.cjs` line 99 dynamic-imports `server/dist/index.js`), same process as the renderer's parent — so ForgeFX logs already land in `axis-debug.txt`.
- **`/diag`** (`device.ts` `diagnostics()`, lines 297-323) returns: platform, arch, node/napi versions, **device profile (key/name/model byte)**, detected flag, MIDI availability, serial+MIDI port lists (ids, fractal flag, model), override, resolved connection, transportOpen/Label, listError. **No PII** except potentially OS-assigned port *names* (e.g. "Axe-Fx III MIDI In") — those are device names, not user names, so safe.
- **Existing error signals to capture** (already in code, just not exported as telemetry):
  - `presetDump` diagnostics — `device.ts` lines 449/460: incomplete-attempt retries and frame/byte/fn summary (grid decode health).
  - **503s on `/preset/grid`**, `/preset/blocks`, `/presets/:n/summary`, `/backup/*`, most device routes (`index.ts` — `reply.code(503)` on device-comm failure is the dominant error path).
  - **Profile adoption** — `device.ts` lines 345-386, `detect()` / `#ready()` switching FM3↔FM9↔Axe-Fx III, including the "Windows Axe-Fx III device-offline" class of bug.
  - 422 on `/preset/decode` (bad .syx), 404 on missing block params, 400 on malformed bodies.
- **Electron security posture:** `contextIsolation: true`, `nodeIntegration: false`, minimal preload bridge (`preload.cjs`). UI is served same-origin from `http://localhost:<port>` by ForgeFX (`main.cjs` line 145, `FORGEFX_STATIC`). **No CSP is currently set** (grep found none) — meaning egress is not currently restricted, but we should not rely on that; see §8.
- **A Supabase Storage bucket already exists** (`preset-blobs`, `cloud.ts` line 108) under per-user RLS. Reusable as an upload target for debug bundles (see §4).

---

## 1. Stack evaluation & recommended topology

### Signals and components

| Signal | Source | Component |
|---|---|---|
| Renderer errors, console logs, web-vitals, custom events, **front-end traces** | Axis renderer (Chromium) | **Grafana Faro Web SDK** |
| Backend traces (Fastify request spans, device-comm spans) | ForgeFX (Node) | **OpenTelemetry Node SDK** → OTLP |
| Backend logs (Pino JSON) | ForgeFX (Node) | Pino → **Loki** (via Alloy or direct) |
| Trace storage / query | backend | **Tempo** |
| Log storage / query | backend | **Loki** |
| Ingest / fan-out (Faro receiver + OTLP receiver + Loki/Tempo writers) | server-side | **Grafana Alloy** |
| Metrics (Prometheus/Mimir) | — | **NOT for MVP** (see below) |

### Do we need Prometheus / Mimir?

**No, not for the stated goal.** The user's goal is "find bugs faster / see what errors users hit" — that is an **errors + logs + traces** problem (LGT), not a time-series-metrics problem. Faro's RUM already gives web-vitals and error rates as events; we can compute "N users hit 503 on /preset/grid this week" from Loki/Tempo with LogQL/TraceQL. Adding Mimir means another store, another ~10k-active-series budget, and cardinality discipline (device model × firmware × OS × app version explodes series quickly). **Defer metrics entirely** until there's a concrete dashboard that needs rate-over-time aggregation that logs can't cheaply answer. If it's ever wanted, derive it server-side: Alloy can turn Loki log lines / spans into metrics (`loki.metric.*` / spanmetrics) without instrumenting the apps.

### Do we need Grafana Alloy / a Collector?

**Yes — exactly one Alloy instance, server-side.** It is the single ingest endpoint and the thing that makes the topology clean:

- `faro.receiver` accepts the Axis renderer's batched payloads (logs/events/exceptions/measurements + front-end traces) on one HTTPS endpoint.
- An OTLP receiver accepts ForgeFX's backend traces.
- Alloy fans out: logs → Loki, all traces → Tempo.
- It also lets us do **server-side scrubbing as a second safety net** (a `loki.process` / transform stage stripping anything that slips past client redaction) and **sampling** without an app redeploy.

The apps never talk to Loki/Tempo directly — they only know one URL (the Alloy/Faro-collector endpoint). This matches how `AXIS_CLOUD` keeps a single injected endpoint.

### Recommended topology

```
                          (opt-in, default OFF)
  ┌─────────────── Axis app (one Electron process) ──────────────┐
  │                                                               │
  │  Renderer (Chromium)            Main/Node (ForgeFX in-proc)   │
  │  ┌──────────────────┐           ┌──────────────────────────┐ │
  │  │ Faro Web SDK     │           │ OTel Node SDK            │ │
  │  │  - errors/logs   │           │  - @fastify/otel spans   │ │
  │  │  - web-vitals    │  fetch    │  - device-comm spans     │ │
  │  │  - front traces  │ +traceparent │ Pino logs ───────────┐ │ │
  │  └────────┬─────────┘  header  └──────────┬───────────────┘ │ │
  │           │ (beforeSend scrub)             │ (Pino redact)    │
  └───────────┼────────────────────────────────┼─────────────────┘
              │  HTTPS (Faro payload)           │ OTLP/HTTP + Loki push
              ▼                                  ▼
        ┌───────────────────── Grafana Alloy ──────────────────────┐
        │ faro.receiver  ·  otlp receiver  ·  loki.write · tempo    │
        │ (+ server-side scrub / sampling safety net)               │
        └───────┬──────────────────────────────┬────────────────────┘
                ▼                               ▼
              Loki (logs)                    Tempo (traces)
                └───────────────┬──────────────┘
                                ▼
                           Grafana (dashboards / alerts)
```

### Grafana Cloud free tier vs self-host

Confirmed free-tier limits (2026): **10k active metric series, 50 GB logs, 50 GB traces, 50 GB profiles, 3 users, 14-day retention, no credit card.** ([Grafana pricing](https://grafana.com/pricing/), [MonitoringCost 2026](https://monitoringcost.com/grafana-cloud-pricing)).

| Dimension | **Grafana Cloud free tier** | **Self-host (small VPS: Alloy+Loki+Tempo+Grafana)** |
|---|---|---|
| Cost | $0 at this scale (a handful of testers, opt-in, will never approach 50 GB) | ~$5-12/mo VPS (2 vCPU / 4 GB, e.g. Hetzner CX22) + your time |
| Setup effort | Low — managed Faro receiver + OTLP endpoints, hosted Grafana, no ops | Medium-high — docker-compose for Alloy+Loki+Tempo+Grafana, TLS (Caddy), backups, upgrades, disk monitoring |
| Maintenance | None | You own uptime, disk pressure, retention pruning, CVE patching |
| Privacy / data residency | Data sits on Grafana's infra (US/EU region selectable). For a privacy-sensitive PolyForm-NC beta this is the one real wrinkle — but **opt-in + aggressive client scrubbing makes the payload non-personal anyway**. | Full control; data on a box you choose (e.g. EU). Strongest residency story. |
| Retention | 14 days (free) — fine for active bug-hunting | Whatever disk allows |
| Scale headroom | Generous for beta; predictable paid path if it grows | Vertical scaling = your problem |

**Recommendation for a beta-stage hobby project with a handful of testers: start on Grafana Cloud free tier.** Rationale: zero ops, zero cost, instant dashboards, and the project already accepts a hosted dependency for cloud sync (Supabase). The data-residency concern is mitigated by the fact that telemetry is opt-in and the payload is scrubbed to non-personal device/error data. Select the **EU region** at stack creation if any tester is in the EU. Keep the endpoint **env-injected** (just like Supabase) so a self-host migration later is a one-line config change in Alloy/the collector URL — no code change. Document the self-host docker-compose path in the repo for privacy-conscious self-hosters (consistent with CloudPanel's "open-source — self-host your own cloud backend" footnote).

---

## 2. Electron specifics

**Renderer (Chromium) → Faro.** Faro is browser-oriented and the Axis renderer *is* a browser context (Chromium with `contextIsolation`). Faro runs there unchanged — it captures `window.onerror`/`unhandledrejection`, console, web-vitals, and (with the tracing package) front-end spans on `fetch`. Initialize it in the SvelteKit client entry, guarded so it is a **no-op in SSR/`prerender`** and a no-op unless telemetry is enabled. The Axis renderer talks to ForgeFX over `http://localhost:<port>` same-origin, so Faro's auto-instrumented `fetch` covers every API call.

**Main process (Node) does NOT need Faro.** It already has the most important capture path: `main.cjs` tees stdout/stderr and catches `uncaughtException`/`unhandledRejection` into `axis-debug.txt`. For *live* telemetry from the main/ForgeFX side, use the **OpenTelemetry Node SDK**, not Faro (Faro is a web SDK; in a Node context you'd be fighting it).

**ForgeFX (Node/Fastify) → OpenTelemetry Node SDK → Alloy/Tempo + Loki.**
- Confirmed 2026 fact: **`@opentelemetry/instrumentation-fastify` was removed in March 2026**, deprecated in favour of **`@fastify/otel`** (maintained by the Fastify team). Use `@fastify/otel` for HTTP-route spans. ([fastify/otel](https://github.com/fastify/otel), [npm instrumentation-fastify](https://www.npmjs.com/package/@opentelemetry/instrumentation-fastify)).
- Traces export via `@opentelemetry/exporter-trace-otlp-http` to Alloy's OTLP receiver (or Grafana Cloud's OTLP endpoint), which forwards to Tempo (OTLP/HTTP on :4318). ([Grafana intro to tracing with Tempo](https://grafana.com/blog/intro-to-distributed-tracing-with-tempo-opentelemetry-and-grafana-cloud/)).
- Logs: ForgeFX's existing Pino JSON either (a) gets shipped from `axis-debug.txt` by a Loki file-tail in Alloy, or (b) is pushed directly. For an in-process desktop app there is no log file Alloy can tail on the user's machine, so **push Pino logs to Loki via a transport** (e.g. a Pino → OTLP-logs or Pino → Loki transport) gated by the same flag, OR (simpler MVP) **don't live-ship backend logs at all** — they're already in the uploaded debug bundle. Recommended: MVP relies on the upload bundle for backend logs; live Loki backend-log shipping is a Phase 3 nice-to-have.

**Trace propagation across the local HTTP boundary (the key correlation win).**
- Faro's `@grafana/faro-web-tracing` uses the **W3C `traceparent`** propagator by default and **adds a `traceparent` header to outgoing `fetch` calls**. ([Faro tracing instrumentation](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/tracing-instrumentation/)).
- `@fastify/otel` on the ForgeFX side reads incoming `traceparent` and continues the trace, so a renderer click → `fetch('/preset/grid')` → ForgeFX device-comm span all land in **one Tempo trace**.
- **Known gotcha (confirmed):** front-end and back-end spans can show up *unlinked* if propagation headers aren't accepted/CORS-allowed. ([faro-web-sdk #705](https://github.com/grafana/faro-web-sdk/issues/705)). Two concrete requirements:
  1. Faro tracing must be told `localhost:<port>` (the ForgeFX origin) is an allowed propagation target (`propagateTraceHeaderCorsUrls` / instrumentation matcher) — otherwise it won't attach `traceparent` to those fetches.
  2. ForgeFX CORS is currently `origin: true` (`index.ts` line 18) which reflects the origin — fine — but ensure `traceparent`/`tracestate` are permitted request headers (with `origin: true` and no explicit allowlist they are; if an allowlist is added later, include them).
- Because ForgeFX runs **in-process** with the renderer's parent, the trace also benefits from Faro's session id being attachable as a span attribute for cross-signal correlation.

---

## 3. Opt-in / consent model

### Env var (ForgeFX, env-only, default OFF)

Add `AXIS_TELEMETRY` mirroring `AXIS_CLOUD` exactly:

```
AXIS_TELEMETRY=1            # master gate, default unset/0 → telemetry ships dark
AXIS_FARO_URL=...           # Faro collector / Alloy faro.receiver URL (env-only, no hardcode)
AXIS_OTLP_URL=...           # OTLP traces endpoint (Alloy/Tempo), env-only
AXIS_TELEMETRY_KEY=...      # Faro app key / Alloy auth, env-only (publishable, like the anon key)
```

- Loaded by the existing `process.loadEnvFile()` in `index.ts`. **No endpoint or key hardcoded in source** — the hosted Axis build injects them at build/run; self-hosters set their own. Identical philosophy to `cloud.ts` lines 11-13.
- When `AXIS_TELEMETRY !== '1'`: ForgeFX never initializes the OTel SDK and serves `GET /telemetry/status → { enabled: false }` (so Axis can gate its UI without erroring — same trick as `/cloud/status` at `index.ts` line 303). The renderer reads this on boot and **never even loads the Faro bundle** when disabled (dynamic import behind the flag → keeps it dark in builds where the operator doesn't ship telemetry).
- **Two gates, both required to send anything:** (1) operator gate `AXIS_TELEMETRY=1` (is this build wired to a collector at all?) AND (2) **user consent** persisted in the renderer. A build can have `AXIS_TELEMETRY=1` but a user who declined consent sends nothing. This is the privacy-correct default.

### User consent (renderer, persisted, default OFF)

Mirror `loadAutoSync`/`setAutoSync` in `editor.svelte.ts`:

```ts
const TELEMETRY_KEY = 'axis.telemetry.consent';
const loadTelemetryConsent = (): boolean => {
  try { return localStorage.getItem(TELEMETRY_KEY) === '1'; } catch { return false; } // DEFAULT OFF
};
const saveTelemetryConsent = (on: boolean) => { try { localStorage.setItem(TELEMETRY_KEY, on ? '1' : '0'); } catch {} };
```

Note the inversion vs auto-sync: auto-sync defaults **on** (`!== '0'`); telemetry defaults **off** (`=== '1'`). Faro is only `init()`-ed when **both** `telemetry.enabled` (from `/telemetry/status`) **and** consent are true.

### Anonymous instance id (no PII)

- On first run, generate a **random v4 UUID** → persist as `axis.telemetry.instanceId` in `localStorage` (renderer) and/or the ForgeFX store. This is the only stable identifier.
- It is **not** the Supabase user id, **not** the email, **not** the machine name. Set it as Faro's `session.id` seed / a custom `instanceId` meta attribute and as an OTel resource attribute (`service.instance.id`). This lets us say "instance abc123 hit this bug 4 times" without knowing who abc123 is.
- Faro `samplingRate` can stay at `1.0` for a handful of testers (we want everything); make it env-configurable for later scale.

### What is collected when ON / never collected

**Collected (ON):** app version, Axis/Electron/Node/Chrome versions, OS platform+arch+release, **device profile (model name + model byte) and firmware** when known, the failing **route** (`/preset/grid` etc.) and status code, **error class + scrubbed stack**, grid-decode failure summaries (frame/byte counts, terminator flag), MIDI/serial **availability and Fractal-flagged port count** (count + model, not full names if a name could embed anything user-set), device-detect transitions, web-vitals, anonymous instance id, Faro session id, trace/span ids.

**NEVER collected:** emails, Supabase user id, any auth token, **preset names or preset content/SysEx bytes**, setlist/scene names, file paths containing a username (`C:\Users\<name>\...`), file contents, the local `FORGEFX_DATA_DIR` absolute path, IP-derived precise geo (Faro/Grafana coarse region only). Device MIDI port *names* are borderline (usually vendor strings like "FM9 MIDI In") — pass them through the scrubber and prefer counts in live telemetry; the full list stays only in the on-demand debug bundle.

---

## 4. UI design in Axis

### Where it lives

A new **Privacy & Diagnostics** panel, built as a sibling to `CloudPanel.svelte` (same `.bg`/`.card` modal shell, same `.item`/`.chk`/`.chk.on` toggle styling, same `.sec` section headers, same muted footnote). Opened from the same place the cloud panel is opened (a settings/help affordance) and/or surfaced once as a **first-run consent step**. State lives in `editor.svelte.ts` as `telemetry = $state({ enabled, consent, instanceId })` with a `telemetryOpen` boolean, exactly like `cloud`/`cloudOpen`.

### Consent dialog copy

> **Help improve Axis**
> Axis can send anonymous diagnostics when something goes wrong — error reports, which feature failed, your device model and firmware, and your OS and app version. This helps us find and fix bugs faster.
>
> We **never** send your email, your presets, preset names, file contents, or anything that identifies you personally. You're identified only by a random ID. You can turn this off any time.
>
> [ Enable anonymous diagnostics ]   [ Not now ]
>
> *Off by default. Axis is open-source — self-hosters can point diagnostics at their own server.*

Toggle in the panel (mirrors the auto-sync `.item.auto` block):

> ☑ **Anonymous diagnostics** — Send error reports & performance data to help fix bugs. No personal data, no presets.

### The "major error → Upload Debug Log" popup

**Trigger conditions** (a non-spammy "major error" gate — debounced, max once per N minutes per category):
- Renderer **unhandled exception / unhandled rejection** (caught by Faro and/or a top-level handler).
- A ForgeFX **5xx** (the 503 device-comm path) on a *user-initiated* action (not background polling) — surfaced via the existing `forgefx` client error handling.
- A **device-comm failure** class: detect failed, transport won't open, repeated `presetDump` incomplete attempts, `render-process-gone`.

When one fires, show a non-blocking toast→dialog (reuse `showToast` for the nudge, then the modal card for the action):

```
┌──────────────────────────────────────────────┐
│  ⚠  Something went wrong                       │
│                                                │
│  Axis hit an error talking to your device      │
│  (FM9 · /preset/grid · 503).                   │
│                                                │
│  You can send us a debug report so we can      │
│  fix it. It includes:                          │
│   • the diagnostic log (this session)          │
│   • recent app events & the error              │
│   • your device/OS/app versions                │
│  It does NOT include your presets, preset      │
│  names, email, or file contents.               │
│                                                │
│  [ View what's sent ]   [ Upload report ]      │
│                            [ Not now ]         │
└──────────────────────────────────────────────┘
```

- **"View what's sent"** opens the actual `axis-debug.txt` (the existing Help → Open Debug Log path) plus a preview of the bundled JSON, so the disclosure is verifiable, not just promised.
- The button is shown **even if live telemetry consent is OFF** — uploading a debug report on demand is a separate, explicit, per-incident consent ("I choose to send this now"), which is *more* privacy-respecting than always-on. It must still run the scrubber before upload.

**What the bundle contains:**
1. The existing **`axis-debug.txt`** (read via a small main-process IPC method added to `preload.cjs`, e.g. `axisDesktop.readDebugLog()` — the renderer can't read the FS directly).
2. **Recent in-memory Faro session events** (last ~N events/errors/spans the renderer is holding) — gives the "what led up to it" trail even when live telemetry was off.
3. The current **`/diag`** JSON (already fetchable at `${ORIGIN}/diag`).
4. The **anonymous instance id** + app/OS versions + the triggering error summary.
All of it passes through the **same scrubber** as live telemetry before leaving the machine.

**Where it uploads — evaluation:**

| Target | Pros | Cons | Verdict |
|---|---|---|---|
| **Faro endpoint** (as a large custom event/log) | reuses telemetry path, lands next to RUM session | Faro payloads are sized for small events, not multi-KB log blobs; awkward to retrieve a full file | No |
| **Existing Supabase Storage bucket** (a new `debug-reports` bucket, anon-writable or per-incident signed) | infra already present (`cloud.ts`), durable, easy to download the raw file, decouples "send my log now" from the Grafana stack | needs a bucket + write policy; ties debug upload to the cloud dependency | **Yes — primary** |
| **Loki push** (one big log line / structured) | searchable alongside other logs | Loki line-size limits, not meant for blobs, retrieval is clunky | Secondary/no |

**Recommendation:** upload the bundle to a **dedicated Supabase Storage bucket** (`debug-reports/<instanceId>/<timestamp>.json.br`, brotli-compressed like the preset blobs already are), with an **insert-only, no-read** storage policy keyed to the anon instance id so users can push but not browse others'. Then push a **lightweight pointer event to Faro/Loki** (`debug_report_uploaded { instanceId, reportPath, errorClass }`) so the report shows up in the Grafana error timeline and we can fetch the full bundle from Storage when triaging. This reuses both existing systems for what each is good at.

---

## 5. Data model & dashboards

### Signals to capture (mapped to existing code)

| Signal | Attributes | Source in code |
|---|---|---|
| `app.error` | errorClass, scrubbed stack, route, statusCode, deviceModel, fw, appVersion, instanceId | Faro auto + `forgefx` client |
| `forgefx.request` span | route, method, status, durationMs, deviceModel | `@fastify/otel` over `index.ts` routes |
| `device.comm.fail` | route, reason, transport (serial/midi), platform | the `reply.code(503)` paths in `index.ts`; `device.ts` transport errors |
| `grid.decode` | frames, bytes, fns, terminator, attempt, ok | `device.ts` lines 449/460 `presetDump` logs |
| `device.profile.adopt` | from, to, modelByte, port, supported | `device.ts` `detect()`/`#ready()` lines 345-386 |
| `preset.decode.fail` | reason (422) | `/preset/decode` `index.ts` line 112 |
| `midi.availability` | midiAvailable, fractalPortCount | `/diag` `midiAvailable()` |
| `webvitals` | LCP/CLS/INP/TTFB | Faro web-vitals |
| `debug_report_uploaded` | instanceId, reportPath, errorClass | new upload flow §4 |

### Key Grafana dashboards / alerts

1. **Error overview** — error rate over time by `errorClass` and `route`; top failing routes; split by `deviceModel` + `appVersion`. (Loki LogQL on `app.error`.)
2. **Device-comm health** — `device.comm.fail` rate by transport + platform (surfaces the "Windows Axe-Fx III offline" class instantly); profile-adoption success vs failure.
3. **Grid decode** — `grid.decode` incomplete-attempt ratio (retries / total) by model — the single best "is the codec misbehaving" indicator.
4. **Release health** — error rate per `appVersion` so a bad release is obvious within hours (correlate with the GitHub-release auto-updater).
5. **Trace explorer (Tempo)** — pivot from any `app.error` to its full renderer→ForgeFX→device trace via shared trace id.
6. **Alerts:** spike in 5xx rate on any route; a *new* `errorClass` appearing; grid-decode incomplete ratio > threshold for a model; error rate jump right after a release tag. (Start with 1-2 alerts to email/Discord; don't over-page a hobby beta.)

---

## 6. PII scrubbing (concrete rules)

**Two layers, plus a server-side net (Alloy).**

**Layer 1 — Faro `beforeSend` hook (renderer).** Faro's `beforeSend` receives every item before transport; return `null` to drop it, or a mutated item. ([Faro errors/RUM security](https://www.systemshardening.com/articles/observability/frontend-rum-security-grafana-faro/)). Apply, in order:
- **Windows user path:** `C:\Users\<name>\...` and `C:/Users/<name>/...` → replace `<name>` segment with `<user>`. Regex: `/([A-Za-z]:\\Users\\)[^\\]+/gi` and the forward-slash variant.
- **macOS/Linux home:** `/Users/<name>/`, `/home/<name>/` → `/Users/<user>/`, `/home/<user>/`.
- **Emails:** `/[\w.+-]+@[\w-]+\.[\w.-]+/g` → `<email>`.
- **Drop entirely** any event whose payload matches preset-content markers (raw SysEx `F0...F7` hex blobs, base64 over a length threshold) — never send preset bytes.
- **Strip** known PII attribute keys (`email`, `userId`, `presetName`, `name`, `filePath`) from event attributes before send.
- Implement as: serialize item → JSON → run the regex replacements → parse back (the documented Faro pattern), then drop on content markers.

**Layer 2 — Pino `redact` (ForgeFX).** Add a `redact` config to the Fastify logger (`index.ts` line 17), e.g. redact paths `email`, `*.email`, `password`, `authorization`, `*.token`, `*.filePath`, `data` (preset doc bodies in `/store` routes), and a `censor` function that runs the same path-stripping regex on string values. This protects both the live Loki stream *and* the `axis-debug.txt` file (since Pino output is teed into it). Note: the `/store/:c/:id` PUT bodies carry config docs — ensure `data` is not logged at info level.

**Layer 3 — Alloy server-side net.** A `loki.process`/transform stage re-runs the path/email regexes on ingest, so anything that slips past the client is still scrubbed before storage. Belt and suspenders for a privacy-sensitive project.

**Debug-bundle scrubbing.** The Upload-Log flow runs the *same* Layer-1 regex set over the assembled bundle (the `axis-debug.txt` text + Faro events + `/diag`) before upload — critical because `axis-debug.txt` can contain Windows paths and port names.

---

## 7. Phased rollout

**Package names/versions confirmed for 2026:**
- `@grafana/faro-web-sdk` — **v2.x (latest 2.8.x)**; Faro v2 is current, simpler setup, web-vitals v5. ([npm](https://www.npmjs.com/package/@grafana/faro-web-sdk), [releases](https://github.com/grafana/faro-web-sdk/releases)).
- `@grafana/faro-web-tracing` — matching v2.x (front-end OTel tracing + `traceparent` propagation).
- ForgeFX backend traces: `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, **`@fastify/otel`** (NOT the removed `@opentelemetry/instrumentation-fastify`), `@opentelemetry/resources` + `@opentelemetry/semantic-conventions`.
- Ingest: `grafana/alloy:latest` (docker) with `faro.receiver` + OTLP receiver, *or* Grafana Cloud managed endpoints.

**Phase 0 — Decisions & infra (no app code).** Pick Grafana Cloud free tier (EU region) vs self-host. Create the stack, get the Faro app key + OTLP endpoint + Loki/Tempo wiring. Create the Supabase `debug-reports` bucket + insert-only policy. Define the `AXIS_TELEMETRY*` env vars (env-only). *~half a day.*

**Phase 1 — MVP: error capture + Upload Debug Log button.** This is the highest-value, lowest-risk slice and directly answers the user's two explicit asks.
- Add `AXIS_TELEMETRY` gate + `/telemetry/status` to `index.ts` (mirror the cloud block lines 292-304).
- Add the renderer consent state to `editor.svelte.ts` (default OFF) + first-run consent + the Privacy panel (clone CloudPanel).
- Init Faro v2 in the SvelteKit client entry, gated by both flags, with the **`beforeSend` scrubber** and anonymous instance id.
- Add Pino `redact` to ForgeFX.
- Build the **major-error → Upload Debug Log** popup: add `axisDesktop.readDebugLog()` to `preload.cjs`/`main.cjs`, assemble + scrub + brotli + upload to Supabase Storage, push a pointer event to Faro/Loki.
- One "Error overview" dashboard.
*~3-5 days.*

**Phase 2 — Backend traces + correlation.** Add the OTel Node SDK + `@fastify/otel` to ForgeFX (gated), export to Tempo, enable `@grafana/faro-web-tracing` with `localhost:<port>` as a propagation target, verify end-to-end traces link (watch for issue #705). Add device-comm + grid-decode + profile-adopt custom spans/events. Build the device-comm-health and trace-explorer dashboards. *~3-4 days.*

**Phase 3 — Live backend logs + dashboards/alerts polish.** Ship Pino → Loki live (or Alloy file-tail if a persistent log path is added), release-health dashboard, the 1-2 alerts. Optional: server-side spanmetrics if a metric is genuinely wanted (still no app-side Mimir). *~2-3 days.*

---

## 8. Risks / open questions

- **Bundle-size impact.** Faro v2 web-sdk + web-tracing adds a meaningful chunk to the renderer bundle. Mitigate by **dynamic-import behind the consent+enabled gate** so users who never opt in never download it, and so builds without `AXIS_TELEMETRY` ship it dark — same as how `cloud.js` stays out of release builds.
- **Electron CSP / network egress.** There is currently **no CSP set** in `main.cjs`/the served HTML (grep found none), and Faro/OTLP need `connect-src` to the collector host. **Decision needed:** when adding a CSP later (good hardening), it must allow the Faro/OTLP/Supabase hosts in `connect-src`. Conversely, the *absence* of a CSP today means egress isn't restricted — so the gating discipline (don't init unless opted in) is what actually keeps it dark, not the platform.
- **Offline behavior.** Testers are guitarists; the device works fully offline. Faro/OTLP exporters must **fail silently and buffer/drop** without blocking the UI or throwing into the debug log (would be ironic). Cap buffer size; never retry forever. The Upload-Log button must show a clear "couldn't reach server, your log is still saved locally — Help → Open Debug Log" fallback.
- **Cost at scale.** Free tier is 50 GB/14 days — ample for a handful of opt-in testers. If the beta grows to hundreds, watch Loki volume (events per session) and metric cardinality; the `samplingRate` knob and the "no app-side metrics" decision keep this bounded. Revisit before any public launch.
- **`traceparent` linkage** can silently not-link (issue #705) — Phase 2 must explicitly verify a renderer error and its ForgeFX span share a trace id before declaring correlation "done".
- **Decisions that need the user:**
  1. **Grafana Cloud free tier vs self-host**, and **which region/host** (recommendation: Grafana Cloud free, EU region, env-injected endpoint so migration is config-only).
  2. Confirm the **Supabase `debug-reports` bucket** approach (vs a dedicated upload endpoint) — reuses existing infra but couples debug upload to the cloud project.
  3. Whether the **major-error popup may appear when live telemetry consent is OFF** (recommendation: yes — it's per-incident explicit consent and strictly more private than always-on).
  4. Env-var name: **`AXIS_TELEMETRY`** proposed (parallels `AXIS_CLOUD`).

---

### Sources
- [Grafana Faro Web SDK (npm)](https://www.npmjs.com/package/@grafana/faro-web-sdk) · [releases](https://github.com/grafana/faro-web-sdk/releases) · [repo](https://github.com/grafana/faro-web-sdk)
- [Faro tracing instrumentation](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/tracing-instrumentation/) · [front/back trace-link issue #705](https://github.com/grafana/faro-web-sdk/issues/705)
- [fastify/otel](https://github.com/fastify/otel) · [instrumentation-fastify deprecation (npm)](https://www.npmjs.com/package/@opentelemetry/instrumentation-fastify)
- [Grafana Alloy faro.receiver](https://grafana.com/docs/alloy/latest/reference/components/faro/faro.receiver/) · [intro to tracing with Tempo](https://grafana.com/blog/intro-to-distributed-tracing-with-tempo-opentelemetry-and-grafana-cloud/)
- [Grafana pricing](https://grafana.com/pricing/) · [Grafana Cloud pricing 2026 (MonitoringCost)](https://monitoringcost.com/grafana-cloud-pricing) · [CloudZero analysis](https://www.cloudzero.com/blog/grafana-cloud-pricing/)
- [Faro RUM security / beforeSend PII redaction](https://www.systemshardening.com/articles/observability/frontend-rum-security-grafana-faro/)

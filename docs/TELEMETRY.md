# Axis Telemetry — Faro Collector Blocking: Root Cause, Fix & Monitoring Plan

> Status: investigation + design, 2026-07-03. No app code was changed for this document.
> Companion doc: `docs/observability-plan.md` (the original full-stack plan; this doc is the
> pragmatic, incident-driven subset plus what actually exists in Grafana Cloud today).

---

## 1. Root cause: `net::ERR_BLOCKED_BY_CLIENT`

**The collector is fine. The fleet is fine. Your browser is blocking the request locally.**

`ERR_BLOCKED_BY_CLIENT` is Chromium's error for "an extension or client-side policy cancelled
this request before it left the machine" — it is never a server or network failure. The
repeated retries + `Faro: Failed sending payload to the receiver / TypeError: Failed to fetch`
are the Faro transport hitting that local block on every batch flush.

### Why Axis specifically

- The configured collector (env `AXIS_FARO_URL` in `ForgeFX/server/.env`, surfaced to the
  renderer via `GET /telemetry/status` → `initFaro()` in `Axis/src/lib/faro.ts`) is
  `https://faro-collector-prod-eu-west-2.grafana.net/collect/<app-key>` — the shared
  **Grafana Cloud Faro collector domain**.
- `faro-collector-*.grafana.net` / Grafana telemetry endpoints are on the **EasyPrivacy**
  filter list, which uBlock Origin, AdBlock Plus, Brave Shields and many Pi-hole setups
  subscribe to. This is a known, acknowledged issue:
  [grafana/faro-web-sdk#497 — "adblockers create errors on browser console"](https://github.com/grafana/faro-web-sdk/issues/497),
  [EasyPrivacy list](https://easylist.to/easylist/easyprivacy.txt),
  [Grafana community thread](https://community.grafana.com/t/disable-metrics-collection-that-gets-blocked-by-content-blockers/124553).
- **"It worked before"** is explained by a filter-list update (EasyPrivacy updates daily) or a
  newly (re)enabled extension/shield — not by any Axis change: `git log` shows `src/lib/faro.ts`
  and the wiring in `editor.svelte.ts` untouched since the telemetry commits
  (`d73ab57`, `b545afb`, `74e29d1`); the collector URL comes from `.env` and did not change.

### Who is affected

| Environment | Blocked? | Why |
|---|---|---|
| Your dev browser (localhost:5173, with uBlock/Brave/etc.) | **Yes** | extension filter list matches the third-party `faro-collector-*.grafana.net` request |
| Packaged Electron app | No (extensions) | Electron loads no extensions — and Loki shows Electron UAs delivering fine |
| Any machine behind Pi-hole/AdGuard-DNS | **Yes, both browser and Electron** | DNS-level block hits every process on the network |

### Confirmed against live data (Grafana Cloud, 2026-07-03)

Faro ingestion is **healthy and current** — the block is (so far) only hitting your own
browser session:

- Datasource `grafanacloud-logs` (Loki) carries the Faro stream `{service_name="AXIS"}`
  with labels `app_id=6556`, `app_key=f957…a7e47`, `kind=event|exception|measurement`.
- Ingestion started **2026-07-01** and has run continuously since: ~600 rows day 1,
  ~34 000 day 2, ~8 100 so far today — including entries timestamped minutes before this
  investigation, all from `browser_name=Electron` user agents.
- **9 distinct instance ids** and **11 app versions** (0.4.22-beta → 0.6.5-beta) reported in
  the last 7 days. The fleet delivers; no fleet-wide outage exists.
- Real bugs are already visible in the stream, e.g. Svelte `each_key_duplicate` exceptions
  and `axis-device-comm: /presets/0/grid 503` / `axis-engine: signal timed out` errors with
  model + firmware context.

**Fail-open is already correct.** `#startFaro()` in `editor.svelte.ts` swallows init errors,
and a blocked transport only logs to the console — the app is unaffected. Nothing needs to be
"fixed" for safety; the fix below is about not losing data from ad-block/Pi-hole users.

**Immediate dev workaround** (zero code): add a uBlock exception for
`faro-collector-prod-eu-west-2.grafana.net` on `localhost`, or disable the extension for the
dev origin.

---

## 2. Recommended fix: first-party relay on `axisapp.live` (Cloudflare Worker)

Filter lists block by **destination domain**. Routing the exact same Faro payloads through a
domain you own defeats extension lists and DNS blockers alike, with no SDK change — Faro's
`url` is already env-driven (`AXIS_FARO_URL`), so the app-side change is **one `.env` line**,
no code.

### Why the Worker and not ForgeFX

ForgeFX runs **on the user's machine**. If it proxied `/api/telemetry → grafana.net`, the
egress would still be from the user's machine to `grafana.net` — a Pi-hole/AdGuard-DNS setup
blocks that DNS lookup exactly the same. A cloud relay on your own domain changes the
destination the blocker sees, which is the whole point. (ForgeFX *could* later batch-forward
its own logs through the same Worker — see Phase 2 — but it is the wrong relay for RUM.)

Note: because the app's origin is `http://localhost:<port>`, even `telemetry.axisapp.live` is
technically "third-party" to a blocker — what protects it is that `axisapp.live` is not on any
list. Avoid tempting fate with keyword heuristics: **prefer a neutral subdomain** like
`ingest.axisapp.live` or `i.axisapp.live` (some Pi-hole regex packs block `^telemetry\..*`).

### Worker (complete)

```js
// axis-faro-relay — forwards Faro RUM payloads to the Grafana Cloud collector.
// Deploy: wrangler deploy; set the key once: wrangler secret put FARO_APP_KEY
// Route: ingest.axisapp.live/collect  (DNS: proxied CNAME/AAAA on the subdomain)
const UPSTREAM = 'https://faro-collector-prod-eu-west-2.grafana.net/collect';

const CORS = {
  'Access-Control-Allow-Origin': '*',            // no credentials are used; localhost origins vary by port
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-faro-session-id',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname !== '/collect') return new Response('not found', { status: 404 });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST')   return new Response('method not allowed', { status: 405, headers: CORS });

    // Cheap abuse guard — Faro batches are small (a few KB).
    const len = Number(req.headers.get('content-length') ?? 0);
    if (len > 1_000_000) return new Response('payload too large', { status: 413, headers: CORS });

    const upstream = await fetch(`${UPSTREAM}/${env.FARO_APP_KEY}`, {
      method: 'POST',
      headers: {
        'content-type': req.headers.get('content-type') ?? 'application/json',
        'x-faro-session-id': req.headers.get('x-faro-session-id') ?? '',
      },
      body: req.body,
    });
    return new Response(upstream.body, { status: upstream.status, headers: CORS });
  },
};
```

App-side change (the only one):

```diff
# ForgeFX/server/.env  (ships inside the packaged app)
-AXIS_FARO_URL=https://faro-collector-prod-eu-west-2.grafana.net/collect/<app-key>
+AXIS_FARO_URL=https://ingest.axisapp.live/collect
```

### Design notes

- **Auth model of the Faro collector:** the app key lives in the URL path. It is *not* a
  secret (it ships in every client and even appears as the Loki label `app_key`); it is a
  routing/rate-limit token. Keeping it Worker-side (`env.FARO_APP_KEY`) is hygiene — the
  public URL stays clean, and rotating the key later means redeploying the Worker, not the app.
- **CORS:** Faro sends `POST` with `content-type: application/json` plus an
  `x-faro-session-id` header → a preflight. The Worker answers `OPTIONS` itself; `*` origin is
  fine because no cookies/credentials are involved and Electron/dev origins are `localhost`
  with varying ports.
- **Tradeoffs:**
  - *Cost:* CF Workers free tier = 100k requests/day; current fleet volume (~35k Loki rows on
    the busiest day, batched many-per-request) is a rounding error. Response/egress bytes are
    tiny (collector replies are empty 2xx).
  - *Latency:* one extra hop (client → CF edge → Grafana EU-West-2), single-digit-to-low-tens
    of ms; irrelevant for async batched telemetry.
  - *Worker down:* Faro `fetch` fails, the SDK logs and retains fail-open behavior — the app
    is untouched, telemetry for that window is lost (Faro has limited in-memory buffering,
    no durable retry). Same failure mode as today, so no new risk.
  - *Residual risk:* if `axisapp.live` itself ever lands on a list (very unlikely for a niche
    domain), rename the subdomain — again a `.env`-only change.
- **Old builds:** installs that shipped with the direct `grafana.net` URL keep using it until
  they update; both endpoints work in parallel, so roll out with the next release.

**Action items (need your credentials, ~30 min):**
1. Cloudflare: create `ingest.axisapp.live` (proxied), deploy the Worker, `wrangler secret put FARO_APP_KEY`.
2. Verify: `curl -X POST https://ingest.axisapp.live/collect -H 'content-type: application/json' -d '{}'` → 2xx from the collector.
3. Flip `AXIS_FARO_URL` in `ForgeFX/server/.env`, rebuild/republish the desktop app.
4. Dev machine: allowlist the old domain in uBlock until you're on the new URL.

---

## 3. Grafana-side findings (what exists today)

- **Datasources:** full Grafana Cloud stack (`grafanacloud-prom`, `grafanacloud-logs`,
  `grafanacloud-traces`, `grafanacloud-profiles`, k6, + a secondary `loki` DS `eev0nygtqazggd`).
- **Faro app:** Frontend Observability app id **6556** ("AXIS"), writing to `grafanacloud-logs`
  as `{service_name="AXIS"}` with `kind=event|exception|measurement`; rich per-line meta
  (app_version, session_id, anonymous user_id, browser/os, and the custom
  `context_kind/route/status/model/firmware` from `faroDeviceError()`).
- **Dashboards (already built):**
  - *Axis — Telemetry Overview* (`a629kf`): events/min by kind, errors/min, active sessions,
    by-version, recent logs.
  - *Axis — Fleet Errors* (`axis-fleet-errors`): 5xx stats, sessions hitting 5xx, engine
    timeouts, uncaught JS exceptions, 5xx by endpoint/version, top failing endpoints, device
    errors with model+firmware, filtered exception log — with an app-version variable.
- **Alert rules: none exist.** This is the biggest gap — nobody is watching the dashboards.
- **Volume note:** `kind=event` dominates (~10–12k rows per 6h under active use). Before the
  tester fleet grows, consider trimming Faro's console instrumentation to `warn`+ (or
  disabling console capture) to keep the Loki bill flat — errors and custom events carry the
  signal.

---

## 4. Monitoring improvement plan (phased, deliberately small)

### Phase 0 — unblock + watch (this week)

1. **CF Worker relay** (§2).
2. **Two alert rules** (Grafana-managed, on `grafanacloud-logs`):
   - *Error-rate spike per release* — fires when a release throws >30 exceptions in 15 min
     (tune after baseline):
     ```logql
     sum by (app_version) (
       count_over_time({service_name="AXIS", kind="exception"} | logfmt app_version [15m])
     ) > 30
     ```
   - *Collector silent* — fires when nothing at all arrives for 24 h (catches a broken relay,
     a broken key, or a bad release killing telemetry; set `no_data_state: Alerting`):
     ```logql
     sum(count_over_time({service_name="AXIS"}[24h])) < 1
     ```
   Contact point: email is enough for now.

### Phase 1 — make errors actionable (next release)

- **Source maps.** Stack traces in Loki are minified (`chunks/BmzvNrVa.js:1:2110`). Add
  `@grafana/faro-rollup-plugin` (Faro JavaScript bundler plugins) to the Vite build to upload
  source maps to Frontend Observability app 6556 at build time — de-minified traces in the
  Errors UI. *Action item: needs a Grafana Cloud access-policy token with `sourcemaps:write`,
  stored as a CI/build env var, never in the repo.*
- **Opt-in tester identity.** Keep the anonymous instance id as `user.id`; when a tester
  fills the existing contact/profile field *and* telemetry consent is on, attach it as a user
  attribute (`faro.api.setUser({ id: instanceId, attributes: { tester } })`). Makes "which
  tester hit this?" a one-click filter without collecting identity from anyone who didn't ask.
- **Device meta + custom events.** On detect/connect, `faro.api.pushEvent('device_connected',
  { model, firmware, transport })`; likewise `device_detect_failed`, `port_select`, and
  501-capability hits (the `faroDeviceError()` path already covers 5xx/network). This turns
  "AM4 users on fw X can't connect" into a queryable event stream instead of a support thread.

### Phase 2 — backend visibility (when a bug needs it)

The desktop backend is local, so *don't* stream ForgeFX logs by default. Two cheap steps:

- **Extend the existing debug-report upload** (`ForgeFX/server/src/telemetry.ts`,
  `uploadDebugReport` → Supabase `debug-reports`, already opt-in and brotli-packed): include
  the Faro `session_id` + instance id in the bundle header so a report can be joined against
  the RUM session that produced it. This is the highest-value/lowest-effort link.
- **Optional structured log forwarding:** a second Worker route (`/logs`) that accepts a
  small JSON batch from ForgeFX (Pino `warn`+ only, opt-in with the same consent flag) and
  pushes to the Loki push API with a scoped token held in the Worker. Label schema —
  **labels** (low cardinality): `app="forgefx"`, `env`, `release`; **structured metadata**
  (unbounded values, not indexed): `instance_id`, `device_model`, `firmware`, `tester`.
  Never put instance/tester/session ids in labels.

### Phase 3 — one overview dashboard + tidy-up

Consolidate into a single *Axis — Release Health* dashboard (extend `axis-fleet-errors`
rather than adding a third):

| Row | Panels | Source |
|---|---|---|
| Adoption | active sessions/day, instances by app_version | `kind=event` distinct `session_id`/`user_id` |
| JS errors | exceptions/min by `app_version`; top `value_template` groups | `kind=exception`, non-`axis-*` types |
| API health | 5xx rate by `context_route`; 501 capability hits; engine timeouts (`context_status=0`) | `type=~"axis-.*"` |
| Device | detect failures by `context_model` + `firmware`; `device_connected` funnel | Phase-1 events |

Plus: retention/usage check monthly (Loki free tier), and revisit the fuller
`observability-plan.md` (Alloy, OTel traces) only if log-level debugging proves insufficient.

---

## 5. Action-item summary (needs your credentials)

| # | Item | Where | Effort |
|---|---|---|---|
| 1 | Deploy relay Worker + DNS `ingest.axisapp.live` + `FARO_APP_KEY` secret | Cloudflare | ~30 min |
| 2 | Flip `AXIS_FARO_URL`, rebuild desktop app | ForgeFX `.env` / release | one line + release |
| 3 | Create the two alert rules + email contact point | Grafana Cloud | ~15 min |
| 4 | Source-map upload token (`sourcemaps:write`) for the build | Grafana Cloud → CI env | ~15 min |
| 5 | (Later) scoped Loki push token for the `/logs` Worker route | Grafana Cloud | Phase 2 |

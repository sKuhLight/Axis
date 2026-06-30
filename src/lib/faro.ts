// Live Faro RUM — dynamic-imported and only initialised when telemetry is enabled (AXIS_TELEMETRY=1)
// AND the user consented. Streams errors, console logs and web-vitals to the Grafana Faro collector.
// PII is scrubbed in beforeSend; the user is identified only by the anonymous instance id. This module
// is loaded lazily so builds/users without telemetry never download or run it.
import type { Faro, TransportItem } from '@grafana/faro-web-sdk';

let faro: Faro | null = null;

const scrub = (s: string): string =>
  s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/([Cc]:\\Users\\)[^\\/\r\n"]+/g, '$1<user>')
    .replace(/(\/(?:home|Users)\/)[^/\r\n"]+/g, '$1<user>');

/** Recursively scrub every string in a Faro item before it leaves the machine. */
function deepScrub(v: unknown): unknown {
  if (typeof v === 'string') return scrub(v);
  if (Array.isArray(v)) return v.map(deepScrub);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) o[k] = deepScrub(o[k]);
    return o;
  }
  return v;
}

/** Initialise Faro once. No-op if already started or no collector URL. */
export async function initFaro(opts: { url: string; version: string; instanceId: string }): Promise<void> {
  if (faro || !opts.url) return;
  const { initializeFaro, getWebInstrumentations } = await import('@grafana/faro-web-sdk');
  faro = initializeFaro({
    url: opts.url,
    app: { name: 'axis', version: opts.version, environment: 'production' },
    sessionTracking: { enabled: true },
    instrumentations: getWebInstrumentations(),
    beforeSend: (item: TransportItem) => deepScrub(item) as TransportItem
  });
  faro.api.setUser({ id: opts.instanceId }); // anonymous uuid — the only identifier we attach
}

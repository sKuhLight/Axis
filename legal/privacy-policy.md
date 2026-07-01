# Privacy Policy — Axis

_Last updated: [DATE]._

This policy explains what personal data Axis processes, why, and your rights under the EU General Data Protection Regulation (GDPR / DSGVO). Axis is an independent, third-party editor for Fractal Audio devices and is **not affiliated with Fractal Audio Systems**.

> **Short version:** The Axis app and its local engine run on **your** computer and talk to **your** device — that needs no account and sends us nothing. Personal data reaches us only if you (a) create an **Axis Cloud** account to back up/sync your presets, or (b) opt in to **anonymous diagnostics** / send a debug report. Both are optional and off by default. We never sell your data, show ads, or send your presets or preset names to our diagnostics.

## 1. Controller

The controller responsible for this processing is:

```
Pascal Peinelt
[c/o address from impressum-ohne-adresse.de]
[Postal code, City], Germany
Email: contact@axisapp.live
```

(See also the [Imprint](imprint.md).)

## 2. When no data reaches us

The Axis desktop app and its bundled engine (ForgeFX) run **locally**. Editing presets, reading your device, and local backups happen entirely on your machine and over your device's USB/MIDI connection. Using Axis this way requires **no account** and transmits **no personal data to us**.

## 3. Axis Cloud (optional account & sync)

If you create an Axis Cloud account, we process:

| Data | Purpose | Legal basis |
|---|---|---|
| Email address, password (stored only as a salted hash) | Create and authenticate your account | Art. 6(1)(b) — performance of the service you request |
| Account identifier | Link your synced data to your account | Art. 6(1)(b) |
| Your synced content: preset files (`.syx`), preset/scene names, block layouts, app configuration | Back up and sync your presets across your devices, at your request | Art. 6(1)(b) |

- **Processor:** account and storage are provided by **Supabase** (Supabase, Inc.). Data is stored in the project's configured region **[confirm: EU region]**. A Data Processing Agreement is in place. If any processing occurs outside the EU/EEA, it is covered by the EU Standard Contractual Clauses.
- Your preset content is **your data**; we access it only to provide sync and never analyse or share it.
- **Payments** (if/when a paid supporter tier launches) are handled by the payment provider **[Patreon / Stripe]**; we do not receive or store your card details. This section will be updated before any paid tier goes live.

## 4. Anonymous diagnostics (opt-in telemetry)

Diagnostics are **off by default** and only run if you explicitly enable them in **Privacy & Diagnostics**. When enabled, we collect, to find and fix bugs:

- a **random, anonymous instance ID** (a UUID generated on your device — not linked to your account, email, or name);
- app version, and your operating system, browser engine, and hardware/runtime versions;
- your **Fractal device model and firmware** (when known);
- **error reports** (error type, message, and stack trace — automatically scrubbed of emails and file-system user names before sending);
- basic **performance and usage events** (which app screen or request failed, page/resource timing, session identifier).

**We never collect** via diagnostics: your name, email, account ID, passwords or tokens, **preset names or preset content**, scene/setlist names, file contents, or full file-system paths.

- **Legal basis:** Art. 6(1)(a) — your consent. You can withdraw it at any time in Privacy & Diagnostics; withdrawal does not affect processing already carried out.
- **Processor:** telemetry is sent to **Grafana Cloud** (Grafana Labs) via Grafana Faro, in the **EU region (eu-west)**. Your IP address is processed transiently at ingestion for delivery and is not used to build a profile. A Data Processing Agreement is in place; EU Standard Contractual Clauses apply to any non-EU transfer.

## 5. Debug reports (on-demand)

If you choose to **"Send debug report"** (either from Privacy & Diagnostics or when prompted after an error), we upload a one-time diagnostic bundle: your current session's local debug log, recent app events, your device/OS/app versions, and the triggering error. It is **scrubbed of personal data** (emails, user names in paths) before leaving your machine, compressed, and stored keyed to your **anonymous instance ID**.

- **Legal basis:** Art. 6(1)(a) — your explicit, per-incident consent (the upload only happens when you press the button, even if live diagnostics are off).
- **Processor / storage:** Supabase Storage (see §3), in an access-restricted bucket.

## 6. Local storage on your device

Axis stores small technical values in your browser's local storage (e.g. your diagnostics consent choice, the anonymous instance ID, and UI preferences). These are **functional** and stay on your device — they are not tracking or advertising cookies, so no cookie banner is required. Clearing them resets your choices.

## 7. Retention

- **Account & synced content:** kept until you delete the item or your account.
- **Diagnostics telemetry:** retained by our observability provider for approximately **14 days**, then deleted automatically.
- **Debug reports:** kept up to **[e.g. 90 days]** for triage, then deleted.
- **Backups:** provider backups are retained per the provider's standard schedule (Supabase daily backups, 7 days on the current plan).

## 8. Your rights

Under the GDPR you have the right to: **access** your data (Art. 15), **rectification** (Art. 16), **erasure** (Art. 17), **restriction** (Art. 18), **data portability** (Art. 20), and to **object** (Art. 21). Where processing is based on consent, you may **withdraw** it at any time (Art. 7(3)).

- **Delete your account and synced data:** [describe the in-app or email path, e.g. "in Account → Delete account," or "email [contact email]"]. We will delete your account data without undue delay.
- To exercise any right, contact us at **[contact email]**.
- You also have the right to lodge a complaint with a supervisory authority — for Germany, your competent **Landesdatenschutzbehörde** ([your federal state's authority]).

## 9. Recipients & sharing

We do **not** sell or rent personal data, and we do not use it for advertising or profiling. Data is shared only with the processors named above (Supabase, Grafana Labs, and — for a future paid tier — the payment provider), strictly to operate the service, under Data Processing Agreements.

## 10. Children

Axis is not directed at children under 16. If you are under 16, please do not create an account without a parent/guardian's consent.

## 11. Changes

We may update this policy (e.g. when we add a processor or a paid tier). The current version is always published at **https://axisapp.live/privacy** with the "Last updated" date above. Material changes affecting consent will be surfaced in the app.

---

_Draft — not legal advice. Have this reviewed by a qualified data-protection lawyer, and confirm each processor's region and DPA, before public launch._

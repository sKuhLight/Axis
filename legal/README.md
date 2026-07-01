# Axis — legal documents

Review-ready drafts of the documents Axis needs before public registration / a paid tier. **Not legal advice** — have them reviewed (especially the Terms/liability and any payment clauses) before you rely on them.

| File | What | Status |
|---|---|---|
| `privacy-policy.md` | Datenschutzerklärung (GDPR Art. 13) — **required** before you take registrations or send telemetry | draft, fill placeholders |
| `imprint.md` | Impressum (§5 DDG) — **required**; needs your real name + reachable address | draft, fill placeholders |
| `terms.md` | Terms of Service — advisable now, **needs a lawyer before the paid tier** | draft |

## Fill-in checklist (search for `[ ... ]`)
- [ ] Operator **real name** (or entity + managing director) and a **reachable postal address** (use a c/o address service to avoid publishing your home address — the name still must be real).
- [ ] Contact **email**.
- [ ] **Confirm the Supabase project region** (privacy policy §3) — state EU explicitly if it is; otherwise adjust the transfer wording.
- [ ] Your competent **Landesdatenschutzbehörde** (supervisory authority) in the privacy policy §8.
- [ ] The **account/data deletion path** (privacy policy §8) — how a user deletes their account and data.
- [ ] Retention numbers you're comfortable with (debug-report retention, §7).
- [ ] Sign/accept the **DPAs (AVV)** with Supabase and Grafana Labs.
- [ ] Before the paid tier: rewrite the payment/withdrawal (Widerruf) sections + full lawyer review of `terms.md`.

## Hosting
Canonical domain: **axisapp.live**. Publish this folder so the pages are reachable at:
- https://axisapp.live/privacy
- https://axisapp.live/imprint
- https://axisapp.live/terms

The Imprint must be permanently, publicly available — the in-app copy alone is not enough. Simplest: publish via **GitHub Pages** (custom domain `axisapp.live`) or Netlify/Vercel. The app already links to these URLs (registration, Privacy & Diagnostics, consent dialog) via the desktop `openExternal` bridge. A single static page per doc is fine — you do not need a full website.

Consider an English + German version if you specifically target German users; English is defensible for an international, English-language service.

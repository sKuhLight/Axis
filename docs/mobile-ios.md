# Axis iOS (Capacitor shell)

The iOS app wraps the existing SvelteKit UI + the in-page ForgeFX runtime in a Capacitor
native shell. The device is reached over **native CoreMIDI** (USB / Bluetooth MIDI) via the
`AxisMidi` plugin, or over **Axis Remote** (relay to a desktop) which needs no native code.
FM3 USB-serial is out of scope on iOS — use a DIN/BLE MIDI adapter or Axis Remote.

Because there's no Mac in the loop, the IPA is produced entirely by CI (`macos-latest`) and
downloaded as a workflow artifact. It is **unsigned** — you sign it at install time with a free
Apple ID via **SideStore** (or AltStore / Sideloadly). No paid Apple Developer account, no signing
secrets, no certificate. iOS still won't launch an unsigned app; the sideload tool does the signing.

The only secrets used are `SUPABASE_URL` / `SUPABASE_ANON_KEY` (already set for the desktop release),
baked into the web bundle for cloud sync + Axis Remote. If absent, those features are just disabled.

## Build an IPA

Push a tag `ios-v*` (e.g. `ios-v0.8.0-beta.1`) — or run the **ios-unsigned** workflow manually once
it's on the default branch. It checks out the three sibling repos, builds codec → server → mobile web
bundle, `cap sync ios`, compiles an unsigned `.app`, zips it into `Payload/App.app` → `.ipa`, and
uploads it as the `axis-ios-unsigned` artifact.

## Install via SideStore

Download the `axis-ios-unsigned` artifact, unzip to get `Axis-unsigned.ipa`, and open it in SideStore
(Files → the IPA, or AltStore's "+"). SideStore re-signs it with your free Apple ID and installs.

Free-account limits: the app expires after **7 days** (SideStore refreshes it over its on-device
connection), and at most **3** sideloaded apps at once. SideStore may rewrite the bundle id — harmless
for testing. CoreMIDI, Bluetooth MIDI, and networking all work on a free account.

## OTA web updates (optional)

`mobile-ota` builds just the web bundle, zips it, and updates the rolling `ota-ios-latest`
prerelease with the zip + `latest-ios.json`. The installed app checks that manifest on launch and
self-updates its **web assets** (see `src/lib/direct/ota.ts`). Native/plugin changes still need a
new IPA — and bump `MIN_NATIVE` in `mobile-ota.yml` so older apps don't pull an incompatible bundle.

## Native code

- `ios/App/CapApp-SPM/Sources/CapApp-SPM/AxisMidiPlugin.swift` — Capacitor bridge (`AxisMidi`).
- `ios/App/CapApp-SPM/Sources/CapApp-SPM/AxisMidi.swift` — CoreMIDI engine. **Critical invariant:**
  it reassembles inbound SysEx to complete `F0…F7` frames before emitting the `sysex` event; the JS
  transport's quiet-window read assumes whole frames.

> The Swift was authored without a Mac to compile against — expect a CI round or two before the first
> green build. The pipeline (sign → archive → export) and the Axis Remote path work independently of
> the CoreMIDI plugin, so a booting, useful IPA doesn't depend on the native MIDI code being perfect.

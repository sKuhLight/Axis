# Axis iOS (Capacitor shell)

The iOS app wraps the existing SvelteKit UI + the in-page ForgeFX runtime in a Capacitor
native shell. The device is reached over **native CoreMIDI** (USB / Bluetooth MIDI) via the
`AxisMidi` plugin, or over **Axis Remote** (relay to a desktop) which needs no native code.
FM3 USB-serial is out of scope on iOS — use a DIN/BLE MIDI adapter or Axis Remote.

Because there's no Mac in the loop, the IPA is produced entirely by CI (`macos-latest`) and
downloaded as a workflow artifact for sideload.

## One-time setup: repository secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret | What it is |
|---|---|
| `IOS_CERTIFICATE_P12_BASE64` | `base64 -i cert.p12` — an Apple distribution or development signing cert |
| `IOS_CERTIFICATE_PASSWORD` | password for that `.p12` |
| `IOS_PROVISIONING_PROFILE_BASE64` | `base64 -i profile.mobileprovision` — an **ad-hoc** profile for app id `live.axisapp.axis`, containing each test iPhone's UDID |
| `APPLE_TEAM_ID` | your 10-character Apple Team ID |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | already used by the desktop release; baked into the web bundle for cloud sync + Axis Remote |

Creating the profile requires an Apple Developer account (paid). Add each tester's UDID to the
profile; adding a new device means regenerating the profile and rebuilding.

## Build an IPA

Run the **ios-adhoc** workflow (Actions tab → Run workflow), or push a tag `ios-v*`.
It checks out the three sibling repos, builds codec → server → mobile web bundle, `cap sync ios`,
signs, archives, exports an ad-hoc IPA, and uploads it as the `axis-ios-adhoc` artifact.

Install the IPA on a registered device via Apple Configurator, Xcode Devices, or a sideload tool.

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

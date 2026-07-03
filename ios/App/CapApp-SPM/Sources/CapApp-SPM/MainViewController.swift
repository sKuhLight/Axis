import Capacitor

// Root bridge view controller that registers app-local native plugins.
//
// Capacitor 8 does NOT auto-scan the Objective-C runtime for plugins — they come either from
// capacitor.config.json's generated packageClassList (npm plugins only) or from explicit
// registration here. AxisMidi lives in this app (not an npm package), so `cap sync` never lists it;
// without this it resolves as "not implemented on ios". AppDelegate makes this the root VC.
public class MainViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AxisMidiPlugin())
    }
}

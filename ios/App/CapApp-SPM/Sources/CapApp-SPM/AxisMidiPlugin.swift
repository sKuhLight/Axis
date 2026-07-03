import Foundation
import Capacitor
import CoreAudioKit
import UIKit

// Capacitor bridge for native MIDI (CoreMIDI). Lives in the CapApp-SPM library target, which links
// Capacitor and is linked into the app — so Capacitor discovers this CAPBridgedPlugin at runtime the
// same way it discovers third-party SPM plugins (no project.pbxproj registration needed).
//
// JS side: src/lib/direct/nativeMidi.ts. Events: notifyListeners("sysex", {frame:[…]}) — one COMPLETE
// F0…F7 frame per event (reassembled in AxisMidiEngine).
@objc(AxisMidiPlugin)
public class AxisMidiPlugin: CAPPlugin, CAPBridgedPlugin, UIAdaptivePresentationControllerDelegate {
    public let identifier = "AxisMidiPlugin"
    public let jsName = "AxisMidi"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "listEndpoints", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentBluetoothSetup", returnType: CAPPluginReturnPromise)
    ]

    private lazy var engine = AxisMidiEngine { [weak self] frame in
        self?.notifyListeners("sysex", data: ["frame": frame])
    }

    // Pending BLE-setup call, resolved when the sheet is dismissed (button or swipe).
    private var bluetoothCall: CAPPluginCall?

    @objc func listEndpoints(_ call: CAPPluginCall) {
        call.resolve(["endpoints": engine.listEndpoints()])
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("id is required"); return }
        do {
            try engine.connect(id: id)
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        engine.disconnect()
        call.resolve()
    }

    @objc func send(_ call: CAPPluginCall) {
        guard let raw = call.getArray("data") else { call.reject("data is required"); return }
        let bytes: [UInt8] = raw.compactMap { ($0 as? Int).map { UInt8(truncatingIfNeeded: $0) } }
        do {
            try engine.send(bytes: bytes)
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func presentBluetoothSetup(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let presenter = self.bridge?.viewController else {
                call.reject("no view controller available")
                return
            }
            self.bluetoothCall = call
            let central = CABTMIDICentralViewController()
            let nav = UINavigationController(rootViewController: central)
            nav.presentationController?.delegate = self
            central.navigationItem.leftBarButtonItem = UIBarButtonItem(
                systemItem: .done,
                primaryAction: UIAction { [weak self] _ in
                    nav.dismiss(animated: true) { self?.resolveBluetooth() }
                }
            )
            presenter.present(nav, animated: true)
        }
    }

    // Swipe-to-dismiss of the BLE sheet.
    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        resolveBluetooth()
    }

    private func resolveBluetooth() {
        bluetoothCall?.resolve()
        bluetoothCall = nil
    }
}

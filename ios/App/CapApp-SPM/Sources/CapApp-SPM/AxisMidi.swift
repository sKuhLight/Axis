import Foundation
import CoreMIDI

// CoreMIDI engine behind the AxisMidi Capacitor plugin. Enumerates paired endpoints, connects one
// source+destination pair, reassembles inbound SysEx into complete F0…F7 frames (CoreMIDI splits
// SysEx across MIDIPackets, especially over BLE/DIN), and sends on a serialized queue.
//
// NOTE: written without a Mac to compile against — expect to iterate via CI. Uses the legacy
// MIDIPacketList API (deprecation warnings, not errors) for straightforward SysEx handling.
final class AxisMidiEngine {
    struct MidiError: Error, LocalizedError {
        let msg: String
        var errorDescription: String? { msg }
    }

    private var client = MIDIClientRef()
    private var inputPort = MIDIPortRef()
    private var outputPort = MIDIPortRef()
    private var connectedSource: MIDIEndpointRef = 0
    private var connectedDest: MIDIEndpointRef = 0

    private var sysexBuffer: [UInt8] = []
    private var inSysex = false
    private let sendQueue = DispatchQueue(label: "live.axisapp.axis.midi.send")
    private let onFrame: ([Int]) -> Void

    init(onFrame: @escaping ([Int]) -> Void) {
        self.onFrame = onFrame
        MIDIClientCreateWithBlock("AxisMIDIClient" as CFString, &client) { _ in }
        MIDIInputPortCreateWithBlock(client, "AxisIn" as CFString, &inputPort) { [weak self] pktList, _ in
            self?.handlePackets(pktList)
        }
        MIDIOutputPortCreate(client, "AxisOut" as CFString, &outputPort)
    }

    // MARK: - Enumeration

    func listEndpoints() -> [[String: Any]] {
        var dests: [(name: String, ref: MIDIEndpointRef)] = []
        for i in 0..<MIDIGetNumberOfDestinations() {
            let d = MIDIGetDestination(i)
            dests.append((displayName(d), d))
        }

        var out: [[String: Any]] = []
        for i in 0..<MIDIGetNumberOfSources() {
            let s = MIDIGetSource(i)
            let name = displayName(s)
            let hasOutput = dests.contains { stem($0.name) == stem(name) }
            out.append([
                "id": String(uniqueID(s)),
                "name": name,
                "hasInput": true,
                "hasOutput": hasOutput,
                "fractal": looksFractal(name),
                "link": link(for: s, name: name)
            ])
        }
        // Fractal-looking devices first.
        out.sort { (($0["fractal"] as? Bool) ?? false ? 1 : 0) > (($1["fractal"] as? Bool) ?? false ? 1 : 0) }
        return out
    }

    // MARK: - Connect / disconnect

    func connect(id: String) throws {
        guard let uid = Int32(id) else { throw MidiError(msg: "invalid endpoint id") }
        disconnect()

        var source: MIDIEndpointRef = 0
        for i in 0..<MIDIGetNumberOfSources() where uniqueID(MIDIGetSource(i)) == uid {
            source = MIDIGetSource(i)
        }
        guard source != 0 else { throw MidiError(msg: "MIDI source no longer available") }

        let name = displayName(source)
        var dest: MIDIEndpointRef = 0
        for i in 0..<MIDIGetNumberOfDestinations() {
            let d = MIDIGetDestination(i)
            if stem(displayName(d)) == stem(name) { dest = d; break }
        }
        guard dest != 0 else { throw MidiError(msg: "no matching MIDI output for \(name)") }

        let status = MIDIPortConnectSource(inputPort, source, nil)
        guard status == noErr else { throw MidiError(msg: "MIDIPortConnectSource failed (\(status))") }
        connectedSource = source
        connectedDest = dest
        inSysex = false
        sysexBuffer = []
    }

    func disconnect() {
        if connectedSource != 0 {
            MIDIPortDisconnectSource(inputPort, connectedSource)
        }
        connectedSource = 0
        connectedDest = 0
    }

    // MARK: - Send (serialized)

    func send(bytes: [UInt8]) throws {
        guard connectedDest != 0 else { throw MidiError(msg: "not connected") }
        let dest = connectedDest
        let port = outputPort
        try sendQueue.sync {
            // Heap-allocate a correctly-aligned buffer big enough for the packet list header + data
            // (a bare MIDIPacketList struct only holds ~256 bytes; preset dumps are larger).
            let listSize = MemoryLayout<MIDIPacketList>.size + bytes.count + 64
            let listPtr = UnsafeMutableRawPointer
                .allocate(byteCount: listSize, alignment: MemoryLayout<MIDIPacketList>.alignment)
                .bindMemory(to: MIDIPacketList.self, capacity: 1)
            defer { listPtr.deallocate() }

            var packet = MIDIPacketListInit(listPtr)
            packet = MIDIPacketListAdd(listPtr, listSize, packet, 0, bytes.count, bytes)
            guard packet != nil else { throw MidiError(msg: "MIDI frame too large to send") }
            let status = MIDISend(port, dest, listPtr)
            guard status == noErr else { throw MidiError(msg: "MIDISend failed (\(status))") }
        }
    }

    // MARK: - Receive + SysEx reassembly

    private func handlePackets(_ pktList: UnsafePointer<MIDIPacketList>) {
        var packet = pktList.pointee.packet
        for _ in 0..<pktList.pointee.numPackets {
            let length = Int(packet.length)
            // packet.data is a nominal 256-byte tuple but the real payload can be longer and is
            // contiguous in the list — read `length` bytes from its base to avoid truncation.
            withUnsafePointer(to: &packet.data) { tuplePtr in
                tuplePtr.withMemoryRebound(to: UInt8.self, capacity: length) { bytePtr in
                    ingest(UnsafeBufferPointer(start: bytePtr, count: length))
                }
            }
            packet = MIDIPacketNext(&packet).pointee
        }
    }

    /// Byte-level SysEx reassembly: buffer from F0 to F7, emitting one complete frame. Real-time
    /// bytes (0xF8–0xFF) may be interleaved inside a SysEx per the MIDI spec — skip them.
    private func ingest(_ bytes: UnsafeBufferPointer<UInt8>) {
        for b in bytes {
            if b == 0xF0 {
                inSysex = true
                sysexBuffer = [b]
            } else if inSysex {
                if b >= 0xF8 { continue } // interleaved real-time — ignore
                sysexBuffer.append(b)
                if b == 0xF7 {
                    let frame = sysexBuffer.map { Int($0) }
                    sysexBuffer = []
                    inSysex = false
                    onFrame(frame)
                }
            }
            // Non-SysEx channel/status bytes outside a SysEx are ignored — Axis speaks SysEx only.
        }
    }

    // MARK: - Endpoint properties

    private func uniqueID(_ ref: MIDIObjectRef) -> Int32 {
        var uid: Int32 = 0
        MIDIObjectGetIntegerProperty(ref, kMIDIPropertyUniqueID, &uid)
        return uid
    }

    private func displayName(_ ref: MIDIObjectRef) -> String {
        var name: Unmanaged<CFString>?
        let status = MIDIObjectGetStringProperty(ref, kMIDIPropertyDisplayName, &name)
        if status == noErr, let n = name?.takeRetainedValue() { return n as String }
        return "MIDI Device"
    }

    /// Physical-link best-effort. USB is full-speed; BLE / a DIN interface are the slow path. There's
    /// no direct CoreMIDI "is USB" flag, so infer from the name (BLE/WIDI adapters advertise it).
    private func link(for ref: MIDIEndpointRef, name: String) -> String {
        let n = name.lowercased()
        if n.contains("bluetooth") || n.contains("ble") || n.contains("widi") { return "ble" }
        if n.contains("din") { return "din" }
        return "usb"
    }

    private func looksFractal(_ name: String) -> Bool {
        let n = name.lowercased()
        for needle in ["fractal", "axe-fx", "axe fx", "axefx", "fm3", "fm-3", "fm9", "fm-9", "am4", "am-4", "vp4", "vp-4"] {
            if n.contains(needle) { return true }
        }
        return false
    }

    /// Normalize an endpoint name so an input and its paired output match (drop in/out words).
    private func stem(_ name: String) -> String {
        var s = name.lowercased()
        for word in [" input", " output", " in", " out", " rx", " tx"] {
            s = s.replacingOccurrences(of: word, with: "")
        }
        return s.trimmingCharacters(in: .whitespaces)
    }
}

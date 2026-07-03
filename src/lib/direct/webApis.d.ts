// Ambient declarations for browser device APIs the Browser Direct mode uses.
// TypeScript's lib.dom doesn't ship Web MIDI or Web Serial (they're WICG /
// working-draft specs), and its File System Access surface misses the picker
// + iteration bits — declared here minimally instead of pulling three
// @types/* packages for a handful of interfaces. Only what we call is typed.

// ── Web MIDI (https://webaudio.github.io/web-midi-api/) ──
interface MIDIOptions {
  sysex?: boolean;
  software?: boolean;
}
type MIDIPortConnectionState = 'open' | 'closed' | 'pending';
type MIDIPortDeviceState = 'disconnected' | 'connected';
interface MIDIPort extends EventTarget {
  readonly id: string;
  readonly name: string | null;
  readonly manufacturer: string | null;
  readonly type: 'input' | 'output';
  readonly state: MIDIPortDeviceState;
  readonly connection: MIDIPortConnectionState;
  onstatechange: ((e: Event) => void) | null;
  open(): Promise<MIDIPort>;
  close(): Promise<MIDIPort>;
}
interface MIDIMessageEvent extends Event {
  readonly data: Uint8Array | null;
}
interface MIDIInput extends MIDIPort {
  onmidimessage: ((e: MIDIMessageEvent) => void) | null;
}
interface MIDIOutput extends MIDIPort {
  send(data: number[] | Uint8Array, timestamp?: number): void;
  clear(): void;
}
interface MIDIInputMap extends ReadonlyMap<string, MIDIInput> {}
interface MIDIOutputMap extends ReadonlyMap<string, MIDIOutput> {}
interface MIDIAccess extends EventTarget {
  readonly inputs: MIDIInputMap;
  readonly outputs: MIDIOutputMap;
  readonly sysexEnabled: boolean;
  onstatechange: ((e: Event) => void) | null;
}

// ── Web Serial (https://wicg.github.io/serial/) ──
interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}
interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'even' | 'odd';
  bufferSize?: number;
  flowControl?: 'none' | 'hardware';
}
interface SerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  getInfo(): SerialPortInfo;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  forget(): Promise<void>;
}
interface SerialPortRequestOptions {
  filters?: Array<{ usbVendorId?: number; usbProductId?: number }>;
}
interface Serial extends EventTarget {
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

interface Navigator {
  requestMIDIAccess(options?: MIDIOptions): Promise<MIDIAccess>;
  readonly serial?: Serial;
}

// ── File System Access additions (picker + permissions + iteration) ──
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}
interface FileSystemHandle {
  queryPermission?(desc?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(desc?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}
interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
}
interface Window {
  showDirectoryPicker?(options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: string;
  }): Promise<FileSystemDirectoryHandle>;
}

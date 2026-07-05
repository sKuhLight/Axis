export class SerialPort {
  static async list(): Promise<unknown[]> {
    return [];
  }

  constructor() {
    throw new Error('serialport is a Node-only transport and is not available in the Axis browser bundle.');
  }
}

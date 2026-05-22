export type PacketHandler = (packet: Uint8Array) => void

export interface MeshTransport {
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  send(packet: Uint8Array): Promise<void>
  subscribe(handler: PacketHandler): () => void
}

export class LoopbackTransport implements MeshTransport {
  private handlers: PacketHandler[] = []
  private connected = true

  async connect(): Promise<void> {
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  async send(packet: Uint8Array): Promise<void> {
    if (!this.connected) {
      throw new Error('Transport is not connected.')
    }
    this.handlers.forEach((handler) => handler(packet))
  }

  subscribe(handler: PacketHandler): () => void {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter((entry) => entry !== handler)
    }
  }
}

type SerialPortLike = {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
}

type SerialApiLike = {
  requestPort(): Promise<SerialPortLike>
}

type BluetoothRemoteGATTCharacteristicLike = {
  writeValue(data: BufferSource): Promise<void>
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristicLike>
  addEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void
  removeEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void
}

type BluetoothServiceLike = {
  getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristicLike>
}

type BluetoothServerLike = {
  connect(): Promise<BluetoothServerLike>
  disconnect(): void
  connected: boolean
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothServiceLike>
}

type BluetoothDeviceLike = {
  gatt: BluetoothServerLike | null
}

type RequestDeviceOptionsLike = {
  acceptAllDevices: boolean
  optionalServices?: BluetoothServiceUUID[]
}

type BluetoothApiLike = {
  requestDevice(options?: RequestDeviceOptionsLike): Promise<BluetoothDeviceLike>
}

const NORDIC_UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const NORDIC_UART_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'
const NORDIC_UART_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'

export const getWebSerialApi = (): SerialApiLike | null => {
  if (typeof navigator === 'undefined' || !('serial' in navigator)) {
    return null
  }
  return navigator.serial as unknown as SerialApiLike
}

export const getWebBluetoothApi = (): BluetoothApiLike | null => {
  if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
    return null
  }
  return navigator.bluetooth as unknown as BluetoothApiLike
}

export class SerialTransport implements MeshTransport {
  private handlers: PacketHandler[] = []
  private connected = false
  private serialApi: SerialApiLike | null
  private port: SerialPortLike | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private readLoopPromise: Promise<void> | null = null
  private pendingBytes: number[] = []

  constructor(serialApi: SerialApiLike | null = getWebSerialApi()) {
    this.serialApi = serialApi
  }

  async connect(): Promise<void> {
    if (this.connected) return
    if (!this.serialApi) {
      throw new Error('Web Serial is not supported in this browser.')
    }

    const selectedPort = await this.serialApi.requestPort()
    await selectedPort.open({ baudRate: 115200 })
    if (!selectedPort.readable || !selectedPort.writable) {
      await selectedPort.close()
      throw new Error('Selected serial device does not expose readable/writable streams.')
    }

    this.port = selectedPort
    this.reader = selectedPort.readable.getReader()
    this.writer = selectedPort.writable.getWriter()
    this.connected = true
    this.readLoopPromise = this.readLoop()
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.pendingBytes = []

    if (this.reader) {
      try {
        await this.reader.cancel()
      } catch {
        // ignore cancel errors from already-closed streams
      }
      this.reader.releaseLock()
      this.reader = null
    }

    if (this.writer) {
      this.writer.releaseLock()
      this.writer = null
    }

    if (this.port) {
      await this.port.close()
      this.port = null
    }

    if (this.readLoopPromise) {
      await this.readLoopPromise
      this.readLoopPromise = null
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  async send(packet: Uint8Array): Promise<void> {
    if (!this.connected || !this.writer) {
      throw new Error('Transport is not connected.')
    }
    if (packet.length === 0 || packet.length > 255) {
      throw new Error('Serial frame payload must be between 1 and 255 bytes.')
    }

    const framed = new Uint8Array(packet.length + 1)
    framed[0] = packet.length
    framed.set(packet, 1)
    await this.writer.write(framed)
  }

  subscribe(handler: PacketHandler): () => void {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter((entry) => entry !== handler)
    }
  }

  private async readLoop(): Promise<void> {
    while (this.connected && this.reader) {
      const { value, done } = await this.reader.read()
      if (done) {
        break
      }
      if (value) {
        this.consumeFrames(value)
      }
    }
  }

  private consumeFrames(bytes: Uint8Array): void {
    this.pendingBytes.push(...bytes)

    while (this.pendingBytes.length > 0) {
      const frameLength = this.pendingBytes[0]
      if (frameLength === 0) {
        this.pendingBytes.shift()
        continue
      }
      if (this.pendingBytes.length < frameLength + 1) {
        return
      }

      const payload = this.pendingBytes.slice(1, frameLength + 1)
      this.pendingBytes = this.pendingBytes.slice(frameLength + 1)
      const packet = new Uint8Array(payload)
      this.handlers.forEach((handler) => handler(packet))
    }
  }
}

export class BluetoothTransport implements MeshTransport {
  private handlers: PacketHandler[] = []
  private connected = false
  private bluetoothApi: BluetoothApiLike | null
  private device: BluetoothDeviceLike | null = null
  private server: BluetoothServerLike | null = null
  private txCharacteristic: BluetoothRemoteGATTCharacteristicLike | null = null
  private rxCharacteristic: BluetoothRemoteGATTCharacteristicLike | null = null
  private pendingBytes: number[] = []

  private readonly onCharacteristicValue = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic | null
    const value = target?.value
    if (!value) {
      return
    }
    this.consumeFrames(new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)))
  }

  constructor(bluetoothApi: BluetoothApiLike | null = getWebBluetoothApi()) {
    this.bluetoothApi = bluetoothApi
  }

  async connect(): Promise<void> {
    if (this.connected) return
    if (!this.bluetoothApi) {
      throw new Error('Web Bluetooth is not supported in this browser.')
    }

    const selectedDevice = await this.bluetoothApi.requestDevice({
      acceptAllDevices: true,
      optionalServices: [NORDIC_UART_SERVICE_UUID],
    })
    const server = selectedDevice.gatt
    if (!server) {
      throw new Error('Selected Bluetooth device does not expose a GATT server.')
    }

    await server.connect()
    const service = await server.getPrimaryService(NORDIC_UART_SERVICE_UUID)
    const rx = await service.getCharacteristic(NORDIC_UART_RX_UUID)
    const tx = await service.getCharacteristic(NORDIC_UART_TX_UUID)
    await tx.startNotifications()
    tx.addEventListener('characteristicvaluechanged', this.onCharacteristicValue)

    this.device = selectedDevice
    this.server = server
    this.rxCharacteristic = rx
    this.txCharacteristic = tx
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.pendingBytes = []
    this.connected = false

    if (this.txCharacteristic) {
      this.txCharacteristic.removeEventListener('characteristicvaluechanged', this.onCharacteristicValue)
      this.txCharacteristic = null
    }

    this.rxCharacteristic = null

    if (this.server?.connected) {
      this.server.disconnect()
    }

    this.server = null
    this.device = null
  }

  isConnected(): boolean {
    return this.connected
  }

  async send(packet: Uint8Array): Promise<void> {
    if (!this.connected || !this.rxCharacteristic) {
      throw new Error('Transport is not connected.')
    }
    if (packet.length === 0 || packet.length > 255) {
      throw new Error('Bluetooth frame payload must be between 1 and 255 bytes.')
    }

    const framed = new Uint8Array(packet.length + 1)
    framed[0] = packet.length
    framed.set(packet, 1)
    await this.rxCharacteristic.writeValue(framed)
  }

  subscribe(handler: PacketHandler): () => void {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter((entry) => entry !== handler)
    }
  }

  private consumeFrames(bytes: Uint8Array): void {
    this.pendingBytes.push(...bytes)

    while (this.pendingBytes.length > 0) {
      const frameLength = this.pendingBytes[0]
      if (frameLength === 0) {
        this.pendingBytes.shift()
        continue
      }
      if (this.pendingBytes.length < frameLength + 1) {
        return
      }

      const payload = this.pendingBytes.slice(1, frameLength + 1)
      this.pendingBytes = this.pendingBytes.slice(frameLength + 1)
      const packet = new Uint8Array(payload)
      this.handlers.forEach((handler) => handler(packet))
    }
  }
}

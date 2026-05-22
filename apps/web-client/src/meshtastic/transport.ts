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

export const getWebSerialApi = (): SerialApiLike | null => {
  if (typeof navigator === 'undefined' || !('serial' in navigator)) {
    return null
  }
  return navigator.serial as unknown as SerialApiLike
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

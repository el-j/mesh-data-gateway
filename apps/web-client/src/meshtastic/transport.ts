export type PacketHandler = (packet: Uint8Array) => void

export interface MeshTransport {
  connect(): Promise<void>
  send(packet: Uint8Array): Promise<void>
  subscribe(handler: PacketHandler): void
}

export class LoopbackTransport implements MeshTransport {
  private handlers: PacketHandler[] = []

  async connect(): Promise<void> {
    return Promise.resolve()
  }

  async send(packet: Uint8Array): Promise<void> {
    this.handlers.forEach((handler) => handler(packet))
  }

  subscribe(handler: PacketHandler): void {
    this.handlers.push(handler)
  }
}

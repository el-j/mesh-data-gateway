export const MAX_PACKET_SIZE = 200
export const HEADER_SIZE = 4
export const MAX_PAYLOAD_SIZE = MAX_PACKET_SIZE - HEADER_SIZE

export enum RouteId {
  HumanChat = 0x01,
  McpRequest = 0x02,
  Telegram = 0x03,
  IotControl = 0x04,
}

export type DecodedPacket = {
  routeId: number
  messageId: number
  chunkIndex: number
  totalChunks: number
  payloadBytes: Uint8Array
  payloadText: string
}

export type ReassembledMessage = {
  routeId: number
  messageId: number
  payloadText: string
  totalChunks: number
}

type PendingMessage = {
  totalChunks: number
  chunks: Map<number, Uint8Array>
  createdAt: number
}

export class ProtocolCodec {
  private readonly enc = new TextEncoder()
  private readonly dec = new TextDecoder()

  compress(text: string): Uint8Array {
    return this.enc.encode(text)
  }

  decompress(data: Uint8Array): string {
    return this.dec.decode(data)
  }

  encodeChunks(routeId: number, payloadText: string, messageId: number): Uint8Array[] {
    if (routeId < 0 || routeId > 255) {
      throw new Error('routeId must fit in one byte')
    }
    if (messageId < 0 || messageId > 255) {
      throw new Error('messageId must fit in one byte')
    }

    const compressed = this.compress(payloadText)
    const dataChunks = compressed.length
      ? Array.from({ length: Math.ceil(compressed.length / MAX_PAYLOAD_SIZE) }, (_, i) =>
          compressed.slice(i * MAX_PAYLOAD_SIZE, (i + 1) * MAX_PAYLOAD_SIZE),
        )
      : [new Uint8Array()]

    return dataChunks.map((chunk, idx) => {
      const header = new Uint8Array([routeId, messageId, idx + 1, dataChunks.length])
      const packet = new Uint8Array(header.length + chunk.length)
      packet.set(header)
      packet.set(chunk, HEADER_SIZE)
      return packet
    })
  }

  decodePacket(packet: Uint8Array): DecodedPacket {
    if (packet.length < HEADER_SIZE) {
      throw new Error('Packet must be at least 4 bytes')
    }

    const routeId = packet[0]
    const messageId = packet[1]
    const chunkIndex = packet[2]
    const totalChunks = packet[3]

    if (chunkIndex < 1) {
      throw new Error('chunkIndex must be >= 1')
    }
    if (totalChunks < 1) {
      throw new Error('totalChunks must be >= 1')
    }
    if (chunkIndex > totalChunks) {
      throw new Error('chunkIndex cannot exceed totalChunks')
    }

    const payloadBytes = packet.slice(HEADER_SIZE)
    return {
      routeId,
      messageId,
      chunkIndex,
      totalChunks,
      payloadBytes,
      payloadText: this.decompress(payloadBytes),
    }
  }
}

export class ReassemblyBuffer {
  private readonly pending = new Map<string, PendingMessage>()

  constructor(
    private readonly codec: ProtocolCodec,
    private readonly timeoutSeconds = 60,
    private readonly nowFn: () => number = () => Date.now() / 1000,
  ) {}

  addPacket(packet: Uint8Array): ReassembledMessage | null {
    const decoded = this.codec.decodePacket(packet)
    const key = `${decoded.routeId}-${decoded.messageId}`
    const existing = this.pending.get(key)

    if (!existing) {
      this.pending.set(key, {
        totalChunks: decoded.totalChunks,
        chunks: new Map([[decoded.chunkIndex, decoded.payloadBytes]]),
        createdAt: this.nowFn(),
      })
      return decoded.totalChunks === 1
        ? this.completeAndRemove(key, decoded.routeId, decoded.messageId)
        : null
    }

    if (existing.totalChunks !== decoded.totalChunks) {
      throw new Error('Received packet with inconsistent total chunks')
    }

    existing.chunks.set(decoded.chunkIndex, decoded.payloadBytes)
    if (existing.chunks.size !== existing.totalChunks) {
      return null
    }

    return this.completeAndRemove(key, decoded.routeId, decoded.messageId)
  }

  expireStale(): number {
    const now = this.nowFn()
    const stale = [...this.pending.entries()]
      .filter(([, pending]) => now - pending.createdAt > this.timeoutSeconds)
      .map(([key]) => key)

    stale.forEach((key) => this.pending.delete(key))
    return stale.length
  }

  private completeAndRemove(key: string, routeId: number, messageId: number): ReassembledMessage {
    const pending = this.pending.get(key)!

    const payload = new Uint8Array(
      [...Array.from({ length: pending.totalChunks }, (_, i) => i + 1)]
        .map((idx) => pending.chunks.get(idx)!)
        .reduce((acc, cur) => acc + cur.length, 0),
    )

    let offset = 0
    for (let i = 1; i <= pending.totalChunks; i += 1) {
      const chunk = pending.chunks.get(i)!
      payload.set(chunk, offset)
      offset += chunk.length
    }

    this.pending.delete(key)
    return {
      routeId,
      messageId,
      totalChunks: pending.totalChunks,
      payloadText: this.codec.decompress(payload),
    }
  }
}

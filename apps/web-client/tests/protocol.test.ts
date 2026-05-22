import { describe, expect, it } from 'vitest'
import { MAX_PAYLOAD_SIZE, ProtocolCodec, ReassemblyBuffer, RouteId } from '../src/lib/protocol'

describe('ProtocolCodec', () => {
  it('encodes and decodes one chunk', () => {
    const codec = new ProtocolCodec()
    const packets = codec.encodeChunks(RouteId.HumanChat, 'hello', 9)
    expect(packets).toHaveLength(1)

    const decoded = codec.decodePacket(packets[0])
    expect(decoded.routeId).toBe(RouteId.HumanChat)
    expect(decoded.messageId).toBe(9)
    expect(decoded.chunkIndex).toBe(1)
    expect(decoded.totalChunks).toBe(1)
    expect(decoded.payloadText).toBe('hello')
  })

  it('encodes multi-chunk payload', () => {
    const codec = new ProtocolCodec()
    const payload = 'x'.repeat(MAX_PAYLOAD_SIZE + 1)
    const packets = codec.encodeChunks(RouteId.McpRequest, payload, 1)
    expect(packets).toHaveLength(2)
  })

  it('encodes empty payload into a single packet', () => {
    const codec = new ProtocolCodec()
    const packets = codec.encodeChunks(RouteId.HumanChat, '', 42)
    expect(packets).toHaveLength(1)
    expect(codec.decodePacket(packets[0]).payloadText).toBe('')
  })

  it('throws for short packets', () => {
    const codec = new ProtocolCodec()
    expect(() => codec.decodePacket(new Uint8Array([1, 2, 3]))).toThrow(/at least 4 bytes/)
  })
})

describe('ReassemblyBuffer', () => {
  it('reassembles out-of-order packets', () => {
    const codec = new ProtocolCodec()
    const packets = codec.encodeChunks(RouteId.Telegram, 'z'.repeat(MAX_PAYLOAD_SIZE * 2 + 3), 55)
    const now = { value: 1 }
    const buf = new ReassemblyBuffer(codec, 60, () => now.value)

    expect(buf.addPacket(packets[1])).toBeNull()
    expect(buf.addPacket(packets[0])).toBeNull()
    const done = buf.addPacket(packets[2])
    expect(done?.payloadText).toBe('z'.repeat(MAX_PAYLOAD_SIZE * 2 + 3))
  })

  it('expires stale entries', () => {
    const codec = new ProtocolCodec()
    const now = { value: 0 }
    const buf = new ReassemblyBuffer(codec, 5, () => now.value)
    const packets = codec.encodeChunks(RouteId.IotControl, 'x'.repeat(MAX_PAYLOAD_SIZE + 1), 2)
    buf.addPacket(packets[0])
    now.value = 10
    expect(buf.expireStale()).toBe(1)
  })

  it('throws on invalid route/message bytes and inconsistent totals', () => {
    const codec = new ProtocolCodec()
    expect(() => codec.encodeChunks(999, 'abc', 1)).toThrow(/routeId/)
    expect(() => codec.encodeChunks(RouteId.HumanChat, 'abc', 999)).toThrow(/messageId/)
    expect(() => codec.decodePacket(new Uint8Array([1, 2, 0, 1]))).toThrow(/chunkIndex/)
    expect(() => codec.decodePacket(new Uint8Array([1, 2, 1, 0]))).toThrow(/totalChunks/)
    expect(() => codec.decodePacket(new Uint8Array([1, 2, 2, 1]))).toThrow(/cannot exceed/)

    const packets = codec.encodeChunks(RouteId.HumanChat, 'abc', 3)
    const tampered = packets[0].slice()
    tampered[3] = 2
    const buf = new ReassemblyBuffer(codec)
    buf.addPacket(tampered)
    expect(() => buf.addPacket(packets[0])).toThrow(/inconsistent/)
  })
})

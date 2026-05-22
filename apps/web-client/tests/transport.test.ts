import { describe, expect, it } from 'vitest'

import { getWebSerialApi, LoopbackTransport, SerialTransport } from '../src/meshtastic/transport'

type MockSerialPort = {
  open: (options: { baudRate: number }) => Promise<void>
  close: () => Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
}

const createMockSerialContext = (chunks: Uint8Array[]) => {
  const writes: Uint8Array[] = []
  const openCalls: number[] = []
  let closeCallCount = 0

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk))
      controller.close()
    },
  })

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      writes.push(new Uint8Array(chunk))
    },
  })

  const port: MockSerialPort = {
    open: async ({ baudRate }) => {
      openCalls.push(baudRate)
    },
    close: async () => {
      closeCallCount += 1
    },
    readable,
    writable,
  }

  return {
    writes,
    openCalls,
    getCloseCallCount: () => closeCallCount,
    serialApi: {
      requestPort: async () => port,
    },
  }
}

describe('LoopbackTransport', () => {
  it('connects and loops sent packets to subscribers', async () => {
    const transport = new LoopbackTransport()
    const received: number[] = []

    transport.subscribe((packet) => received.push(packet[0]))
    await transport.connect()
    await transport.send(new Uint8Array([7]))

    expect(received).toEqual([7])
    expect(transport.isConnected()).toBe(true)
  })

  it('throws when send is called while disconnected', async () => {
    const transport = new LoopbackTransport()
    await transport.disconnect()
    await expect(transport.send(new Uint8Array([1]))).rejects.toThrow(/not connected/i)
  })

  it('unsubscribes handlers', async () => {
    const transport = new LoopbackTransport()
    const received: number[] = []
    const unsubscribe = transport.subscribe((packet) => received.push(packet[0]))

    unsubscribe()
    await transport.connect()
    await transport.send(new Uint8Array([3]))

    expect(received).toEqual([])
  })
})

describe('SerialTransport', () => {
  it('connects, sends framed packets, and receives framed packets', async () => {
    const context = createMockSerialContext([new Uint8Array([2, 9, 8, 1, 7])])
    const transport = new SerialTransport(context.serialApi)
    const received: number[] = []
    transport.subscribe((packet) => received.push(...packet))

    await transport.connect()
    await transport.send(new Uint8Array([4, 5]))
    await transport.disconnect()

    expect(transport.isConnected()).toBe(false)
    expect(context.openCalls).toEqual([115200])
    expect(context.getCloseCallCount()).toBe(1)
    expect(context.writes).toEqual([new Uint8Array([2, 4, 5])])
    expect(received).toEqual([9, 8, 7])
  })

  it('returns early when connect is called while already connected', async () => {
    const context = createMockSerialContext([])
    const transport = new SerialTransport(context.serialApi)

    await transport.connect()
    await transport.connect()
    await transport.disconnect()

    expect(context.openCalls).toEqual([115200])
  })

  it('handles zero-length and partial serial frames', async () => {
    const context = createMockSerialContext([new Uint8Array([0, 3, 1, 2]), new Uint8Array([3])])
    const transport = new SerialTransport(context.serialApi)
    const received: number[] = []
    transport.subscribe((packet) => received.push(...packet))

    await transport.connect()
    await Promise.resolve()
    await transport.disconnect()

    expect(received).toEqual([1, 2, 3])
  })

  it('throws for unsupported browser serial', async () => {
    const transport = new SerialTransport(null)
    await expect(transport.connect()).rejects.toThrow(/not supported/i)
  })

  it('throws when payload size is invalid', async () => {
    const context = createMockSerialContext([])
    const transport = new SerialTransport(context.serialApi)
    await transport.connect()

    await expect(transport.send(new Uint8Array())).rejects.toThrow(/between 1 and 255/i)
    await expect(transport.send(new Uint8Array(256))).rejects.toThrow(/between 1 and 255/i)
  })

  it('throws when send is called while disconnected', async () => {
    const context = createMockSerialContext([])
    const transport = new SerialTransport(context.serialApi)
    await expect(transport.send(new Uint8Array([1]))).rejects.toThrow(/not connected/i)
  })

  it('throws when selected serial port has no streams', async () => {
    const transport = new SerialTransport({
      requestPort: async () => ({
        open: async () => {},
        close: async () => {},
        readable: null,
        writable: null,
      }),
    })

    await expect(transport.connect()).rejects.toThrow(/does not expose readable\/writable streams/i)
  })

  it('supports subscribe cleanup', async () => {
    const context = createMockSerialContext([new Uint8Array([1, 6])])
    const transport = new SerialTransport(context.serialApi)
    const received: number[] = []
    const unsubscribe = transport.subscribe((packet) => received.push(...packet))
    unsubscribe()

    await transport.connect()
    await transport.disconnect()

    expect(received).toEqual([])
  })

  it('ignores reader cancel errors during disconnect', async () => {
    const writer = new WritableStream<Uint8Array>()
    const transport = new SerialTransport({
      requestPort: async () =>
        ({
          open: async () => {},
          close: async () => {},
          readable: {
            getReader: () =>
              ({
                read: async () => ({ done: true, value: undefined }),
                cancel: async () => {
                  throw new Error('cancel failed')
                },
                releaseLock: () => {},
              }) as ReadableStreamDefaultReader<Uint8Array>,
          } as ReadableStream<Uint8Array>,
          writable: writer,
        }) as unknown as MockSerialPort,
    })

    await transport.connect()
    await expect(transport.disconnect()).resolves.toBeUndefined()
  })
})

describe('getWebSerialApi', () => {
  it('returns null when browser serial is not available', () => {
    expect(getWebSerialApi()).toBe(null)
  })

  it('returns browser serial implementation when available', () => {
    Object.defineProperty(window.navigator, 'serial', {
      configurable: true,
      value: { requestPort: async () => ({}) },
    })

    expect(getWebSerialApi()).not.toBe(null)
    Reflect.deleteProperty(window.navigator, 'serial')
  })
})

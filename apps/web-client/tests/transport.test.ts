import { describe, expect, it } from 'vitest'

import {
  BluetoothTransport,
  getWebBluetoothApi,
  getWebSerialApi,
  LoopbackTransport,
  SerialTransport,
} from '../src/meshtastic/transport'

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

type BluetoothListener = (event: Event) => void

const createMockBluetoothContext = () => {
  const writes: Uint8Array[] = []
  const requestCalls: Array<{ acceptAllDevices: boolean; optionalServices?: BluetoothServiceUUID[] }> = []
  const listeners: BluetoothListener[] = []
  let serverConnected = false
  let serverDisconnectCalls = 0

  const txCharacteristic = {
    startNotifications: async () => txCharacteristic,
    addEventListener: (_type: 'characteristicvaluechanged', listener: BluetoothListener) => {
      listeners.push(listener)
    },
    removeEventListener: (_type: 'characteristicvaluechanged', listener: BluetoothListener) => {
      const idx = listeners.indexOf(listener)
      if (idx >= 0) {
        listeners.splice(idx, 1)
      }
    },
    writeValue: async (_data: BufferSource) => {
      throw new Error('tx characteristic should not be written in this transport')
    },
  }

  const rxCharacteristic = {
    startNotifications: async () => rxCharacteristic,
    addEventListener: (_type: 'characteristicvaluechanged', _listener: BluetoothListener) => {},
    removeEventListener: (_type: 'characteristicvaluechanged', _listener: BluetoothListener) => {},
    writeValue: async (data: BufferSource) => {
      writes.push(new Uint8Array(data as ArrayBuffer))
    },
  }

  const service = {
    getCharacteristic: async (characteristic: BluetoothCharacteristicUUID) => {
      if (String(characteristic).endsWith('0002-b5a3-f393-e0a9-e50e24dcca9e')) {
        return rxCharacteristic
      }
      return txCharacteristic
    },
  }

  const server = {
    get connected() {
      return serverConnected
    },
    connect: async () => {
      serverConnected = true
      return server
    },
    disconnect: () => {
      serverDisconnectCalls += 1
      serverConnected = false
    },
    getPrimaryService: async (_service: BluetoothServiceUUID) => service,
  }

  const device = { gatt: server }
  const bluetoothApi = {
    requestDevice: async (options?: { acceptAllDevices: boolean; optionalServices?: BluetoothServiceUUID[] }) => {
      if (options) {
        requestCalls.push(options)
      }
      return device
    },
  }

  const emit = (chunk: Uint8Array) => {
    const view = new DataView(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength))
    listeners.forEach((listener) =>
      listener(
        {
          target: {
            value: view,
          },
        } as unknown as Event,
      ),
    )
  }

  const emitWithoutValue = () => {
    listeners.forEach((listener) =>
      listener(
        {
          target: {},
        } as unknown as Event,
      ),
    )
  }

  return {
    bluetoothApi,
    emit,
    emitWithoutValue,
    writes,
    requestCalls,
    getServerDisconnectCalls: () => serverDisconnectCalls,
    setServerConnected: (value: boolean) => {
      serverConnected = value
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

describe('BluetoothTransport', () => {
  it('connects, sends framed packets, and receives framed packets', async () => {
    const context = createMockBluetoothContext()
    const transport = new BluetoothTransport(context.bluetoothApi)
    const received: number[] = []
    transport.subscribe((packet) => received.push(...packet))

    await transport.connect()
    context.emit(new Uint8Array([2, 9, 8, 1, 7]))
    await transport.send(new Uint8Array([4, 5]))
    await transport.disconnect()

    expect(transport.isConnected()).toBe(false)
    expect(context.requestCalls[0]?.acceptAllDevices).toBe(true)
    expect(context.getServerDisconnectCalls()).toBe(1)
    expect(context.writes).toEqual([new Uint8Array([2, 4, 5])])
    expect(received).toEqual([9, 8, 7])
  })

  it('returns early when connect is called while already connected', async () => {
    const context = createMockBluetoothContext()
    const transport = new BluetoothTransport(context.bluetoothApi)

    await transport.connect()
    await transport.connect()
    await transport.disconnect()

    expect(context.requestCalls).toHaveLength(1)
  })

  it('handles zero-length, partial, and empty-value bluetooth notifications', async () => {
    const context = createMockBluetoothContext()
    const transport = new BluetoothTransport(context.bluetoothApi)
    const received: number[] = []
    transport.subscribe((packet) => received.push(...packet))

    await transport.connect()
    context.emitWithoutValue()
    context.emit(new Uint8Array([0, 3, 1, 2]))
    context.emit(new Uint8Array([3]))
    await transport.disconnect()

    expect(received).toEqual([1, 2, 3])
  })

  it('throws for unsupported browser bluetooth', async () => {
    const transport = new BluetoothTransport(null)
    await expect(transport.connect()).rejects.toThrow(/not supported/i)
  })

  it('throws when payload size is invalid', async () => {
    const context = createMockBluetoothContext()
    const transport = new BluetoothTransport(context.bluetoothApi)
    await transport.connect()

    await expect(transport.send(new Uint8Array())).rejects.toThrow(/between 1 and 255/i)
    await expect(transport.send(new Uint8Array(256))).rejects.toThrow(/between 1 and 255/i)
  })

  it('throws when send is called while disconnected', async () => {
    const context = createMockBluetoothContext()
    const transport = new BluetoothTransport(context.bluetoothApi)
    await expect(transport.send(new Uint8Array([1]))).rejects.toThrow(/not connected/i)
  })

  it('throws when selected bluetooth device has no gatt server', async () => {
    const transport = new BluetoothTransport({
      requestDevice: async () => ({ gatt: null }),
    })

    await expect(transport.connect()).rejects.toThrow(/does not expose a gatt server/i)
  })

  it('supports subscribe cleanup', async () => {
    const context = createMockBluetoothContext()
    const transport = new BluetoothTransport(context.bluetoothApi)
    const received: number[] = []
    const unsubscribe = transport.subscribe((packet) => received.push(...packet))
    unsubscribe()

    await transport.connect()
    context.emit(new Uint8Array([1, 6]))
    await transport.disconnect()

    expect(received).toEqual([])
  })

  it('disconnects safely even when not connected to gatt server', async () => {
    const context = createMockBluetoothContext()
    const transport = new BluetoothTransport(context.bluetoothApi)

    await transport.disconnect()
    await transport.connect()
    context.setServerConnected(false)
    await transport.disconnect()

    expect(context.getServerDisconnectCalls()).toBe(0)
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

describe('getWebBluetoothApi', () => {
  it('returns null when browser bluetooth is not available', () => {
    expect(getWebBluetoothApi()).toBe(null)
  })

  it('returns browser bluetooth implementation when available', () => {
    Object.defineProperty(window.navigator, 'bluetooth', {
      configurable: true,
      value: { requestDevice: async () => ({}) },
    })

    expect(getWebBluetoothApi()).not.toBe(null)
    Reflect.deleteProperty(window.navigator, 'bluetooth')
  })
})

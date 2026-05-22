import { describe, expect, it } from 'vitest'

import { LoopbackTransport } from '../src/meshtastic/transport'

describe('LoopbackTransport', () => {
  it('connects and loops sent packets to subscribers', async () => {
    const transport = new LoopbackTransport()
    const received: number[] = []

    transport.subscribe((packet) => received.push(packet[0]))
    await transport.connect()
    await transport.send(new Uint8Array([7]))

    expect(received).toEqual([7])
  })
})

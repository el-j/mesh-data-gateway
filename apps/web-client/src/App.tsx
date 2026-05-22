import { useEffect, useMemo, useState } from 'react'

import { ProtocolCodec, ReassemblyBuffer, RouteId } from './lib/protocol'
import { LoopbackTransport } from './meshtastic/transport'

const labels: Record<number, string> = {
  [RouteId.HumanChat]: 'Chat',
  [RouteId.McpRequest]: 'MCP',
  [RouteId.Telegram]: 'Telegram',
  [RouteId.IotControl]: 'IoT',
}

const serviceResponsePrefix: Record<number, string> = {
  [RouteId.HumanChat]: 'ECHO',
  [RouteId.McpRequest]: 'MCP RESPONSE',
  [RouteId.Telegram]: 'TELEGRAM RELAYED',
  [RouteId.IotControl]: 'IOT ACK',
}

type AppMessage = { routeId: number; text: string }

export default function App() {
  const codec = useMemo(() => new ProtocolCodec(), [])
  const txBuffer = useMemo(() => new ReassemblyBuffer(codec), [codec])
  const rxBuffer = useMemo(() => new ReassemblyBuffer(codec), [codec])
  const transport = useMemo(() => new LoopbackTransport(), [])

  const [routeId, setRouteId] = useState<number>(RouteId.HumanChat)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<AppMessage[]>([])

  useEffect(() => {
    void transport.connect()
    transport.subscribe((packet) => {
      const incoming = txBuffer.addPacket(packet)
      if (!incoming) return

      const prefixed = `${serviceResponsePrefix[incoming.routeId]}: ${incoming.payloadText}`
      codec
        .encodeChunks(incoming.routeId, prefixed, incoming.messageId)
        .forEach((responsePacket) => {
          const done = rxBuffer.addPacket(responsePacket)
          if (done) {
            setMessages((prev) => [...prev, { routeId: done.routeId, text: done.payloadText }])
          }
        })
    })
  }, [codec, rxBuffer, transport, txBuffer])

  const send = async () => {
    if (!message.trim()) {
      return
    }

    const msgId = Math.floor(Math.random() * 256)
    const chunks = codec.encodeChunks(routeId, message, msgId)
    for (const chunk of chunks) {
      await transport.send(chunk)
    }
    setMessage('')
  }

  return (
    <main>
      <h1>Mesh Data Gateway</h1>

      <label htmlFor="target-service">Target Service</label>
      <select
        id="target-service"
        value={routeId}
        onChange={(event) => setRouteId(Number(event.target.value))}
      >
        {Object.entries(labels).map(([id, label]) => (
          <option key={id} value={Number(id)}>
            {label}
          </option>
        ))}
      </select>

      <label htmlFor="message-input">Message</label>
      <textarea
        id="message-input"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />

      <button type="button" onClick={() => void send()}>
        Send
      </button>

      <section>
        <h2>Messages</h2>
        <ul>
          {messages.map((entry, idx) => (
            <li key={`${entry.routeId}-${idx}`}>{entry.text}</li>
          ))}
        </ul>
      </section>
    </main>
  )
}

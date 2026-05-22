import { useEffect, useMemo, useState } from 'react'

import { ProtocolCodec, ReassemblyBuffer, RouteId } from './lib/protocol'
import { LoopbackTransport } from './meshtastic/transport'
import './App.css'

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
type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function App() {
  const codec = useMemo(() => new ProtocolCodec(), [])
  const txBuffer = useMemo(() => new ReassemblyBuffer(codec), [codec])
  const rxBuffer = useMemo(() => new ReassemblyBuffer(codec), [codec])
  const transport = useMemo(() => new LoopbackTransport(), [])

  const [routeId, setRouteId] = useState<number>(RouteId.HumanChat)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<AppMessage[]>([])
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null)
  const [installStatus, setInstallStatus] = useState('')

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

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as DeferredInstallPrompt)
      setInstallStatus('Install is ready: click "Install App".')
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    }
  }, [])

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

  const installApp = async () => {
    if (!installPrompt) {
      setInstallStatus('Install prompt is not available yet. Use the browser install menu.')
      return
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallStatus(
      choice.outcome === 'accepted'
        ? 'App install accepted.'
        : 'Install dismissed. You can continue using it in-browser.',
    )
    setInstallPrompt(null)
  }

  return (
    <main className="page">
      <section className="hero">
        <h1>Mesh Data Gateway</h1>
        <p className="hero-subtitle">
          Run MDG in your browser, route messages across services, and optionally install it as a PWA.
        </p>
        <div className="cta-row">
          <button type="button" onClick={() => void installApp()}>
            Install App
          </button>
          <span className="cta-note">No install required: use directly in this page.</span>
        </div>
        {installStatus ? <p role="status">{installStatus}</p> : null}
      </section>

      <section className="cards">
        <article>
          <h2>Browser-first</h2>
          <p>Connect and use MDG directly from GitHub Pages.</p>
        </article>
        <article>
          <h2>Routed Protocol</h2>
          <p>Chat, MCP, Telegram, and IoT traffic share one compact byte-level protocol.</p>
        </article>
        <article>
          <h2>PWA Ready</h2>
          <p>Install when supported, or continue in-browser with the same app experience.</p>
        </article>
      </section>

      <section className="console">
        <h2>Live Message Console</h2>

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
      </section>
    </main>
  )
}

import { useEffect, useMemo, useState } from 'react'

import { ProtocolCodec, ReassemblyBuffer, RouteId } from './lib/protocol'
import { getWebSerialApi, LoopbackTransport, MeshTransport, SerialTransport } from './meshtastic/transport'
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
  const loopbackTransport = useMemo(() => new LoopbackTransport(), [])
  const serialTransport = useMemo(() => new SerialTransport(), [])
  const serialSupported = useMemo(() => Boolean(getWebSerialApi()), [])

  const [routeId, setRouteId] = useState<number>(RouteId.HumanChat)
  const [transportMode, setTransportMode] = useState<'loopback' | 'serial'>('loopback')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<AppMessage[]>([])
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null)
  const [installStatus, setInstallStatus] = useState('')
  const [connected, setConnected] = useState(true)
  const [transportStatus, setTransportStatus] = useState(
    'Demo loopback connected. Switch to "Serial LoRa Board" and connect your device for hardware transport.',
  )

  const activeTransport: MeshTransport =
    transportMode === 'serial' ? serialTransport : loopbackTransport

  useEffect(() => {
    const unsubscribe = activeTransport.subscribe((packet) => {
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
    return unsubscribe
  }, [activeTransport, codec, rxBuffer, txBuffer])

  useEffect(() => {
    let cancelled = false

    const refreshTransport = async () => {
      await loopbackTransport.disconnect()
      await serialTransport.disconnect()

      if (transportMode === 'loopback') {
        await loopbackTransport.connect()
        if (!cancelled) {
          setConnected(true)
          setTransportStatus(
            'Demo loopback connected. Switch to "Serial LoRa Board" and connect your device for hardware transport.',
          )
        }
        return
      }

      if (!cancelled) {
        setConnected(false)
        setTransportStatus(
          serialSupported
            ? 'Serial mode selected. Click "Connect LoRa Board" to choose and connect your board.'
            : 'Web Serial is not supported in this browser. Use Chromium-based desktop browser.',
        )
      }
    }

    void refreshTransport()

    return () => {
      cancelled = true
    }
  }, [loopbackTransport, serialSupported, serialTransport, transportMode])

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
    if (transportMode === 'serial' && !activeTransport.isConnected()) {
      setTransportStatus('Connect a transport before sending messages.')
      return
    }

    const msgId = Math.floor(Math.random() * 256)
    const chunks = codec.encodeChunks(routeId, message, msgId)
    for (const chunk of chunks) {
      await activeTransport.send(chunk)
    }
    setMessage('')
  }

  const connectBoard = async () => {
    if (!serialSupported) {
      setTransportStatus('Web Serial is not supported in this browser.')
      return
    }

    try {
      await serialTransport.connect()
      setConnected(true)
      setTransportStatus(
        'Serial LoRa board connected. You can now send messages through the selected hardware transport.',
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown serial connection error'
      setConnected(false)
      setTransportStatus(`Could not connect serial board: ${reason}`)
    }
  }

  const disconnectBoard = async () => {
    await serialTransport.disconnect()
    setConnected(false)
    setTransportStatus('Serial LoRa board disconnected.')
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

        <label htmlFor="transport-mode">Transport</label>
        <select
          id="transport-mode"
          value={transportMode}
          onChange={(event) => {
            const nextMode = event.target.value as 'loopback' | 'serial'
            setTransportMode(nextMode)
          }}
        >
          <option value="loopback">Demo Loopback (no hardware)</option>
          <option value="serial">Serial LoRa Board</option>
        </select>
        {transportMode === 'serial' ? (
          <div className="transport-controls">
            <button type="button" onClick={() => void connectBoard()} disabled={connected}>
              Connect LoRa Board
            </button>
            <button type="button" onClick={() => void disconnectBoard()} disabled={!connected}>
              Disconnect
            </button>
          </div>
        ) : null}
        <p role="status">{transportStatus}</p>

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

import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'

import { ProtocolCodec, ReassemblyBuffer, RouteId } from './lib/protocol'
import {
  BluetoothTransport,
  getWebBluetoothApi,
  getWebSerialApi,
  LoopbackTransport,
  MeshTransport,
  SerialTransport,
} from './meshtastic/transport'
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

function LandingPage() {
  return (
    <section className="hero hero-landing">
      <p className="eyebrow">Open Source • LoRa • Meshtastic</p>
      <h1>Mesh Data Gateway</h1>
      <p className="hero-subtitle">
        MDG is a payload-agnostic routed tunnel for sending larger structured messages across constrained
        LoRa links by compression, chunking, and deterministic reassembly.
      </p>
      <div className="cta-row">
        <Link className="button-link" to="/app">
          Open Live App
        </Link>
        <a className="button-link button-link-secondary" href="https://github.com/el-j/mesh-data-gateway">
          View on GitHub
        </a>
      </div>

      <div className="feature-grid">
        <article>
          <h2>Routed Protocol Core</h2>
          <p>Route IDs separate chat, MCP, Telegram, and IoT paths over one compact packet format.</p>
        </article>
        <article>
          <h2>Hardware + Browser Ready</h2>
          <p>Use instant demo loopback mode, then switch to serial board mode for hardware testing.</p>
        </article>
        <article>
          <h2>Built for Integrations</h2>
          <p>Pair the web client with the Python gateway to dispatch traffic into MCP and external systems.</p>
        </article>
      </div>
    </section>
  )
}

function AboutPage() {
  return (
    <section className="hero legal-card">
      <h1>About Mesh Data Gateway</h1>
      <p>
        Mesh Data Gateway (MDG) is an open-source project that provides a reliable transport layer on top of
        Meshtastic-compatible links for messages larger than single LoRa frames.
      </p>
      <p>
        The system defines a shared byte-level protocol across web-client and gateway runtimes so compression,
        chunking, reassembly, and routing behavior stay interoperable and testable.
      </p>
      <p>
        Source code, protocol docs, and contribution context are available in the{' '}
        <a href="https://github.com/el-j/mesh-data-gateway">GitHub repository</a>.
      </p>
    </section>
  )
}

function ImpressumPage() {
  return (
    <section className="hero legal-card">
      <h1>Impressum</h1>
      <p>Project: Mesh Data Gateway (MDG)</p>
      <p>Repository: github.com/el-j/mesh-data-gateway</p>
      <p>
        This is an open-source technical demonstration and development project. For legal contact and owner
        information, please use the contact channels provided in the GitHub repository profile and issue
        tracker.
      </p>
      <p>
        Content on this page is provided in good faith for project transparency and does not replace
        jurisdiction-specific legal review.
      </p>
    </section>
  )
}

function LiveAppPage() {
  const codec = useMemo(() => new ProtocolCodec(), [])
  const txBuffer = useMemo(() => new ReassemblyBuffer(codec), [codec])
  const rxBuffer = useMemo(() => new ReassemblyBuffer(codec), [codec])
  const loopbackTransport = useMemo(() => new LoopbackTransport(), [])
  const serialTransport = useMemo(() => new SerialTransport(), [])
  const bluetoothTransport = useMemo(() => new BluetoothTransport(), [])
  const serialSupported = useMemo(() => Boolean(getWebSerialApi()), [])
  const bluetoothSupported = useMemo(() => Boolean(getWebBluetoothApi()), [])

  const [routeId, setRouteId] = useState<number>(RouteId.HumanChat)
  const [transportMode, setTransportMode] = useState<'loopback' | 'serial' | 'bluetooth'>('loopback')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<AppMessage[]>([])
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null)
  const [installStatus, setInstallStatus] = useState('')
  const [connected, setConnected] = useState(true)
  const [transportStatus, setTransportStatus] = useState(
    'Demo loopback connected. Switch to "Serial LoRa Board" and connect your device for hardware transport.',
  )

  const activeTransport: MeshTransport =
    transportMode === 'serial'
      ? serialTransport
      : transportMode === 'bluetooth'
        ? bluetoothTransport
        : loopbackTransport

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
      await bluetoothTransport.disconnect()

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
          transportMode === 'serial'
            ? serialSupported
              ? 'Serial mode selected. Click "Connect LoRa Board" to choose and connect your board.'
              : 'Web Serial is not supported in this browser. Use Chromium-based desktop browser.'
            : bluetoothSupported
              ? 'Bluetooth mode selected. Click "Connect LoRa Board" to pair your board (works well on Android).'
              : 'Web Bluetooth is not supported in this browser. Use a compatible browser/device.',
        )
      }
    }

    void refreshTransport()
    return () => {
      cancelled = true
    }
  }, [bluetoothSupported, bluetoothTransport, loopbackTransport, serialSupported, serialTransport, transportMode])

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
    if ((transportMode === 'serial' || transportMode === 'bluetooth') && !activeTransport.isConnected()) {
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
    if (transportMode === 'serial' && !serialSupported) {
      setTransportStatus('Web Serial is not supported in this browser.')
      return
    }
    if (transportMode === 'bluetooth' && !bluetoothSupported) {
      setTransportStatus('Web Bluetooth is not supported in this browser.')
      return
    }

    try {
      if (transportMode === 'serial') {
        await serialTransport.connect()
      } else {
        await bluetoothTransport.connect()
      }
      setConnected(true)
      setTransportStatus(
        transportMode === 'serial'
          ? 'Serial LoRa board connected. You can now send messages through the selected hardware transport.'
          : 'Bluetooth LoRa board connected. You can now send messages through the selected hardware transport.',
      )
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : transportMode === 'bluetooth'
            ? 'Unknown Bluetooth connection error'
            : 'Unknown serial connection error'
      setConnected(false)
      setTransportStatus(
        transportMode === 'bluetooth'
          ? `Could not connect Bluetooth board: ${reason}`
          : `Could not connect serial board: ${reason}`,
      )
    }
  }

  const disconnectBoard = async () => {
    if (transportMode === 'serial') {
      await serialTransport.disconnect()
    } else {
      await bluetoothTransport.disconnect()
    }
    setConnected(false)
    setTransportStatus(
      transportMode === 'bluetooth' ? 'Bluetooth LoRa board disconnected.' : 'Serial LoRa board disconnected.',
    )
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
    <>
      <section className="hero">
        <h1>Live Mesh Console</h1>
        <p className="hero-subtitle">
          Send routed MDG payloads from your browser and validate transport behavior in real time.
        </p>
        <div className="cta-row">
          <button type="button" onClick={() => void installApp()}>
            Install App
          </button>
          <Link className="button-link button-link-secondary" to="/">
            Back to Landing
          </Link>
        </div>
        {installStatus ? <p role="status">{installStatus}</p> : null}
      </section>

      <section className="console">
        <h2>Live Message Console</h2>

        <label htmlFor="transport-mode">Transport</label>
        <select
          id="transport-mode"
          value={transportMode}
          onChange={(event) => {
            const nextMode = event.target.value as 'loopback' | 'serial' | 'bluetooth'
            setTransportMode(nextMode)
          }}
        >
          <option value="loopback">Demo Loopback (no hardware)</option>
          <option value="serial">Serial LoRa Board</option>
          <option value="bluetooth">Bluetooth LoRa Board</option>
        </select>
        {transportMode !== 'loopback' ? (
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
        <textarea id="message-input" value={message} onChange={(event) => setMessage(event.target.value)} />

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
    </>
  )
}

function AppShell() {
  return (
    <main className="page">
      <header className="top-nav">
        <Link className="brand" to="/">
          Mesh Data Gateway
        </Link>
        <nav className="nav-links" aria-label="Primary">
          <Link to="/">Home</Link>
          <Link to="/app">Live App</Link>
          <Link to="/about">About</Link>
          <Link to="/impressum">Impressum</Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<LiveAppPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/impressum" element={<ImpressumPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppShell />
    </BrowserRouter>
  )
}

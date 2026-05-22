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

const cardClass =
  'rounded-2xl border border-slate-800/80 bg-slate-900/70 shadow-[0_0_0_1px_rgba(15,23,42,0.45)] backdrop-blur'

function LandingPage() {
  return (
    <section className={`${cardClass} overflow-hidden`}>
      <div className="relative px-6 py-10 sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -left-16 top-8 h-48 w-48 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-2 h-56 w-56 rounded-full bg-blue-500/15 blur-3xl" />

        <div className="relative space-y-6">
          <p className="inline-flex rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
            Open Source • LoRa • Meshtastic
          </p>

          <div className="space-y-3">
            <h1 className="text-balance text-4xl font-black leading-tight text-white sm:text-5xl">Mesh Data Gateway</h1>
            <p className="max-w-3xl text-pretty text-slate-200 sm:text-lg">
              MDG is a payload-agnostic routed tunnel for sending larger structured messages across constrained
              LoRa links by compression, chunking, and deterministic reassembly.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              className="rounded-xl border border-cyan-300/30 bg-cyan-400/20 px-4 py-2 font-semibold text-cyan-100 hover:bg-cyan-300/25"
              to="/app"
            >
              Open Live App
            </Link>
            <Link
              className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 font-semibold text-slate-100 hover:border-cyan-300/50"
              to="/docs"
            >
              Read Full Docs
            </Link>
            <a
              className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 font-semibold text-slate-100 hover:border-cyan-300/50"
              href="https://github.com/el-j/mesh-data-gateway"
            >
              View on GitHub
            </a>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <article className={`${cardClass} p-4`}>
              <h2 className="mb-1 text-base font-semibold text-cyan-100">Routed Protocol Core</h2>
              <p className="text-sm text-slate-300">
                Route IDs separate chat, MCP, Telegram, and IoT paths over one compact packet format.
              </p>
            </article>
            <article className={`${cardClass} p-4`}>
              <h2 className="mb-1 text-base font-semibold text-cyan-100">Hardware + Browser Ready</h2>
              <p className="text-sm text-slate-300">
                Use demo loopback, serial board mode, or Bluetooth board mode (great for Android usage).
              </p>
            </article>
            <article className={`${cardClass} p-4`}>
              <h2 className="mb-1 text-base font-semibold text-cyan-100">Built for Integrations</h2>
              <p className="text-sm text-slate-300">
                Pair the web client with the Python gateway to dispatch traffic into MCP and external systems.
              </p>
            </article>
          </div>

          <section className={`${cardClass} p-5`}>
            <h2 className="mb-3 text-lg font-bold text-white">Quick usage guide</h2>
            <ol className="grid gap-3 text-sm text-slate-200 sm:grid-cols-3">
              <li className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <span className="mb-2 inline-block rounded bg-cyan-400/20 px-2 py-0.5 text-xs font-bold text-cyan-100">Step 1</span>
                <p>Open Live App and choose a transport: Demo, Serial, or Bluetooth.</p>
              </li>
              <li className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <span className="mb-2 inline-block rounded bg-cyan-400/20 px-2 py-0.5 text-xs font-bold text-cyan-100">Step 2</span>
                <p>For hardware modes, click Connect LoRa Board and complete browser permission prompts.</p>
              </li>
              <li className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <span className="mb-2 inline-block rounded bg-cyan-400/20 px-2 py-0.5 text-xs font-bold text-cyan-100">Step 3</span>
                <p>Select route, send your message, and inspect routed responses in the live console.</p>
              </li>
            </ol>
          </section>
        </div>
      </div>
    </section>
  )
}

function DocsPage() {
  return (
    <section className={`${cardClass} space-y-6 p-6 sm:p-8`}>
      <header className="space-y-2">
        <h1 className="text-3xl font-black text-white sm:text-4xl">MDG Monorepo Documentation</h1>
        <p className="max-w-3xl text-slate-300">
          This page is the in-app reference for architecture, setup, routing protocol, transport modes, and
          contributor workflows.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className={`${cardClass} p-4`}>
          <h2 className="mb-2 text-lg font-semibold text-cyan-100">Monorepo layout</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li>
              <code>apps/web-client</code>: browser UI, transport adapters, and packet protocol implementation.
            </li>
            <li>
              <code>apps/mac-gateway</code>: Python gateway service, radio adapter, and integration dispatch.
            </li>
            <li>
              <code>protocol/</code>: shared protocol contract and mock payload examples.
            </li>
          </ul>
        </article>

        <article className={`${cardClass} p-4`}>
          <h2 className="mb-2 text-lg font-semibold text-cyan-100">Protocol overview</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li>Packet size: 200 bytes, with 4-byte header and up to 196-byte payload chunks.</li>
            <li>Header fields: route id, message id, chunk index, total chunks.</li>
            <li>Payloads are chunked and reassembled deterministically in both runtimes.</li>
          </ul>
        </article>

        <article className={`${cardClass} p-4`}>
          <h2 className="mb-2 text-lg font-semibold text-cyan-100">Web app usage</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
            <li>Navigate to Live App and choose your target service route.</li>
            <li>Choose transport mode: Demo Loopback, Serial LoRa Board, or Bluetooth LoRa Board.</li>
            <li>For hardware mode, connect first, then send messages and inspect responses.</li>
            <li>Install as PWA for quick mobile/desktop access if your browser supports install.</li>
          </ol>
        </article>

        <article className={`${cardClass} p-4`}>
          <h2 className="mb-2 text-lg font-semibold text-cyan-100">Hardware transport notes</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li>Serial mode uses Web Serial in Chromium-based desktop browsers.</li>
            <li>Bluetooth mode uses Web Bluetooth and Nordic UART Service framing; useful on Android Chrome.</li>
            <li>Both hardware modes currently expect an MDG framing bridge (length-prefixed packet stream).</li>
            <li>Direct stock Meshtastic protobuf transport is tracked as future work.</li>
          </ul>
        </article>
      </div>

      <section className={`${cardClass} p-4`}>
        <h2 className="mb-2 text-lg font-semibold text-cyan-100">Development + validation commands</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-200">Web client</p>
            <pre className="overflow-x-auto text-xs text-slate-300">
{`cd /home/runner/work/mesh-data-gateway/mesh-data-gateway/apps/web-client
npm install
npm run test
npm run build`}
            </pre>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-200">Mac gateway</p>
            <pre className="overflow-x-auto text-xs text-slate-300">
{`cd /home/runner/work/mesh-data-gateway/mesh-data-gateway/apps/mac-gateway
python -m pip install pytest pytest-cov
python -m pytest -q`}
            </pre>
          </div>
        </div>
      </section>

      <section className={`${cardClass} p-4`}>
        <h2 className="mb-2 text-lg font-semibold text-cyan-100">Where to read more</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
          <li>
            Protocol specification: <code>protocol/protocol-spec.md</code>
          </li>
          <li>
            Example payloads: <code>protocol/mock_data.json</code>
          </li>
          <li>
            Connectivity backlog: <code>apps/web-client/CONNECTIVITY_TODO.md</code>
          </li>
          <li>
            Repository root guide: <code>README.md</code>
          </li>
        </ul>
      </section>
    </section>
  )
}

function AboutPage() {
  return (
    <section className={`${cardClass} space-y-3 p-6 sm:p-8`}>
      <h1 className="text-3xl font-black text-white">About Mesh Data Gateway</h1>
      <p className="text-slate-300">
        Mesh Data Gateway (MDG) is an open-source project that provides a reliable transport layer on top of
        Meshtastic-compatible links for messages larger than single LoRa frames.
      </p>
      <p className="text-slate-300">
        The system defines a shared byte-level protocol across web-client and gateway runtimes so compression,
        chunking, reassembly, and routing behavior stay interoperable and testable.
      </p>
      <p className="text-slate-300">
        Source code, protocol docs, and contribution context are available in the{' '}
        <a href="https://github.com/el-j/mesh-data-gateway">GitHub repository</a>.
      </p>
    </section>
  )
}

function ImpressumPage() {
  return (
    <section className={`${cardClass} space-y-3 p-6 sm:p-8`}>
      <h1 className="text-3xl font-black text-white">Impressum</h1>
      <p className="text-slate-300">Project: Mesh Data Gateway (MDG)</p>
      <p className="text-slate-300">Repository: github.com/el-j/mesh-data-gateway</p>
      <p className="text-slate-300">
        This is an open-source technical demonstration and development project. For legal contact and owner
        information, please use the contact channels provided in the GitHub repository profile and issue tracker.
      </p>
      <p className="text-slate-300">
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
      <section className={`${cardClass} p-6 sm:p-8`}>
        <h1 className="text-3xl font-black text-white sm:text-4xl">Live Mesh Console</h1>
        <p className="mt-2 max-w-3xl text-slate-300 sm:text-lg">
          Send routed MDG payloads from your browser and validate transport behavior in real time.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded-xl border border-cyan-300/30 bg-cyan-400/20 px-4 py-2 font-semibold text-cyan-100 hover:bg-cyan-300/25"
            type="button"
            onClick={() => void installApp()}
          >
            Install App
          </button>
          <Link
            className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 font-semibold text-slate-100 hover:border-cyan-300/50"
            to="/"
          >
            Back to Landing
          </Link>
        </div>
        {installStatus ? <p className="mt-3 text-sm text-cyan-200" role="status">{installStatus}</p> : null}
      </section>

      <section className={`${cardClass} grid gap-4 p-6 sm:p-8`}>
        <h2 className="text-2xl font-bold text-white">Live Message Console</h2>

        <label className="text-sm text-slate-300" htmlFor="transport-mode">
          Transport
        </label>
        <select
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
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
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl border border-cyan-300/30 bg-cyan-400/20 px-4 py-2 font-semibold text-cyan-100 hover:bg-cyan-300/25 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => void connectBoard()}
              disabled={connected}
            >
              Connect LoRa Board
            </button>
            <button
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 font-semibold text-slate-100 hover:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => void disconnectBoard()}
              disabled={!connected}
            >
              Disconnect
            </button>
          </div>
        ) : null}
        <p className="text-sm text-cyan-200" role="status">
          {transportStatus}
        </p>

        <label className="text-sm text-slate-300" htmlFor="target-service">
          Target Service
        </label>
        <select
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
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

        <label className="text-sm text-slate-300" htmlFor="message-input">
          Message
        </label>
        <textarea
          className="min-h-[130px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          id="message-input"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />

        <button
          className="w-fit rounded-xl border border-cyan-300/30 bg-cyan-400/20 px-4 py-2 font-semibold text-cyan-100 hover:bg-cyan-300/25"
          type="button"
          onClick={() => void send()}
        >
          Send
        </button>

        <section className={`${cardClass} p-4`}>
          <h2 className="text-xl font-bold text-white">Messages</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
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
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <header className={`${cardClass} sticky top-4 z-20 flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4`}>
        <Link className="text-lg font-extrabold tracking-tight text-white" to="/">
          Mesh Data Gateway
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap gap-2 text-sm">
          <Link className="rounded-lg border border-transparent px-3 py-1.5 text-slate-300 hover:border-cyan-300/40" to="/">
            Home
          </Link>
          <Link
            className="rounded-lg border border-transparent px-3 py-1.5 text-slate-300 hover:border-cyan-300/40"
            to="/app"
          >
            Live App
          </Link>
          <Link
            className="rounded-lg border border-transparent px-3 py-1.5 text-slate-300 hover:border-cyan-300/40"
            to="/docs"
          >
            Docs
          </Link>
          <Link
            className="rounded-lg border border-transparent px-3 py-1.5 text-slate-300 hover:border-cyan-300/40"
            to="/about"
          >
            About
          </Link>
          <Link
            className="rounded-lg border border-transparent px-3 py-1.5 text-slate-300 hover:border-cyan-300/40"
            to="/impressum"
          >
            Impressum
          </Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<LiveAppPage />} />
        <Route path="/docs" element={<DocsPage />} />
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

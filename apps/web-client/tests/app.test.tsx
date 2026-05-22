import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '../src/App'

const basePath = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL.slice(0, -1)
  : import.meta.env.BASE_URL

const renderAt = (path: string) => {
  window.history.pushState({}, '', `${basePath}${path}`)
  render(<App />)
}

const goToLiveApp = async () => {
  fireEvent.click(screen.getByRole('link', { name: /open live app/i }))
  await waitFor(() => expect(screen.getByRole('heading', { name: /live mesh console/i })).toBeInTheDocument())
}

describe('App', () => {
  afterEach(() => {
    cleanup()
    window.history.pushState({}, '', `${basePath}/`)
    Reflect.deleteProperty(window.navigator, 'serial')
    Reflect.deleteProperty(window.navigator, 'bluetooth')
  })

  it('renders hero landing content and GitHub link', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: /mesh data gateway/i })).toBeInTheDocument()
    expect(screen.getByText(/payload-agnostic routed tunnel/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view on github/i })).toHaveAttribute(
      'href',
      'https://github.com/el-j/mesh-data-gateway',
    )
  })

  it('navigates to docs, about and impressum pages from top nav', async () => {
    renderAt('/')
    fireEvent.click(within(screen.getByRole('navigation', { name: /primary/i })).getByRole('link', { name: /docs/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: /mdg monorepo documentation/i })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('link', { name: /about/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: /about mesh data gateway/i })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('link', { name: /impressum/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: /impressum/i })).toBeInTheDocument())
  })

  it('supports direct app, docs and about routes', () => {
    renderAt('/app')
    expect(screen.getByRole('heading', { name: /live mesh console/i })).toBeInTheDocument()
    cleanup()

    renderAt('/docs')
    expect(screen.getByRole('heading', { name: /mdg monorepo documentation/i })).toBeInTheDocument()
    expect(screen.getByText(/development \+ validation commands/i)).toBeInTheDocument()
    cleanup()

    renderAt('/about')
    expect(screen.getByRole('heading', { name: /about mesh data gateway/i })).toBeInTheDocument()
  })

  it('redirects unknown routes to home', async () => {
    renderAt('/unknown')
    await waitFor(() => expect(screen.getByRole('heading', { name: /mesh data gateway/i })).toBeInTheDocument())
  })

  it('shows install fallback message when prompt is unavailable', async () => {
    renderAt('/')
    await goToLiveApp()
    fireEvent.click(screen.getByRole('button', { name: /install app/i }))
    expect(screen.getByText(/install prompt is not available yet/i)).toBeInTheDocument()
  })

  it('can handle install prompt accept flow', async () => {
    renderAt('/app')
    const prompt = vi.fn(async () => {})
    const beforeInstallEvent = Object.assign(new Event('beforeinstallprompt'), {
      preventDefault: vi.fn(),
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    })

    window.dispatchEvent(beforeInstallEvent)
    await waitFor(() =>
      expect(screen.getByText(/install is ready: click "install app"/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /install app/i }))

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText(/app install accepted/i)).toBeInTheDocument())
  })

  it('can handle install prompt dismiss flow', async () => {
    renderAt('/app')
    const prompt = vi.fn(async () => {})
    const beforeInstallEvent = Object.assign(new Event('beforeinstallprompt'), {
      preventDefault: vi.fn(),
      prompt,
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    })

    window.dispatchEvent(beforeInstallEvent)
    await waitFor(() =>
      expect(screen.getByText(/install is ready: click "install app"/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /install app/i }))

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
    await waitFor(
      () =>
        expect(
          screen.getByText(/install dismissed\. you can continue using it in-browser\./i),
        ).toBeInTheDocument(),
    )
  })

  it('sends a message and renders received response', async () => {
    renderAt('/app')
    await waitFor(() => expect(screen.getByText(/demo loopback connected/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/Target Service/i), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: 'hello mcp' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))

    await waitFor(() => expect(screen.getByText(/MCP RESPONSE/i)).toBeInTheDocument())
  })

  it('blocks sending when serial mode is selected but board is not connected', async () => {
    renderAt('/app')
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'serial' } })
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: 'needs board' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    await waitFor(() =>
      expect(screen.getByText(/connect a transport before sending messages/i)).toBeInTheDocument(),
    )
  })

  it('blocks sending when bluetooth mode is selected but board is not connected', async () => {
    renderAt('/app')
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'bluetooth' } })
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: 'needs bluetooth board' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    await waitFor(() =>
      expect(screen.getByText(/connect a transport before sending messages/i)).toBeInTheDocument(),
    )
  })

  it('shows unsupported serial message when connect is clicked', async () => {
    renderAt('/app')
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'serial' } })
    await waitFor(() =>
      expect(
        screen.getByText(/web serial is not supported in this browser\. use chromium-based desktop browser\./i),
      ).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /Connect LoRa Board/i }))
    expect(screen.getByText(/^web serial is not supported in this browser\.$/i)).toBeInTheDocument()
  })

  it('connects and disconnects serial board when web serial is available', async () => {
    Object.defineProperty(window.navigator, 'serial', {
      configurable: true,
      value: {
        requestPort: vi.fn(async () => ({
          open: vi.fn(async () => {}),
          close: vi.fn(async () => {}),
          readable: new ReadableStream<Uint8Array>(),
          writable: new WritableStream<Uint8Array>(),
        })),
      },
    })

    renderAt('/app')
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'serial' } })
    await waitFor(() =>
      expect(screen.getByText(/serial mode selected\. click "connect lora board"/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /Connect LoRa Board/i }))

    await waitFor(() =>
      expect(screen.getByText(/serial lora board connected\. you can now send messages/i)).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: /Disconnect/i }))
    await waitFor(() =>
      expect(screen.getByText(/serial lora board disconnected\./i)).toBeInTheDocument(),
    )
  })

  it('shows generic serial connect error when thrown value is not an Error', async () => {
    Object.defineProperty(window.navigator, 'serial', {
      configurable: true,
      value: {
        requestPort: vi.fn(async () => {
          throw { failure: 'boom' }
        }),
      },
    })

    renderAt('/app')
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'serial' } })
    await waitFor(() =>
      expect(screen.getByText(/serial mode selected\. click "connect lora board"/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /Connect LoRa Board/i }))
    await waitFor(() =>
      expect(screen.getByText(/could not connect serial board: unknown serial connection error/i)).toBeInTheDocument(),
    )
  })

  it('shows explicit serial connect error message when Error is thrown', async () => {
    Object.defineProperty(window.navigator, 'serial', {
      configurable: true,
      value: {
        requestPort: vi.fn(async () => {
          throw new Error('Permission denied')
        }),
      },
    })

    renderAt('/app')
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'serial' } })
    await waitFor(() =>
      expect(screen.getByText(/serial mode selected\. click "connect lora board"/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /Connect LoRa Board/i }))
    await waitFor(() =>
      expect(screen.getByText(/could not connect serial board: permission denied/i)).toBeInTheDocument(),
    )
  })

  it('shows unsupported bluetooth message when bluetooth mode is selected and connect is clicked', async () => {
    renderAt('/app')
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'bluetooth' } })
    await waitFor(() =>
      expect(
        screen.getByText(/web bluetooth is not supported in this browser\. use a compatible browser\/device\./i),
      ).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /Connect LoRa Board/i }))
    expect(screen.getByText(/^web bluetooth is not supported in this browser\.$/i)).toBeInTheDocument()
  })

  it('connects and disconnects bluetooth board when web bluetooth is available', async () => {
    Object.defineProperty(window.navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: vi.fn(async () => {
          const txListeners: Array<(event: Event) => void> = []
          const txCharacteristic = {
            startNotifications: vi.fn(async () => txCharacteristic),
            addEventListener: vi.fn((_type: 'characteristicvaluechanged', listener: (event: Event) => void) => {
              txListeners.push(listener)
            }),
            removeEventListener: vi.fn((_type: 'characteristicvaluechanged', listener: (event: Event) => void) => {
              const idx = txListeners.indexOf(listener)
              if (idx >= 0) {
                txListeners.splice(idx, 1)
              }
            }),
          }
          const rxCharacteristic = {
            writeValue: vi.fn(async () => {}),
          }
          const server = {
            connected: true,
            connect: vi.fn(async () => server),
            disconnect: vi.fn(() => {
              server.connected = false
            }),
            getPrimaryService: vi.fn(async () => ({
              getCharacteristic: vi.fn(async (characteristic: BluetoothCharacteristicUUID) =>
                String(characteristic).endsWith('0002-b5a3-f393-e0a9-e50e24dcca9e') ? rxCharacteristic : txCharacteristic,
              ),
            })),
          }
          return { gatt: server }
        }),
      },
    })

    renderAt('/app')
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'bluetooth' } })
    await waitFor(() =>
      expect(screen.getByText(/bluetooth mode selected\. click "connect lora board"/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /Connect LoRa Board/i }))

    await waitFor(() =>
      expect(screen.getByText(/bluetooth lora board connected\. you can now send messages/i)).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: /Disconnect/i }))
    await waitFor(() =>
      expect(screen.getByText(/bluetooth lora board disconnected\./i)).toBeInTheDocument(),
    )
  })

  it('shows generic bluetooth connect error when thrown value is not an Error', async () => {
    Object.defineProperty(window.navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: vi.fn(async () => {
          throw { failure: 'boom' }
        }),
      },
    })

    renderAt('/app')
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'bluetooth' } })
    await waitFor(() =>
      expect(screen.getByText(/bluetooth mode selected\. click "connect lora board"/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /Connect LoRa Board/i }))
    await waitFor(() =>
      expect(screen.getByText(/could not connect bluetooth board: unknown bluetooth connection error/i)).toBeInTheDocument(),
    )
  })

  it('shows explicit bluetooth connect error message when Error is thrown', async () => {
    Object.defineProperty(window.navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: vi.fn(async () => {
          throw new Error('Pairing denied')
        }),
      },
    })

    renderAt('/app')
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'bluetooth' } })
    await waitFor(() =>
      expect(screen.getByText(/bluetooth mode selected\. click "connect lora board"/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /Connect LoRa Board/i }))
    await waitFor(() =>
      expect(screen.getByText(/could not connect bluetooth board: pairing denied/i)).toBeInTheDocument(),
    )
  })

  it('does not send empty message', () => {
    renderAt('/app')
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    expect(screen.getByText(/Messages/)).toBeInTheDocument()
  })

  it('handles multi-chunk send flow', async () => {
    renderAt('/app')
    await waitFor(() => expect(screen.getByText(/demo loopback connected/i)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/Target Service/i), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: 'x'.repeat(220) } })
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    await waitFor(() => expect(screen.getByText(/^ECHO:/i)).toBeInTheDocument())
  })
})

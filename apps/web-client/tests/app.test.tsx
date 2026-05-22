import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '../src/App'

describe('App', () => {
  afterEach(() => {
    cleanup()
    Reflect.deleteProperty(window.navigator, 'serial')
  })

  it('renders landing page hero and install call-to-action', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /mesh data gateway/i })).toBeInTheDocument()
    expect(screen.getByText(/run mdg in your browser/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /install app/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Transport/i)).toBeInTheDocument()
  })

  it('shows install fallback message when prompt is unavailable', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /install app/i }))
    expect(screen.getByText(/install prompt is not available yet/i)).toBeInTheDocument()
  })

  it('can handle install prompt accept flow', async () => {
    render(<App />)
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
    render(<App />)
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
    render(<App />)
    await waitFor(() => expect(screen.getByText(/demo loopback connected/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/Target Service/i), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: 'hello mcp' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))

    await waitFor(() => expect(screen.getByText(/MCP RESPONSE/i)).toBeInTheDocument())
  })

  it('blocks sending when serial mode is selected but board is not connected', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'serial' } })
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: 'needs board' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    expect(screen.getByText(/connect a transport before sending messages/i)).toBeInTheDocument()
  })

  it('shows unsupported serial message when connect is clicked', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'serial' } })
    fireEvent.click(screen.getByRole('button', { name: /Connect LoRa Board/i }))
    expect(screen.getByText(/web serial is not supported in this browser/i)).toBeInTheDocument()
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

    render(<App />)
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'serial' } })
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
          throw 'boom'
        }),
      },
    })

    render(<App />)
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'serial' } })
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

    render(<App />)
    fireEvent.change(screen.getByLabelText(/Transport/i), { target: { value: 'serial' } })
    fireEvent.click(screen.getByRole('button', { name: /Connect LoRa Board/i }))
    await waitFor(() =>
      expect(screen.getByText(/could not connect serial board: permission denied/i)).toBeInTheDocument(),
    )
  })

  it('does not send empty message', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    expect(screen.getByText(/Messages/)).toBeInTheDocument()
  })

  it('handles multi-chunk send flow', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText(/demo loopback connected/i)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/Target Service/i), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: 'x'.repeat(220) } })
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    await waitFor(() => expect(screen.getByText(/^ECHO:/i)).toBeInTheDocument())
  })
})

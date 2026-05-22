import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '../src/App'

describe('App', () => {
  afterEach(() => cleanup())

  it('renders landing page hero and install call-to-action', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /mesh data gateway/i })).toBeInTheDocument()
    expect(screen.getByText(/run mdg in your browser/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /install app/i })).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: /install app/i }))

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText(/app install accepted/i)).toBeInTheDocument())
  })

  it('sends a message and renders received response', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText(/Target Service/i), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: 'hello mcp' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))

    expect(screen.getByText(/MCP RESPONSE/i)).toBeInTheDocument()
  })

  it('does not send empty message', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    expect(screen.getByText(/Messages/)).toBeInTheDocument()
  })

  it('handles multi-chunk send flow', async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText(/Target Service/i), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: 'x'.repeat(220) } })
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    await waitFor(() => expect(screen.getByText(/^ECHO:/i)).toBeInTheDocument())
  })
})

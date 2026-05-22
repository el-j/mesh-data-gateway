import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import App from '../src/App'

describe('App', () => {
  afterEach(() => cleanup())

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

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsModal } from '../components/SettingsModal'


describe('SettingsModal server health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.system.getSettings).mockResolvedValue({
      'user:apiKey': 'sk-test-key',
      'server:config': { url: 'http://server.local', enabled: true },
    })
    vi.mocked(window.system.listProviders).mockResolvedValue({ source: 'gateway', providers: [] })
    vi.mocked(window.fetch).mockImplementation((url) => {
      if (url.toString().endsWith('/health/ready')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ status: 'ready', version: '14.0.0' }),
        } as unknown as Response)
      }
      return Promise.resolve({ ok: true, status: 200, json: vi.fn().mockResolvedValue({}) } as unknown as Response)
    })
  })

  it('shows the server version returned by the readiness health check', async () => {
    render(<SettingsModal open onClose={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: 'server' }))
    fireEvent.click(screen.getByRole('button', { name: /check connection/i }))

    expect(await screen.findByText('SERVER v14.0.0')).toBeInTheDocument()
  })

  it('lets an agent override the app provider chain', async () => {
    vi.mocked(window.system.getSettings).mockResolvedValue({
      'agents:list': [{
        id: 'engineer',
        name: 'Engineer',
        persona: 'engineer',
        prompt: '',
        tags: [],
      }],
    })

    render(<SettingsModal open onClose={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: 'agents' }))
    expect(screen.getByText('Using the app provider chain.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /add link/i }))

    expect(screen.getByText('This agent uses its own fallback order.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove provider link 1 from engineer/i })).toBeInTheDocument()
  })
})

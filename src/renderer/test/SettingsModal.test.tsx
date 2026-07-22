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
})

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatArea, Message } from '../components/ChatArea'

describe('ChatArea Component', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.mocked(window.system.transcribeAudio).mockResolvedValue('add this spoken text')
  })

  const mockMessages: Message[] = [
    {
      id: '1',
      role: 'user',
      content: 'Analyze the system state.',
      timestamp: new Date()
    },
    {
      id: '2',
      role: 'moderator-whisper',
      content: 'I am looking at the agent roster.',
      timestamp: new Date()
    },
    {
      id: '3',
      role: 'moderator',
      content: 'System analysis complete. Fact[1]',
      timestamp: new Date()
    }
  ]

  it('renders messages correctly', () => {
    const onSendMock = vi.fn()
    render(<ChatArea messages={mockMessages} onSend={onSendMock} />)

    expect(screen.getByText('Analyze the system state.')).toBeInTheDocument()
    // Markdown rendered text
    expect(screen.getByText(/System analysis complete/)).toBeInTheDocument()
    
    // Check whisper rendering (collapsed by default, but header is visible)
    expect(screen.getByText(/moderator whisper/i)).toBeInTheDocument()
  })

  it('allows typing and sending a message', () => {
    const onSendMock = vi.fn()
    const { container } = render(<ChatArea messages={[]} onSend={onSendMock} />)

    const input = screen.getByPlaceholderText(/transmit message/i)
    const sendButton = container.querySelector('.chat-send-button') as HTMLButtonElement

    fireEvent.change(input, { target: { value: 'New directive' } })
    expect(input).toHaveValue('New directive')
    
    expect(sendButton).not.toBeDisabled()
    fireEvent.click(sendButton)

    expect(onSendMock).toHaveBeenCalledWith('New directive')
    expect(input).toHaveValue('') // Clears after send
  })

  it('allows typing while isLoading is true (Human-in-the-loop)', () => {
    const onSendMock = vi.fn()
    const { container } = render(<ChatArea messages={[]} onSend={onSendMock} isLoading={true} />)

    const input = screen.getByPlaceholderText(/transmit additional intel/i)
    expect(input).toBeInTheDocument()
    
    fireEvent.change(input, { target: { value: 'Urgent update' } })
    expect(input).toHaveValue('Urgent update')
    
    const sendButton = container.querySelector('.chat-send-button') as HTMLButtonElement
    expect(sendButton).not.toBeDisabled()
    
    fireEvent.click(sendButton)
    expect(onSendMock).toHaveBeenCalledWith('Urgent update')
  })

  it('offers recovery for a disconnected gateway run', async () => {
    const onRecoverRun = vi.fn().mockResolvedValue(undefined)
    render(
      <ChatArea
        messages={[{
          id: 'recoverable-error',
          role: 'error',
          content: 'CRITICAL_EXCEPTION: RECOVERABLE_AGENT_DISCONNECT runId=run-456 after 300000ms',
          timestamp: new Date(),
        }]}
        onSend={vi.fn()}
        onRecoverRun={onRecoverRun}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /recover run/i }))
    })

    expect(onRecoverRun).toHaveBeenCalledWith('run-456')
  })

  it('offers a retry for legacy timeout errors without a run ID', async () => {
    const onRetryFailedRequest = vi.fn().mockResolvedValue(undefined)
    render(
      <ChatArea
        messages={[{
          id: 'legacy-timeout',
          role: 'error',
          content: 'CRITICAL_EXCEPTION: ALL_PROVIDERS_EXHAUSTED: AGENT_TIMEOUT after 180000ms',
          timestamp: new Date(),
        }]}
        onSend={vi.fn()}
        onRetryFailedRequest={onRetryFailedRequest}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry request/i }))
    })

    expect(onRetryFailedRequest).toHaveBeenCalledWith('legacy-timeout')
  })

  it('shows activity-aware elapsed and idle timers', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T20:00:00.000Z'))
    const now = Date.now()

    try {
      render(
        <ChatArea
          messages={[]}
          onSend={vi.fn()}
          isLoading
          streamingAgents={{
            Engineer: {
              status: 'Running Splunk and MCP tools...',
              runId: 'run-stalled',
              events: [],
              startedAt: now - 120_000,
              lastActivityAt: now - 100_000,
              idleTimeoutMs: 180_000,
            },
          }}
        />,
      )

      expect(screen.getByText('02:00 · idle 01:20')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('transcribes microphone speech into the message draft', async () => {
    class MockMediaRecorder {
      static isTypeSupported = vi.fn().mockReturnValue(true)
      state = 'inactive'
      mimeType = 'audio/webm;codecs=opus'
      ondataavailable: ((event: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      onerror: (() => void) | null = null

      start() {
        this.state = 'recording'
      }

      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['audio']) })
        this.onstop?.()
      }
    }
    const stopTrack = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: stopTrack }],
        }),
      },
    })
    vi.stubGlobal('MediaRecorder', MockMediaRecorder)
    vi.stubGlobal('AudioContext', class {
      decodeAudioData = vi.fn().mockResolvedValue({
        length: 2,
        numberOfChannels: 1,
        sampleRate: 16_000,
        getChannelData: () => new Float32Array([0.1, 0.2]),
      })
      close = vi.fn().mockResolvedValue(undefined)
    })

    render(<ChatArea messages={[]} onSend={vi.fn()} />)

    const input = screen.getByPlaceholderText(/transmit message/i)
    fireEvent.change(input, { target: { value: 'Existing draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Stop voice input' }))

    await waitFor(() => expect(input).toHaveValue('Existing draft add this spoken text'))
    expect(window.system.transcribeAudio).toHaveBeenCalled()
    expect(stopTrack).toHaveBeenCalled()
  })
})

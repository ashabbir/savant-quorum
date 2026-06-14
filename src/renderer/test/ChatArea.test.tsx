import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatArea, Message } from '../components/ChatArea'

describe('ChatArea Component', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
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
})

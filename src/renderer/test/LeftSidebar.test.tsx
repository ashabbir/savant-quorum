import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LeftSidebar } from '../components/LeftSidebar'

vi.mock('@radix-ui/react-dropdown-menu', () => {
  return {
    Root: ({ children }: any) => <div>{children}</div>,
    Trigger: ({ children, asChild, ...props }: any) => {
      if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children, props)
      }
      return <button {...props}>{children}</button>
    },
    Portal: ({ children }: any) => <div>{children}</div>,
    Content: ({ children, ...props }: any) => <div role="menu" {...props}>{children}</div>,
    Item: ({ children, onSelect, ...props }: any) => (
      <div
        role="menuitem"
        onClick={() => onSelect?.()}
        {...props}
      >
        {children}
      </div>
    ),
    Separator: () => <hr />,
    Group: ({ children }: any) => <div>{children}</div>,
    Sub: ({ children }: any) => <div>{children}</div>,
    SubTrigger: ({ children }: any) => <div>{children}</div>,
    SubContent: ({ children }: any) => <div>{children}</div>,
  }
})


const defaultProps = {
  chats: [
    { id: 'root', name: 'General notes', folderId: null },
    { id: 'react', name: 'React rendering bug', folderId: 'frontend' },
    { id: 'rails', name: 'Rails query tuning', folderId: 'backend' },
  ],
  folders: [
    { id: 'frontend', name: 'Frontend', hint: 'React and UI work' },
    { id: 'backend', name: 'Backend', hint: 'Rails and database work' },
  ],
  activeChatId: null,
  onSelectChat: vi.fn(),
  onReorderChat: vi.fn(),
  onMoveToFolder: vi.fn(),
  onMoveChatsToFolder: vi.fn(),
  onCreateFolderAndMove: vi.fn(),
  onDeleteChat: vi.fn(),
  onAddFolder: vi.fn(),
  onDeleteFolder: vi.fn(),
  onRenameFolder: vi.fn(),
  onUpdateFolderHint: vi.fn(),
  onClassifyChat: vi.fn(),
  onSuggestGrouping: vi.fn().mockResolvedValue([]),
  onApplyGrouping: vi.fn(),
}

describe('LeftSidebar', () => {
  it('shows unread dots on background chats and their collapsed folders', () => {
    render(
      <LeftSidebar
        {...defaultProps}
        unreadChatIds={new Set(['root', 'react'])}
      />,
    )

    expect(screen.getByLabelText('Unread response in General notes')).toBeInTheDocument()
    expect(screen.getByLabelText('Unread response in Frontend')).toBeInTheDocument()
    expect(screen.queryByLabelText('Unread response in React rendering bug')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Frontend'))

    expect(screen.queryByLabelText('Unread response in Frontend')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Unread response in React rendering bug')).toBeInTheDocument()
  })

  it('searches sessions across collapsed folders', () => {
    render(<LeftSidebar {...defaultProps} />)

    fireEvent.change(screen.getByLabelText('Search sessions'), {
      target: { value: 'rendering' },
    })

    expect(screen.getByText('React rendering bug')).toBeInTheDocument()
    expect(screen.queryByText('Rails query tuning')).not.toBeInTheDocument()
    expect(screen.queryByText('General notes')).not.toBeInTheDocument()
  })

  it('saves a folder classification hint', () => {
    const onUpdateFolderHint = vi.fn()
    render(<LeftSidebar {...defaultProps} onUpdateFolderHint={onUpdateFolderHint} />)

    fireEvent.click(screen.getByLabelText('Edit classification hint for Frontend'))
    fireEvent.change(screen.getByPlaceholderText(/React UI work/i), {
      target: { value: 'TypeScript and React component work' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'save hint' }))

    expect(onUpdateFolderHint).toHaveBeenCalledWith(
      'frontend',
      'TypeScript and React component work',
    )
  })

  it('moves multiple selected sessions to a folder', () => {
    const onMoveChatsToFolder = vi.fn()
    render(<LeftSidebar {...defaultProps} onMoveChatsToFolder={onMoveChatsToFolder} />)

    expect(screen.queryByLabelText('Select General notes')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Enter multi-select mode'))
    fireEvent.click(screen.getByLabelText('Select General notes'))
    const frontendFolder = screen.getAllByText('Frontend').find(el => el.tagName === 'SPAN')!
    fireEvent.click(frontendFolder)
    fireEvent.click(screen.getByLabelText('Select React rendering bug'))
    fireEvent.pointerDown(screen.getByLabelText('Move selected sessions'), { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Backend' }))

    expect(onMoveChatsToFolder).toHaveBeenCalledWith(['root', 'react'], 'backend')
  })

  it('creates a new folder while moving selected sessions', () => {
    const onCreateFolderAndMove = vi.fn()
    render(<LeftSidebar {...defaultProps} onCreateFolderAndMove={onCreateFolderAndMove} />)

    fireEvent.click(screen.getByLabelText('Enter multi-select mode'))
    fireEvent.click(screen.getByLabelText('Select General notes'))
    fireEvent.pointerDown(screen.getByLabelText('Move selected sessions'), { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: '+ New folder...' }))
    fireEvent.change(screen.getByPlaceholderText('folder name...'), {
      target: { value: 'Security' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'create and move' }))

    expect(onCreateFolderAndMove).toHaveBeenCalledWith(['root'], 'Security')
  })

  it('reorders sessions only when one is dropped on another row', () => {
    const onSelectChat = vi.fn()
    const onReorderChat = vi.fn()
    render(
      <LeftSidebar
        {...defaultProps}
        onSelectChat={onSelectChat}
        onReorderChat={onReorderChat}
      />,
    )

    const source = screen.getByLabelText('General notes')
    fireEvent.click(source)
    expect(onSelectChat).toHaveBeenCalledWith('root')
    expect(onReorderChat).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Frontend'))
    const target = screen.getByLabelText('React rendering bug')
    target.getBoundingClientRect = vi.fn(() => ({
      top: 0,
      height: 20,
      bottom: 20,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }))
    fireEvent.dragStart(source, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } })
    fireEvent.dragOver(target, { clientY: 1 })
    fireEvent.drop(target, { clientY: 1 })

    expect(onReorderChat).toHaveBeenCalledWith('root', 'react', 'after')
  })
})

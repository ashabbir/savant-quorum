import { useState } from 'react'
import { ChatMode } from '../services/chatMode'
import { createAthenaService, type AthenaService } from '../services/athenaService'

interface ChatModeSelectorProps {
  onSelect: (mode: ChatMode) => void
  defaultMode?: ChatMode
  athenaService?: AthenaService
}

export default function ChatModeSelector({ onSelect, defaultMode = 'collaborate', athenaService = createAthenaService() }: ChatModeSelectorProps) {
  const [selected, setSelected] = useState<ChatMode>(defaultMode)

  const handleChange = (mode: ChatMode) => {
    setSelected(mode)
    athenaService.setMode(mode).catch(() => {})
    onSelect(mode)
  }

  return (
    <div className="chat-mode-selector" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' }}>CHOOSE_CHAT_MODE</div>

      <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer' }}>
        <input
          type="radio"
          name="chatMode"
          value="collaborate"
          checked={selected === 'collaborate'}
          onChange={() => handleChange('collaborate')}
          aria-label="Collaborate mode"
        />
        <div>
          <div style={{ fontWeight: 500 }}>Collaborate</div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
            Athena decides how many agents respond and gives final summary
          </div>
        </div>
      </label>

      <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer' }}>
        <input
          type="radio"
          name="chatMode"
          value="debate"
          checked={selected === 'debate'}
          onChange={() => handleChange('debate')}
          aria-label="Debate mode"
        />
        <div>
          <div style={{ fontWeight: 500 }}>Debate</div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
            3 agents debate across 3 rounds with Athena evaluation. Best answer wins.
          </div>
        </div>
      </label>
    </div>
  )
}

import { useState } from 'react'
import { DebateResult } from '../services/debateOrchestrator'
import { DebateRoundTab, DebateRoundContent } from './DebateRoundView'

interface DebateResultsProps {
  result: DebateResult
  onClose: () => void
}

export default function DebateResults({ result, onClose }: DebateResultsProps) {
  const [activeRound, setActiveRound] = useState<1 | 2 | 3>(1)

  const currentRound = result.rounds.find((r) => r.roundNumber === activeRound)

  return (
    <div className="debate-results" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' }}>DEBATE_RESULTS</div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          ✕
        </button>
      </div>

      {/* Round Tabs */}
      <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--border, #333)' }}>
        {([1, 2, 3] as const).map((roundNumber) => (
          <DebateRoundTab
            key={roundNumber}
            roundNumber={roundNumber}
            isActive={activeRound === roundNumber}
            onClick={setActiveRound}
          />
        ))}
      </div>

      {/* Round Content */}
      {currentRound && (
        <DebateRoundContent
          round={currentRound}
          winnerAgent={result.winner.agent}
          winnerScore={result.winner.score}
        />
      )}

      {/* Winner Summary */}
      <div
        className="winner-summary"
        style={{
          marginTop: '16px',
          padding: '12px',
          border: '2px solid var(--accent, #0f0)',
          borderRadius: '4px',
          background: 'rgba(0, 255, 0, 0.03)'
        }}
        data-testid="winner-summary"
      >
        <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '8px', letterSpacing: '0.05em' }}>
          FINAL_WINNER
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontWeight: 600 }}>{result.winner.agent}</span>
          <span style={{ color: 'var(--accent, #0f0)', fontWeight: 600 }}>⭐ {result.winner.score.toFixed(1)}/10</span>
        </div>
        <div style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text)' }}>
          {result.winner.response}
        </div>
      </div>
    </div>
  )
}

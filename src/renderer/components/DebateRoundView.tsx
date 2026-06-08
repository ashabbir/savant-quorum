import { DebateRound } from '../services/debateOrchestrator'

interface DebateRoundTabProps {
  roundNumber: 1 | 2 | 3
  isActive: boolean
  onClick: (round: 1 | 2 | 3) => void
}

export function DebateRoundTab({ roundNumber, isActive, onClick }: DebateRoundTabProps) {
  return (
    <button
      onClick={() => onClick(roundNumber)}
      className={`debate-tab ${isActive ? 'active' : ''}`}
      style={{
        padding: '8px 12px',
        border: 'none',
        borderBottom: isActive ? '2px solid var(--accent, #0f0)' : '2px solid transparent',
        background: 'transparent',
        color: isActive ? 'var(--text)' : 'var(--text-dim)',
        cursor: 'pointer',
        fontWeight: isActive ? 600 : 400,
        fontSize: '12px',
        letterSpacing: '0.05em',
        transition: 'all 0.2s'
      }}
      data-testid={`round-${roundNumber}-tab`}
    >
      ROUND_{roundNumber}
    </button>
  )
}

interface DebateAgentResponseProps {
  agent: string
  response: string
  isWinner?: boolean
  winnerScore?: number
}

export function DebateAgentResponse({ agent, response, isWinner, winnerScore }: DebateAgentResponseProps) {
  return (
    <div
      className={`debate-response ${isWinner ? 'winner' : ''}`}
      style={{
        padding: '12px',
        marginBottom: '8px',
        border: isWinner ? '2px solid var(--accent, #0f0)' : '1px solid var(--border, #333)',
        borderRadius: '4px',
        background: isWinner ? 'rgba(0, 255, 0, 0.05)' : 'transparent'
      }}
      data-testid={`agent-${agent}-response`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontWeight: 600, fontSize: '12px' }}>{agent}</span>
        {isWinner && (
          <span style={{ fontSize: '11px', color: 'var(--accent, #0f0)', fontWeight: 600 }}>
            ⭐ {winnerScore?.toFixed(1)}/10 WINNER
          </span>
        )}
      </div>
      <div style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text)' }}>
        {response}
      </div>
    </div>
  )
}

interface DebateRoundContentProps {
  round: DebateRound
  winnerAgent?: string
  winnerScore?: number
}

export function DebateRoundContent({ round, winnerAgent, winnerScore }: DebateRoundContentProps) {
  const agents = Object.keys(round.agentResponses).sort()

  return (
    <div className="debate-round-content" data-testid={`round-${round.roundNumber}-content`}>
      {agents.map((agent) => (
        <DebateAgentResponse
          key={agent}
          agent={agent}
          response={round.agentResponses[agent]}
          isWinner={round.roundNumber === 3 && agent === winnerAgent}
          winnerScore={round.roundNumber === 3 && agent === winnerAgent ? winnerScore : undefined}
        />
      ))}
    </div>
  )
}

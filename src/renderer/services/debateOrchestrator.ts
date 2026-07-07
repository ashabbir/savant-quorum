/**
 * Debate Orchestrator Service
 * Orchestrates 3-round debate with multiple agents
 * Each round: collect responses, build context, pass to moderator for evaluation
 */
import {
  buildCitationCorrectionPrompt,
  buildWithheldCitationResponse,
  CITATION_CONTRACT_PROMPT,
  validateCitationContract,
} from './citationContract'

export interface DebateRound {
  roundNumber: 1 | 2 | 3
  agentResponses: Record<string, string>
  moderatorContext: string
}

export interface DebateResult {
  rounds: DebateRound[]
  winner: {
    agent: string
    response: string
    score: number
  }
}

export interface AgentExecutor {
  execute(prompt: string, agent: string): Promise<string>
}

export interface DebateOrchestrator {
  /**
   * Run a 3-round debate with provided agents
   * @param options - Debate configuration
   * @returns Debate result with rounds and winner
   */
  runDebate(options: {
    prompt: string
    agents: string[]
    providers: any[]
  }): Promise<DebateResult>
}

export interface DebateOrchestratorDeps {
  dispatch?: (action: any) => void
  execute?: (prompt: string, agent: string) => Promise<string>
}

export function createDebateOrchestrator(deps: DebateOrchestratorDeps = {}): DebateOrchestrator {
  const dispatch = deps.dispatch || (() => {})
  const execute = deps.execute || (async () => '')
  /**
   * Build moderator context from previous round responses
   */
  function buildModeratorContext(
    roundNumber: number,
    agentResponses: Record<string, string>,
    originalPrompt: string
  ): string {
    if (roundNumber === 1) {
      return originalPrompt
    }

    const responsesSummary = Object.entries(agentResponses)
      .map(([agent, response]) => `**${agent}**: ${response}`)
      .join('\n\n')

    if (roundNumber === 2) {
      return `In Round 1, the agents presented:\n\n${responsesSummary}\n\nNow, each agent should present counter-arguments addressing the other positions.`
    }

    // Round 3
    return `Based on the previous rounds, here are the current positions:\n\n${responsesSummary}\n\nNow provide your final, strongest argument.`
  }

  /**
   * Execute a single debate round
   */
  async function executeRound(
    roundNumber: 1 | 2 | 3,
    agents: string[],
    prompt: string,
    executor: AgentExecutor,
    previousResponses: Record<string, string> = {}
  ): Promise<DebateRound> {
    const moderatorContext = buildModeratorContext(roundNumber, previousResponses, prompt)
    const agentResponses: Record<string, string> = {}

    // Run all agents in parallel for this round
    await Promise.all(
      agents.map(async (agent) => {
        const response = await executor.execute(`${moderatorContext}\n\n${CITATION_CONTRACT_PROMPT}`, agent)
        const validation = validateCitationContract(response)
        if (validation.valid) {
          agentResponses[agent] = response
          return
        }

        const corrected = await executor.execute(buildCitationCorrectionPrompt(response, validation.errors), agent)
        const correctedValidation = validateCitationContract(corrected)
        agentResponses[agent] = correctedValidation.valid
          ? corrected
          : buildWithheldCitationResponse(agent, correctedValidation.errors)
      })
    )

    return {
      roundNumber,
      agentResponses,
      moderatorContext
    }
  }

  /**
   * Score and rank responses to pick winner
   */
  function scoreResponses(
    responses: Record<string, string>
  ): { agent: string; score: number }[] {
    // Scoring heuristic:
    // - Length bonus (comprehensive answers)
    // - Coherence (via word diversity)
    // - Argument strength (will be improved with moderator AI eval in GREEN phase)

    return Object.entries(responses)
      .map(([agent, response]) => {
        let score = 0

        // Length factor (longer, more detailed answers score higher)
        score += Math.min(response.length / 100, 3) // Max 3 points for length

        // Word diversity (vocabulary richness)
        const words = response.toLowerCase().split(/\s+/)
        const uniqueWords = new Set(words).size
        score += Math.min(uniqueWords / 50, 2) // Max 2 points for diversity

        // Base score
        score += 3

        return { agent, score: Math.min(score, 10) }
      })
      .sort((a, b) => b.score - a.score)
  }

  return {
    async runDebate(options: {
      prompt: string
      agents: string[]
      providers: any[]
    }): Promise<DebateResult> {
      const { prompt, agents } = options

      // Validate input
      if (agents.length < 3) {
        throw new Error(`Debate requires at least 3 agents, got ${agents.length}`)
      }

      if (!prompt || prompt.trim().length === 0) {
        throw new Error('Debate prompt cannot be empty')
      }

      // Create executor function
      const executor: AgentExecutor = {
        execute: execute
      }

      // Run 3 rounds
      const round1 = await executeRound(1, agents, prompt, executor)
      const round2 = await executeRound(2, agents, prompt, executor, round1.agentResponses)
      const round3 = await executeRound(3, agents, prompt, executor, round2.agentResponses)

      // Score round 3 responses and pick winner
      const scores = scoreResponses(round3.agentResponses)
      const winnerScore = scores[0]

      return {
        rounds: [round1, round2, round3],
        winner: {
          agent: winnerScore.agent,
          response: round3.agentResponses[winnerScore.agent],
          score: winnerScore.score
        }
      }
    }
  }
}

# Chat Modes and Debate

## Purpose

Document the two-level conversation control: collaboration mode and debate mode.

## Chat mode

The app supports:

- `collaborate`
- `debate`

### Human flow

1. The user selects the chat mode from the UI.
2. The choice is persisted in local storage and session metadata.
3. Reloading the session restores the selected mode.

### AI flow

1. Collaboration mode uses the normal moderator-driven multi-agent loop.
2. Debate mode runs a structured multi-round argument process.

## Debate orchestrator

### Human flow

1. The user provides a prompt and a set of agents.
2. The app runs three rounds.
3. The app scores the final round and shows a winner.

### AI flow

1. Round 1 uses the original prompt.
2. Round 2 injects previous answers as counter-argument context.
3. Round 3 asks for final positions.
4. The winner is chosen by a scoring heuristic that rewards length and diversity.

## Relevant files

- `src/renderer/services/chatMode.ts`
- `src/renderer/services/debateOrchestrator.ts`
- `src/renderer/components/ChatModeSelector.tsx`
- `src/renderer/components/DebateRoundView.tsx`
- `src/renderer/components/DebateResults.tsx`

## Failure modes

- If mode does not persist, inspect `quorum:chatMode` storage and session metadata loading.
- If debate execution fails, validate that at least three agents are provided.
- If winner selection seems weak, note that the current scoring is heuristic rather than semantic evaluation.

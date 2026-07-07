# Chat and Agents

## Purpose

Document the central chat loop, direct agent execution, provider/model routing, and fallback behavior.

## Human flow

1. The user types a message in the chat area.
2. The app decides whether the message is a normal turn or a direct `@agent` request.
3. The user can attach files, edit messages, copy content, or export messages.
4. The user can run the same prompt through different providers according to the configured provider chain.

## AI flow

1. Build the prompt from:
   - the current user query
   - recent chat history
   - session summary
   - uploaded file context
   - provider/fallback status
2. If the message starts with `@name`, route it directly to that agent instead of the moderator chain.
3. Execute providers in chain order and fall back when a provider fails.
4. Preserve provider and model metadata on messages and whispers so the UI can inspect the execution path.

## Search and validation budgets

- Regular mode answers promptly from supplied context and uses only targeted lookups required for correctness, without broad or recursive exploration.
- Deep Search systematically investigates at least two relevant sources when available, permits at most three targeted workspace queries per agent response, records failed searches, and then synthesizes the best available evidence.
- Swarm runs require independent cross-checking whenever at least two agents complete successfully. Athena supplies a deterministic reviewer assignment if the moderator omits or returns invalid cross-check requests.
- When Athena initially selects only one swarm agent and another configured agent exists, Quorum adds an independent reviewer so validation cannot be silently skipped.

## Citation contract

- Every model response shown to the user or passed between agents must place `[CITE:n]` markers directly after material factual claims.
- Every response must end with one `## Citations` Markdown table using the columns `Citation`, `Source`, and `Evidence`.
- Inline markers and table rows must match exactly; sources and evidence must be specific and must not be invented.
- Quorum validates the structure, requests one corrected response when necessary, and withholds output that remains invalid rather than presenting uncited claims as verified.
- The same structural requirement applies to direct replies, swarm agent output, cross-check feedback, final Athena synthesis, document summaries, and debate rounds.

## Routing rules

- Provider discovery prefers gateway metadata.
- Terminal fallback providers are available when the gateway is unavailable.
- The renderer should not rely on hardcoded provider lists unless discovery fails.

## Message types

- `user`
- `moderator`
- `engineer`
- `architect`
- `security`
- `system`
- `error`
- `internal`
- `whisper`
- `moderator-whisper`
- `agent-whisper`

## Relevant files

- `src/renderer/App.tsx`
- `src/renderer/components/ChatArea.tsx`
- `src/renderer/components/ChatMarkdown.tsx`
- `src/main/electron/main.ts`
- `src/main/electron/preload.ts`

## Failure modes

- If the model dropdown looks right but uses the wrong source, check provider discovery.
- If direct agent commands do nothing, verify the `@agent` parsing path and agent roster source.
- If message export misses provider context, confirm the message carries `provider` and `model`.

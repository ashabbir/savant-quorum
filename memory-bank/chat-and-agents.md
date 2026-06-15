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

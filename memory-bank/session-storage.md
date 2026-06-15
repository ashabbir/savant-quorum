# Session Storage

## Purpose

Document how a Quorum session is created, loaded, saved, and deleted.

## Data model

A session contains:

- `id`
- `title`
- `messages`
- `thinking`
- `summary`
- `metadata`

## Human flow

1. The user creates or selects a session in the left sidebar.
2. The chat surface loads messages and thinking history.
3. The app auto-titles new sessions from the first user message.
4. Deleting a session removes it from the list and storage.

## AI flow

1. When a new interaction starts, the app builds context from:
   - recent messages
   - session summary
   - session metadata
   - uploaded file summaries
2. The app stores new messages and thinking events as the conversation progresses.
3. If a session is reopened, the metadata is restored before any new AI call is made.

## Persistence details

- Main process stores session data in SQLite.
- Renderer writes through `window.sessions.save`.
- Session metadata is JSON-serialized.
- Uploaded file state lives inside session metadata rather than as a separate table.

## Failure modes

- If session history appears to vanish, check whether the browser fallback storage was used instead of SQLite.
- If metadata parsing fails, the app falls back to a safe empty metadata object.
- If titles remain generic, check whether the first user message is present and available during save.

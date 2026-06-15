# Authentication and Profile

## Purpose

Document how Quorum persists and uses the user identity and settings.

## Human flow

1. The user opens the profile modal.
2. The user enters or updates the Savant API key.
3. The key is persisted locally for app reuse.
4. Settings and profile changes update the renderer state and can trigger provider refreshes.

## AI flow

1. When AI features need server access, use the persisted Savant API key.
2. Treat the API key as the first-class identity value for Savant server calls.
3. If a server or gateway call fails auth, clear or invalidate the stored key according to the app flow.

## Contracts

- Local storage key: `savant_api_key`
- Backend header: `X-API-Key`
- Settings are also persisted through the app settings store for profile consistency.

## Relevant surfaces

- `src/renderer/services/auth.ts`
- `src/renderer/components/ProfileModal.tsx`
- `src/renderer/components/SettingsModal.tsx`
- `src/main/electron/main.ts` for server-side access to persisted settings

## Failure modes

- If login appears successful but later API calls fail, verify the stored key and the header value.
- If the renderer starts without Electron, fallback storage should still allow local preview mode.
- If profile changes do not survive reloads, inspect both localStorage and the persisted settings layer.

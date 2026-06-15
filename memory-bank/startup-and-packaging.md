# Startup and Packaging

## Purpose

Document the app launch path, packaged asset handling, tray behavior, and icon generation.

## Human flow

1. A user runs `npm run dev`.
2. The renderer starts on Vite with a strict local port.
3. Electron launches once the renderer is available.
4. In packaged builds, the app window loads the built renderer file from `dist`.
5. The app shows a tray icon and context menu on desktop platforms.

## AI flow

1. Use dev mode when debugging UI or IPC.
2. Use packaged mode when validating the ASAR path and icon asset behavior.
3. If startup fails, inspect:
   - renderer readiness
   - Electron load path
   - preload bridge availability
   - tray icon asset resolution

## Main-process contract

- `src/main/electron/main.ts` owns:
  - window creation
  - tray creation
  - load-path resolution
  - dev vs packaged branching
- Dev mode:
  - uses `VITE_DEV_SERVER_URL`
  - opens DevTools
- Packaged mode:
  - loads `dist/index.html`
  - resolves assets through `process.resourcesPath/public` for packaged extras

## Icon pipeline

- `scripts/svg-to-png.js` converts `src/renderer/public/main.svg` into `build/icon.png`.
- `build/icon.png` and `build/icon.icns` are the packaged app icons.
- The tray prefers `trayTemplate.png` on macOS and falls back to `tray.svg`.

## Failure modes

- If the window is blank in production, verify the loaded file path first.
- If the tray icon is missing or inverted incorrectly, check the template PNG and macOS template flag.
- If packaged assets do not resolve, inspect the `extraResources` mapping in `package.json`.

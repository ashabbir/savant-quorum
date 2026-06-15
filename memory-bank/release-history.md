# Release History

## v4 baseline

- Initial repo state: `v4.0.57`
- Core app existed as an Electron chat client with session storage and multi-agent support.

## v5.0.0

Major renderer and workflow overhaul:

- turn summarization
- context window compression
- session metadata persistence
- uploaded file support and file summaries
- direct agent execution with `@agent`
- Mermaid validation and sanitization
- larger `App.tsx`, `ChatArea.tsx`, and `RightPanel.tsx` flows

## v5.0.2

Production packaging fix:

- fixed the built app load path inside ASAR
- resolved the blank window bug in packaged builds

## v5.0.3

Official macOS icon release:

- added SVG-to-PNG icon conversion script
- regenerated `build/icon.png`
- regenerated `build/icon.icns`
- bumped app version to `5.0.3`

## Documentation rule

When a future release lands, add a new section here and update the affected feature docs so the memory bank stays aligned with the repo.

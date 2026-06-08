# Savant Quorum Project

This project is a functional prototype of a multi-agent collaborative environment built using Electron, React (Vite), and TypeScript.

## Architecture
- **Framework:** Electron + React (Vite)
- **Language:** TypeScript
- **Styling:** Vanilla CSS
- **Agent Integration:** The Electron main process interacts with AI agents (like `gemini`) via shell commands using `exec`.

## Project Structure
- `electron/`: Main process and preload scripts.
- `src/`: React frontend (App.tsx, components, styles).
- `dist/` & `dist-electron/`: Build outputs.

## Development Workflows
- **Install Dependencies:** `npm install`
- **Run Dev Environment:** `npm run electron:dev`
- **Build Project:** `npm run build`

## Engineering Standards
- Use Vanilla CSS for all styling.
- Maintain a cyberpunk-inspired dark aesthetic.
- Ensure type safety across both main and renderer processes.
- **Automated Versioning:** Every functional or UI change must be accompanied by a patch version bump (`npm version patch`). The application UI must dynamically reflect this version via the `APP_VERSION` global.
- **Jira Tickets Integration:** Whenever tickets are mentioned or requested in a task, they must always be automatically created in the Savant SQLite database under the active workspace ('quorum' / ID '17807589009121862532574') for the active operator ('ahmed') with the appropriate status.


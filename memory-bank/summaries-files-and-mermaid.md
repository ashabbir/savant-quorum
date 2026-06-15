# Summaries, Files, and Mermaid

## Purpose

Document the content-compression features that keep large sessions usable.

## Human flow

1. The user can upload a file into a session.
2. The app generates a summary of the uploaded file.
3. The file and its summary become part of the session context.
4. The user can trigger session summarization from the UI.
5. Mermaid diagrams render in chat and are sanitized before display.

## AI flow

1. Uploaded file content is summarized through the provider fallback chain.
2. The summary is stored in session metadata and injected into later prompts.
3. Session summarization compresses long history so later turns stay within context.
4. Mermaid blocks are sanitized and validated before rendering.
5. If Mermaid syntax fails, the app retries with correction prompts.

## File handling

- Files are stored in session metadata.
- Each file entry can track:
  - `name`
  - `content`
  - `summary`
  - `loading`
- Duplicate uploads are detected by file name.

## Mermaid handling

- `src/renderer/utils/mermaidSanitizer.ts` quotes labels that contain special characters or whitespace.
- `src/renderer/components/MermaidEditorModal.tsx` supports diagram editing.
- Validation runs against the Mermaid parser before final output is accepted.

## Failure modes

- If a file summary fails, the file still remains visible with an error state.
- If Mermaid syntax breaks, the app should sanitize and retry before surfacing the output.
- If uploaded file context is missing from later prompts, check session metadata persistence.

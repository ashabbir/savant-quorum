import { describe, it, expect } from 'vitest';
import { sanitizeMermaidCode } from '../utils/mermaidSanitizer';

describe('Mermaid Sanitizer Utility', () => {
  it('does not touch already quoted labels', () => {
    const input = 'A["Renderer Process <br> (React UI)"]';
    expect(sanitizeMermaidCode(input)).toBe('A["Renderer Process <br> (React UI)"]');
  });

  it('escapes unquoted labels with parentheses and HTML tags in flowcharts', () => {
    const input = 'A[Renderer Process <br> (React UI)]';
    expect(sanitizeMermaidCode(input)).toBe('A["Renderer Process <br> (React UI)"]');
  });

  it('escapes unquoted labels with spaces', () => {
    const input = 'A[Hello World]';
    expect(sanitizeMermaidCode(input)).toBe('A["Hello World"]');
  });

  it('handles multiple shape mappings', () => {
    const input = 'A((Some Circular (Label))) --> B{Alternative <br> Path}';
    const expected = 'A(("Some Circular (Label)")) --> B{"Alternative <br> Path"}';
    expect(sanitizeMermaidCode(input)).toBe(expected);
  });

  it('sanitizes sequence diagram participant/actor aliases', () => {
    const input = 'participant A as Client App\nactor B as Secure (IPC) Gateway';
    const expected = 'participant A as "Client App"\nactor B as "Secure (IPC) Gateway"';
    expect(sanitizeMermaidCode(input)).toBe(expected);
  });

  it('ignores comments and empty lines', () => {
    const input = '%% this is a comment\n\n  %% another comment\n  A[Render (UI)]';
    const expected = '%% this is a comment\n\n  %% another comment\n  A["Render (UI)"]';
    expect(sanitizeMermaidCode(input)).toBe(expected);
  });
});

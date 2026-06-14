/**
 * Deterministically sanitizes Mermaid diagram code by wrapping labels containing
 * special characters, HTML, or parentheses in double quotes.
 */
export function sanitizeMermaidCode(code: string): string {
  if (!code) return code;

  let lines = code.split('\n');
  const reservedKeywords = new Set([
    'graph', 'flowchart', 'subgraph', 'end', 'click', 'style', 'classdef', 
    'class', 'direction', 'sequencediagram', 'classdiagram', 'statediagram-v2', 
    'gantt', 'pie', 'journey'
  ]);

  const shapeMappings = [
    { open: '[[', close: ']]', openEsc: '\\[\\[', closeEsc: '\\]\\]' },
    { open: '((', close: '))', openEsc: '\\(\\(', closeEsc: '\\)\\)' },
    { open: '[(', close: ')]', openEsc: '\\[\\(', closeEsc: '\\)\\]' },
    { open: '([', close: '])', openEsc: '\\(\\[', closeEsc: '\\]\\)' },
    { open: '{{', close: '}}', openEsc: '\\{\\{', closeEsc: '\\}\\}' },
    { open: '[', close: ']', openEsc: '\\[', closeEsc: '\\]' },
    { open: '(', close: ')', openEsc: '\\(', closeEsc: '\\)' },
    { open: '{', close: '}', openEsc: '\\{', closeEsc: '\\}' },
    { open: '>', close: ']', openEsc: '\\>', closeEsc: '\\]' }
  ];

  lines = lines.map(line => {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) return line;

    // Check if line starts with a reserved keyword (case insensitive)
    const firstWord = trimmed.split(/[\s(]/)[0].toLowerCase();
    if (reservedKeywords.has(firstWord)) return line;

    let modifiedLine = line;

    // 1. Process flowchart/graph node shape labels
    for (const mapping of shapeMappings) {
      const regexStr = `\\b([a-zA-Z0-9_-]+)\\s*${mapping.openEsc}\\s*([^"]+?)\\s*${mapping.closeEsc}(?=\\s*($|[-=<>|.]|\\b[a-zA-Z0-9_-]+\\b))`;
      const regex = new RegExp(regexStr, 'g');
      
      modifiedLine = modifiedLine.replace(regex, (match, nodeId, label) => {
        const trimmedLabel = label.trim();
        const shouldQuote = /[\(\)<>\&]/g.test(trimmedLabel) || trimmedLabel.includes(' ') || trimmedLabel.includes('<br>');
        if (shouldQuote && !trimmedLabel.startsWith('"') && !trimmedLabel.endsWith('"')) {
          return `${nodeId}${mapping.open}"${trimmedLabel}"${mapping.close}`;
        }
        return match;
      });
    }

    // 2. Process sequence diagram participant/actor aliases
    // e.g., participant A as Label -> participant A as "Label"
    const participantRegex = /\b(participant|actor)\s+([a-zA-Z0-9_-]+)\s+as\s+([^"\n]+)/ig;
    modifiedLine = modifiedLine.replace(participantRegex, (match, type, id, label) => {
      const trimmedLabel = label.trim();
      const shouldQuote = /[\(\)<>\&]/g.test(trimmedLabel) || trimmedLabel.includes(' ') || trimmedLabel.includes('<br>');
      if (shouldQuote && !trimmedLabel.startsWith('"') && !trimmedLabel.endsWith('"')) {
        return `${type} ${id} as "${trimmedLabel}"`;
      }
      return match;
    });

    return modifiedLine;
  });

  return lines.join('\n');
}

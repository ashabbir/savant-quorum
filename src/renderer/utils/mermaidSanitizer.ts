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
    { open: '[[', close: ']]' },
    { open: '((', close: '))' },
    { open: '[(', close: ')]' },
    { open: '([', close: '])' },
    { open: '{{', close: '}}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '{', close: '}' },
    { open: '>', close: ']' }
  ];

  lines = lines.map(line => {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) return line;

    // Check if line starts with a reserved keyword (case insensitive)
    const firstWord = trimmed.split(/[\s(]/)[0].toLowerCase();
    if (reservedKeywords.has(firstWord)) return line;

    let modifiedLine = line;
    let index = 0;

    while (index < modifiedLine.length) {
      // Find the next word followed by shape-open characters
      const remaining = modifiedLine.substring(index);
      const match = remaining.match(/\b([a-zA-Z0-9_-]+)(\s*)([\[\({>]+)/);
      if (!match) break;

      const matchedNodeId = match[1];
      const matchedSpacing = match[2] || '';
      const matchedOpenChars = match[3];
      const matchPos = index + match.index!;
      const openPos = matchPos + match[0].length - matchedOpenChars.length;

      // Determine which shape mapping matches best (longest open token match)
      let selectedMapping = null;
      for (const mapping of shapeMappings) {
        if (modifiedLine.startsWith(mapping.open, openPos)) {
          selectedMapping = mapping;
          break;
        }
      }

      if (!selectedMapping) {
        // No matching shape found, advance index past this word
        index = matchPos + match[0].length;
        continue;
      }

      const mapping = selectedMapping;
      const labelStart = openPos + mapping.open.length;

      // Find the matching closing token by scanning forward and balancing brackets
      let depth = 1;
      let scanPos = labelStart;
      let foundClosePos = -1;

      const openChars = new Set<string>();
      if (mapping.open.includes('(')) openChars.add('(');
      if (mapping.open.includes('[')) openChars.add('[');
      if (mapping.open.includes('{')) openChars.add('{');

      const closeChars = new Set<string>();
      if (mapping.close.includes(')')) closeChars.add(')');
      if (mapping.close.includes(']')) closeChars.add(']');
      if (mapping.close.includes('}')) closeChars.add('}');

      while (scanPos < modifiedLine.length) {
        // Only check for mapping.close if we are at the outermost level
        if (depth === 1 && modifiedLine.startsWith(mapping.close, scanPos)) {
          foundClosePos = scanPos;
          break;
        }
        
        // Otherwise, check if we match a nested opening token sequence
        if (modifiedLine.startsWith(mapping.open, scanPos)) {
          depth++;
          scanPos += mapping.open.length;
          continue;
        }

        // Adjust nesting depth for individual braces
        const char = modifiedLine[scanPos];
        if (openChars.has(char)) {
          depth++;
        } else if (closeChars.has(char)) {
          depth--;
        }
        scanPos++;
      }

      if (foundClosePos !== -1) {
        const label = modifiedLine.substring(labelStart, foundClosePos);
        const trimmedLabel = label.trim();
        const shouldQuote = /[\(\)<>\&]/g.test(trimmedLabel) || trimmedLabel.includes(' ') || trimmedLabel.includes('<br>');
        
        const isAlreadyQuoted = (trimmedLabel.startsWith('"') && trimmedLabel.endsWith('"')) || 
                                (trimmedLabel.startsWith('\'') && trimmedLabel.endsWith('\''));

        let replacementNode;
        if (shouldQuote && !isAlreadyQuoted) {
          replacementNode = `${matchedNodeId}${matchedSpacing}${mapping.open}"${trimmedLabel}"${mapping.close}`;
        } else {
          replacementNode = `${matchedNodeId}${matchedSpacing}${mapping.open}${label}${mapping.close}`;
        }

        modifiedLine = modifiedLine.substring(0, matchPos) + replacementNode + modifiedLine.substring(foundClosePos + mapping.close.length);
        // Move scanner index past the newly replaced node
        index = matchPos + replacementNode.length;
      } else {
        // Unmatched opening bracket, skip it to avoid loops
        index = labelStart;
      }
    }

    // 2. Process sequence diagram participant/actor aliases
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

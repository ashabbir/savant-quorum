export const CITATION_CONTRACT_PROMPT = `
CITATION CONTRACT (MANDATORY FOR EVERY RESPONSE):
- Add an inline citation marker like [CITE:1] immediately after every material factual claim.
- End the response with exactly one Markdown section named "## Citations".
- The citation table must use exactly these columns:
| Citation | Source | Evidence |
| --- | --- | --- |
| [CITE:1] | file path, URL, tool result, message, or supplied context | specific evidence supporting the cited claim |
- Every inline citation must have one matching table row, and every table row must be referenced inline.
- Source and Evidence must be specific. Never invent a source. Mark unavailable evidence explicitly as unavailable.
`.trim();

export interface CitationValidationResult {
  valid: boolean;
  errors: string[];
}

const CITATION_MARKER = /\[CITE:(\d+)\]/g;

export function validateCitationContract(response: string): CitationValidationResult {
  const errors: string[] = [];
  const headingMatches = [...response.matchAll(/^##\s+Citations\s*$/gim)];
  const headingMatch = headingMatches[0];

  if (!headingMatch) {
    return { valid: false, errors: ['Missing "## Citations" section'] };
  }
  if (headingMatches.length !== 1) errors.push('Response must contain exactly one "## Citations" section');

  const body = response.slice(0, headingMatch.index);
  const citationSection = response.slice(headingMatch.index);
  const inlineIds = [...body.matchAll(CITATION_MARKER)].map(match => match[1]);

  if (inlineIds.length === 0) errors.push("No inline [CITE:n] markers found before the citation table");

  const lines = citationSection.split("\n").map(line => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex(line => /^\|\s*Citation\s*\|\s*Source\s*\|\s*Evidence\s*\|$/i.test(line));
  if (headerIndex === -1) {
    errors.push("Citation table header must be: | Citation | Source | Evidence |");
    return { valid: false, errors };
  }

  if (!/^\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|$/.test(lines[headerIndex + 1] || "")) {
    errors.push("Citation table is missing a valid Markdown separator row");
  }

  const tableIds: string[] = [];
  const trailingLines = lines.slice(headerIndex + 2);
  let tableEnded = false;
  for (const line of trailingLines) {
    if (!line.startsWith("|")) {
      tableEnded = true;
      continue;
    }
    if (tableEnded) {
      errors.push("Citation table must be the final content in the response");
      continue;
    }
    const cells = line.split("|").slice(1, -1).map(cell => cell.trim());
    if (cells.length !== 3) {
      errors.push("Every citation row must contain exactly Citation, Source, and Evidence");
      continue;
    }
    const marker = /^\[CITE:(\d+)\]$/.exec(cells[0]);
    if (!marker) {
      errors.push(`Invalid citation marker in table row: ${cells[0] || "empty"}`);
      continue;
    }
    tableIds.push(marker[1]);
    if (!cells[1] || /^\[?(source|unknown|n\/a)\]?$/i.test(cells[1])) errors.push(`[CITE:${marker[1]}] has no specific source`);
    if (!cells[2] || /^\[?(evidence|unknown|n\/a)\]?$/i.test(cells[2])) errors.push(`[CITE:${marker[1]}] has no specific evidence`);
  }
  if (tableEnded) errors.push("Citation table must be the final content in the response");

  if (tableIds.length === 0) errors.push("Citation table contains no citation rows");

  for (const id of new Set(inlineIds)) {
    if (!tableIds.includes(id)) errors.push(`[CITE:${id}] is used inline but missing from the citation table`);
  }
  for (const id of new Set(tableIds)) {
    if (!inlineIds.includes(id)) errors.push(`[CITE:${id}] appears in the table but is not used inline`);
  }
  if (new Set(tableIds).size !== tableIds.length) errors.push("Citation table contains duplicate citation IDs");

  return { valid: errors.length === 0, errors };
}

export function buildCitationCorrectionPrompt(response: string, errors: string[]): string {
  return `
Your previous response violated the mandatory citation contract.

VALIDATION ERRORS:
${errors.map(error => `- ${error}`).join("\n")}

PREVIOUS RESPONSE:
${response}

TASK:
Return the complete corrected response. Preserve its substantive answer, but add specific inline citations and a matching final citation table. Do not invent sources.

${CITATION_CONTRACT_PROMPT}
`.trim();
}

export function buildWithheldCitationResponse(agentLabel: string, errors: string[]): string {
  return `The ${agentLabel} response was withheld because it did not provide verifiable citations in the required format. [CITE:1]

## Citations
| Citation | Source | Evidence |
| --- | --- | --- |
| [CITE:1] | Quorum citation validator | ${errors.join("; ").replace(/\|/g, "\\|")} |`;
}

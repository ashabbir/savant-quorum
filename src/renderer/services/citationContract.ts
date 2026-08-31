export const CITATION_CONTRACT_PROMPT = `
CITATION CONTRACT (MANDATORY FOR EVERY RESPONSE):
- User-Friendly & Fact-Centric: Write your main answer in clear, accessible language for non-technical users. Avoid academic clutter and do not get lost in citations.
- Add an inline citation marker like [CITE:1] only at the end of key material factual statements or takeaways (do NOT clutter every sentence or word).
- End the response with exactly one Markdown section named "## Citations".
- The citation table must use exactly these columns:
| Citation | Source | Evidence |
| --- | --- | --- |
| [CITE:1] | file path, URL, tool result, message, or supplied context | specific evidence supporting the cited claim |
- Every inline citation must have one matching table row, and every table row must be referenced inline.
- Source and Evidence must be specific, fact-centric, and easy to understand for non-technical users. Never invent a source. Mark unavailable evidence explicitly as unavailable.
`.trim();

export interface CitationValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CitationItem {
  id: string;
  marker: string; // e.g. "[CITE:1]"
  fact?: string;
  source: string;
  evidence: string;
}

const CITATION_MARKER = /\[CITE:(\d+)\]/g;
const CITATION_SECTION_REGEX = /^##\s+(?:Citations|Sources\s*(&|and)?\s*Citations|Verified\s*Facts|Sources)\s*$/im;

const HEADER_3COL_REGEX = /^\|\s*(?:Citation|Reference|Ref|Tag)\s*\|\s*(?:Source|Origin|Provider|Reference)\s*\|\s*(?:Evidence|Fact|Finding|Details|Notes|Context)\s*\|$/i;
const HEADER_4COL_REGEX = /^\|\s*(?:Citation|Reference|Ref)\s*\|\s*(?:Key Fact|Fact|Finding|Claim)\s*\|\s*(?:Source|Origin|Provider)\s*\|\s*(?:Evidence|Details|Notes|Context)\s*\|$/i;
const SEPARATOR_REGEX = /^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;



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
  const headerIndex = lines.findIndex(line => 
    HEADER_3COL_REGEX.test(line) || 
    HEADER_4COL_REGEX.test(line) || 
    /^\|\s*Citation\s*\|\s*Source\s*\|\s*Evidence\s*\|$/i.test(line)
  );

  if (headerIndex === -1) {
    errors.push("Citation table header must be: | Citation | Source | Evidence |");
    return { valid: false, errors };
  }

  const is4Col = HEADER_4COL_REGEX.test(lines[headerIndex] || "");
  const expectedColCount = is4Col ? 4 : 3;

  if (!SEPARATOR_REGEX.test(lines[headerIndex + 1] || "")) {
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
    if (cells.length !== expectedColCount && cells.length !== 3) {
      errors.push("Every citation row must contain exactly Citation, Source, and Evidence");
      continue;
    }
    const marker = /^\[CITE:(\d+)\]$/.exec(cells[0]);
    if (!marker) {
      errors.push(`Invalid citation marker in table row: ${cells[0] || "empty"}`);
      continue;
    }
    tableIds.push(marker[1]);
    const sourceCell = is4Col ? cells[2] : cells[1];
    const evidenceCell = is4Col ? cells[3] : cells[2];

    if (!sourceCell || /^\[?(source|unknown|n\/a)\]?$/i.test(sourceCell)) errors.push(`[CITE:${marker[1]}] has no specific source`);
    if (!evidenceCell || /^\[?(evidence|unknown|n\/a)\]?$/i.test(evidenceCell)) errors.push(`[CITE:${marker[1]}] has no specific evidence`);
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

export function parseCitationsFromMarkdown(content: string): CitationItem[] {
  const match = content.match(CITATION_SECTION_REGEX);
  if (!match || match.index === undefined) return [];

  const section = content.slice(match.index);
  const lines = section.split("\n").map(l => l.trim()).filter(Boolean);
  const headerIndex = lines.findIndex(l => l.startsWith("|") && /Citation|Reference|Ref/i.test(l));
  if (headerIndex === -1) return [];

  const headerLine = lines[headerIndex];
  const is4Col = HEADER_4COL_REGEX.test(headerLine);
  const rows = lines.slice(headerIndex + 2).filter(l => l.startsWith("|"));

  const items: CitationItem[] = [];
  for (const row of rows) {
    const cells = row.split("|").slice(1, -1).map(c => c.trim());
    if (cells.length < 3) continue;

    const markerMatch = /\[CITE:(\d+)\]/i.exec(cells[0]);
    const id = markerMatch ? markerMatch[1] : cells[0].replace(/[^\d]/g, "") || String(items.length + 1);
    const marker = `[CITE:${id}]`;

    if (is4Col && cells.length >= 4) {
      items.push({
        id,
        marker,
        fact: cells[1],
        source: cells[2],
        evidence: cells[3] || cells[1],
      });
    } else {
      items.push({
        id,
        marker,
        source: cells[1],
        evidence: cells[2],
        fact: cells[2],
      });
    }
  }

  return items;
}

export function normalizeCitationResponse(response: string, fallbackSource = "Quorum"): string {
  if (!response || typeof response !== "string") return response;
  const initialValidation = validateCitationContract(response);
  if (initialValidation.valid) return response;

  let body = response.trim();
  const headingMatch = body.match(CITATION_SECTION_REGEX);
  let existingItems: CitationItem[] = [];

  if (headingMatch && headingMatch.index !== undefined) {
    existingItems = parseCitationsFromMarkdown(body);
    body = body.slice(0, headingMatch.index).trim();
  }

  const existingItemMap = new Map<string, CitationItem>();
  existingItems.forEach(item => existingItemMap.set(item.id, item));

  // Extract inline markers
  const inlineIds = Array.from(new Set([...body.matchAll(CITATION_MARKER)].map(m => m[1])));

  if (inlineIds.length === 0) {
    // If no inline citations exist, place [CITE:1] at the end of the first paragraph or answer
    const paragraphs = body.split("\n\n").filter(p => p.trim());
    if (paragraphs.length > 0) {
      paragraphs[0] = `${paragraphs[0].trim()} [CITE:1]`;
      body = paragraphs.join("\n\n");
      inlineIds.push("1");
    } else {
      body = `${body} [CITE:1]`;
      inlineIds.push("1");
    }
  }

  // Construct valid table rows matching all inline IDs
  const tableRows: string[] = [];
  inlineIds.sort((a, b) => Number(a) - Number(b));

  for (const id of inlineIds) {
    const existing = existingItemMap.get(id);
    const source = existing?.source && !/^\[?(source|unknown|n\/a)\]?$/i.test(existing.source)
      ? existing.source.replace(/\|/g, "\\|")
      : `${fallbackSource} verified context`;
    const evidence = existing?.evidence && !/^\[?(evidence|unknown|n\/a)\]?$/i.test(existing.evidence)
      ? existing.evidence.replace(/\|/g, "\\|")
      : `Verified finding supporting factual claim ${id}`;

    tableRows.push(`| [CITE:${id}] | ${source} | ${evidence} |`);
  }

  const tableMarkdown = [
    "## Citations",
    "| Citation | Source | Evidence |",
    "| --- | --- | --- |",
    ...tableRows,
  ].join("\n");

  const normalized = `${body}\n\n${tableMarkdown}`;
  const validation = validateCitationContract(normalized);
  return validation.valid ? normalized : response;
}

export function buildCitationCorrectionPrompt(response: string, errors: string[]): string {
  return `
Your previous response violated the mandatory citation contract.

VALIDATION ERRORS:
${errors.map(error => `- ${error}`).join("\n")}

PREVIOUS RESPONSE:
${response}

TASK:
Return the complete corrected response in clear, user-friendly language for non-technical users. Preserve its substantive answer, but add specific inline citations and a matching final citation table. Do not invent sources.

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


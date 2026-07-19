export interface ExtractedTopic {
  label: string;
  category: "Architecture" | "Implementation" | "Security" | "Performance" | "Analytics" | "Research";
  score: number;
  nGramLength: number;
  occurrences: number;
}

// Comprehensive set of programming syntax keywords, common English stopwords, and generic chat filler
const STOP_WORDS = new Set([
  // Basic English Stopwords
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during',
  'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s',
  'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself',
  'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my', 'myself',
  'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such',
  'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very',
  'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t',
  'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves',

  // Common Chat & Filler Words
  'also', 'just', 'like', 'make', 'made', 'using', 'used', 'use', 'user', 'users', 'system', 'agent', 'agents', 'athena',
  'file', 'files', 'code', 'text', 'data', 'test', 'tests', 'line', 'lines', 'page', 'view', 'component', 'function',
  'return', 'const', 'let', 'var', 'async', 'await', 'import', 'export', 'class', 'default', 'interface', 'type',
  'string', 'number', 'boolean', 'void', 'null', 'undefined', 'true', 'false', 'object', 'array', 'table', 'index',
  'props', 'state', 'event', 'target', 'value', 'result', 'error', 'name', 'id', 'message', 'messages', 'chat', 'session',
  'please', 'help', 'need', 'want', 'look', 'see', 'check', 'show', 'tell', 'give', 'know', 'think', 'well', 'going',
  'sure', 'thanks', 'thank', 'okay', 'right', 'good', 'great', 'fine', 'first', 'second', 'new', 'old', 'next', 'previous'
]);

// Keyword to Domain Category Mapping
const CATEGORY_RULES: { category: ExtractedTopic["category"]; keywords: RegExp }[] = [
  {
    category: "Architecture",
    keywords: /architect|design|structure|system|module|boundary|pattern|schema|database|sqlite|ipc|process|electron|vite|routing|framework|pipeline|infrastructure|topology/i
  },
  {
    category: "Security",
    keywords: /security|auth|jwt|token|permission|vulnerability|audit|sanitize|injection|encrypt|crypto|policy|role|cross-check|isolation|breach|risk/i
  },
  {
    category: "Performance",
    keywords: /performance|latency|speed|optimize|fast|cache|memory|embedding|stream|parallel|batch|render|async|stale|drift|benchmark|throughput/i
  },
  {
    category: "Implementation",
    keywords: /implement|fix|bug|refactor|handler|component|react|typescript|function|script|logic|ui|interface|dom|css|state|build|deploy/i
  },
  {
    category: "Analytics",
    keywords: /analytic|topic|summar|extract|cluster|drift|sentiment|metric|score|report|debrief|insight|evaluation|intent|graph|stats|count/i
  },
  {
    category: "Research",
    keywords: /research|investigat|explore|discover|source|doc|reference|query|search|find|question|study|analysis|review/i
  }
];

function determineCategory(phrase: string): ExtractedTopic["category"] {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.test(phrase)) {
      return rule.category;
    }
  }
  return "Implementation";
}

function capitalizeWords(str: string): string {
  return str
    .split(/\s+/)
    .map(w => w.length <= 3 && !['api', 'jwt', 'cpu', 'ipc', 'url', 'uri', 'sql', 'ui', 'db', 'nlp'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Extracts meaningful, multi-word n-gram topic phrases from conversation text or prompts.
 * Uses N-gram frequency, stopword filtering, position weighting, and domain classification.
 */
export function extractMeaningfulTopics(text: string, maxTopics: number = 8): ExtractedTopic[] {
  if (!text || !text.trim()) return [];

  // Clean text and extract tokens
  const cleanText = text
    .replace(/```[\s\S]*?```/g, '') // remove code blocks to prevent raw code noise
    .replace(/[^\w\s-]/g, ' ')
    .toLowerCase();

  const words = cleanText.split(/\s+/).filter(w => w.length > 2);
  const nGramFreqs: Record<string, { occurrences: number; score: number; length: number }> = {};

  // 1-Grams
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (STOP_WORDS.has(word) || word.length < 3 || /^\d+$/.test(word)) continue;
    
    // Position weight: earlier words in prompt/session get slightly higher weight
    const positionWeight = 1.0 + Math.max(0, (100 - i) / 200);
    const key = word;

    if (!nGramFreqs[key]) {
      nGramFreqs[key] = { occurrences: 0, score: 0, length: 1 };
    }
    nGramFreqs[key].occurrences += 1;
    nGramFreqs[key].score += positionWeight;
  }

  // 2-Grams (Compound keyphrases like "topic drift", "neural summary", "chat speed")
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];

    if (STOP_WORDS.has(w1) && STOP_WORDS.has(w2)) continue;
    if (w1.length < 3 && w2.length < 3) continue;
    if (/^\d+$/.test(w1) || /^\d+$/.test(w2)) continue;

    const phrase = `${w1} ${w2}`;
    const positionWeight = 1.5 + Math.max(0, (100 - i) / 200);

    if (!nGramFreqs[phrase]) {
      nGramFreqs[phrase] = { occurrences: 0, score: 0, length: 2 };
    }
    nGramFreqs[phrase].occurrences += 1;
    nGramFreqs[phrase].score += positionWeight * 2.2; // Boost 2-grams
  }

  // 3-Grams (e.g. "topic extraction summarization", "chat performance optimization")
  for (let i = 0; i < words.length - 2; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    const w3 = words[i + 2];

    const stopCount = (STOP_WORDS.has(w1) ? 1 : 0) + (STOP_WORDS.has(w2) ? 1 : 0) + (STOP_WORDS.has(w3) ? 1 : 0);
    if (stopCount >= 2) continue;

    const phrase = `${w1} ${w2} ${w3}`;
    const positionWeight = 2.0 + Math.max(0, (100 - i) / 200);

    if (!nGramFreqs[phrase]) {
      nGramFreqs[phrase] = { occurrences: 0, score: 0, length: 3 };
    }
    nGramFreqs[phrase].occurrences += 1;
    nGramFreqs[phrase].score += positionWeight * 3.0; // Boost 3-grams
  }

  // Deduplicate overlapping phrases (prefer longer or higher scoring phrases)
  const entries = Object.entries(nGramFreqs)
    .map(([phrase, data]) => ({
      phrase,
      occurrences: data.occurrences,
      score: data.score,
      length: data.length
    }))
    .sort((a, b) => b.score - a.score);

  const selectedPhrases: typeof entries = [];
  for (const entry of entries) {
    // Check if entry is a subphrase of an already selected higher-scoring phrase
    const isSubphrase = selectedPhrases.some(sel => sel.phrase.includes(entry.phrase) && sel.phrase !== entry.phrase);
    if (!isSubphrase) {
      selectedPhrases.push(entry);
    }
    if (selectedPhrases.length >= maxTopics * 2) break;
  }

  return selectedPhrases
    .slice(0, maxTopics)
    .map(item => {
      const formattedLabel = capitalizeWords(item.phrase);
      return {
        label: formattedLabel,
        category: determineCategory(item.phrase),
        score: Math.round(item.score * 10) / 10,
        nGramLength: item.length,
        occurrences: item.occurrences,
      };
    });
}

import { extractMeaningfulTopics } from "./topicExtraction";

export interface RankedPulseIntent {
  rank: number;
  topic: string;
  intent: string;
  reason: string;
}

export interface PulseIntent {
  request: string;
  timestamp: number;
  source: "ai" | "fallback";
  summary: string;
  goal: string;
  action: string;
  entities: string[];
  constraints: string[];
  expectedOutcome: string;
  topics: string[];
  rankedIntents: RankedPulseIntent[];
}

export interface EmbeddedPulseMessage {
  id: string;
  content: string;
  vector: number[];
}

export interface EmbeddedTopicCandidate {
  label: string;
  vector: number[];
}

export interface SemanticPulseTopic {
  topic: string;
  percentage: number;
  messageCount: number;
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return -1;

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) return -1;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`AI intent response is missing ${field}.`);
  }
  return value.trim();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map(item => item.trim());
}
export function parsePulseIntentAnalysis(raw: string, request: string, timestamp: number): PulseIntent {
  const fencedMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/i);
  const parsed = JSON.parse(fencedMatch ? fencedMatch[1] : raw.trim()) as Record<string, unknown>;
  const rankedRaw = Array.isArray(parsed.rankedIntents) ? parsed.rankedIntents : [];
  const rankedIntents = rankedRaw.map((item, index) => {
    const ranked = item as Record<string, unknown>;
    return {
      rank: typeof ranked.rank === "number" ? ranked.rank : index + 1,
      topic: stringValue(ranked.topic, `rankedIntents[${index}].topic`),
      intent: stringValue(ranked.intent, `rankedIntents[${index}].intent`),
      reason: stringValue(ranked.reason, `rankedIntents[${index}].reason`),
    };
  });

  let extractedTopics = stringArray(parsed.topics);
  if (extractedTopics.length === 0) {
    extractedTopics = extractMeaningfulTopics(request, 5).map(t => t.label);
  }

  return {
    request,
    timestamp,
    source: "ai",
    summary: stringValue(parsed.summary, "summary"),
    goal: stringValue(parsed.goal, "goal"),
    action: stringValue(parsed.action, "action"),
    entities: stringArray(parsed.entities),
    constraints: stringArray(parsed.constraints),
    expectedOutcome: stringValue(parsed.expectedOutcome, "expectedOutcome"),
    topics: extractedTopics,
    rankedIntents,
  };
}

export function createFallbackPulseIntent(request: string, timestamp: number): PulseIntent {
  const extracted = extractMeaningfulTopics(request, 5);
  const topics = extracted.map(t => t.label);
  const primaryTopic = topics[0] || "General Request";

  return {
    request,
    timestamp,
    source: "fallback",
    summary: request,
    goal: request,
    action: "Respond to the user request",
    entities: [],
    constraints: [],
    expectedOutcome: "A response that directly addresses the request",
    topics,
    rankedIntents: [{
      rank: 1,
      topic: primaryTopic,
      intent: request,
      reason: "AI intent analysis was unavailable",
    }],
  };
}

function meanVector(vectors: number[][]): number[] {
  return vectors[0].map((_, dimension) => (
    vectors.reduce((sum, vector) => sum + vector[dimension], 0) / vectors.length
  ));
}

export function clusterSemanticTopics(
  messages: EmbeddedPulseMessage[],
  candidates: EmbeddedTopicCandidate[],
  threshold = 0.58,
): SemanticPulseTopic[] {
  const usableMessages = messages.filter(message => message.vector.length > 0);
  if (usableMessages.length === 0) return [];

  const clusters: EmbeddedPulseMessage[][] = [];
  usableMessages.forEach(message => {
    let bestClusterIndex = -1;
    let bestSimilarity = -1;

    clusters.forEach((cluster, index) => {
      const similarity = cosineSimilarity(message.vector, meanVector(cluster.map(item => item.vector)));
      if (similarity > bestSimilarity) {
        bestClusterIndex = index;
        bestSimilarity = similarity;
      }
    });

    if (bestClusterIndex >= 0 && bestSimilarity >= threshold) {
      clusters[bestClusterIndex].push(message);
    } else {
      clusters.push([message]);
    }
  });

  return clusters
    .map((cluster, index) => {
      const centroid = meanVector(cluster.map(message => message.vector));
      const bestCandidate = candidates
        .filter(candidate => candidate.vector.length === centroid.length)
        .map(candidate => ({ ...candidate, similarity: cosineSimilarity(centroid, candidate.vector) }))
        .sort((left, right) => right.similarity - left.similarity)[0];

      return {
        topic: bestCandidate?.label || `Semantic cluster ${index + 1}`,
        percentage: Math.round((cluster.length / usableMessages.length) * 100),
        messageCount: cluster.length,
      };
    })
    .sort((left, right) => right.messageCount - left.messageCount);
}

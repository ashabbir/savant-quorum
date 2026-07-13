import { describe, expect, it } from "vitest";
import {
  clusterSemanticTopics,
  parsePulseIntentAnalysis,
} from "../../services/pulseAnalytics";

describe("pulse analytics", () => {
  it("parses structured AI intent output", () => {
    const intent = parsePulseIntentAnalysis(
      JSON.stringify({
        summary: "Implement semantic topic modeling",
        goal: "Improve Pulse analytics",
        action: "Replace fixed topic labels",
        entities: ["Pulse", "DistilBERT"],
        constraints: ["Keep inference local"],
        expectedOutcome: "Topics reflect the conversation",
        topics: ["Semantic topic modeling", "AI intent analysis"],
        rankedIntents: [
          {
            rank: 1,
            topic: "Semantic topic modeling",
            intent: "Cluster messages using DistilBERT",
            reason: "Core implementation",
          },
        ],
      }),
      "Model Pulse topics",
      123,
    );

    expect(intent.source).toBe("ai");
    expect(intent.summary).toBe("Implement semantic topic modeling");
    expect(intent.topics).toEqual(["Semantic topic modeling", "AI intent analysis"]);
    expect(intent.rankedIntents[0].intent).toBe("Cluster messages using DistilBERT");
  });

  it("clusters message embeddings and labels clusters from AI topics", () => {
    const topics = clusterSemanticTopics(
      [
        { id: "m1", vector: [1, 0], content: "Build the topic model" },
        { id: "m2", vector: [0.95, 0.05], content: "Cluster semantic messages" },
        { id: "m3", vector: [0, 1], content: "Generate user intent" },
      ],
      [
        { label: "Semantic topic modeling", vector: [1, 0] },
        { label: "AI intent analysis", vector: [0, 1] },
      ],
      0.8,
    );

    expect(topics).toEqual([
      { topic: "Semantic topic modeling", percentage: 67, messageCount: 2 },
      { topic: "AI intent analysis", percentage: 33, messageCount: 1 },
    ]);
  });
});

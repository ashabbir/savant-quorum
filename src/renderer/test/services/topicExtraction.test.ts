import { describe, expect, it } from "vitest";
import { extractMeaningfulTopics } from "../../services/topicExtraction";

describe("topicExtraction service", () => {
  it("extracts meaningful multi-word N-gram topics and ignores syntax keywords", () => {
    const text = `
      We need to refactor the authentication token handler and fix sqlite query latency issues.
      The topic extraction summarization pipeline should group topics cleanly into architecture and performance.
      const function return async await let var string number boolean
    `;

    const topics = extractMeaningfulTopics(text, 6);
    const labels = topics.map(t => t.label);

    expect(labels.length).toBeGreaterThan(0);
    // Should extract multi-word or compound domain topics
    expect(labels.some(l => /authentication|token|query|latency|summarization|refactor/i.test(l))).toBe(true);
    // Should NOT contain raw syntax keywords
    expect(labels.includes("Const")).toBe(false);
    expect(labels.includes("Function")).toBe(false);
    expect(labels.includes("Return")).toBe(false);
    expect(labels.includes("Let")).toBe(false);
  });

  it("handles empty or whitespace inputs gracefully", () => {
    expect(extractMeaningfulTopics("")).toEqual([]);
    expect(extractMeaningfulTopics("   ")).toEqual([]);
  });

  it("categorizes topics correctly", () => {
    const topics = extractMeaningfulTopics("Security authentication token vulnerability audit sqlite database schema", 5);
    expect(topics.some(t => t.category === "Security")).toBe(true);
    expect(topics.some(t => t.category === "Architecture")).toBe(true);
  });
});

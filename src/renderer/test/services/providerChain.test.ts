import { describe, expect, it } from "vitest";
import {
  availableProviderLinks,
  isProviderExhaustion,
  providerLinkKey,
  resolveProviderChain,
} from "../../services/providerChain";

const appChain = [
  { provider: "codex", model: "gpt-5" },
  { provider: "claude", model: "sonnet" },
];

describe("providerChain", () => {
  it("uses an agent override when one is configured", () => {
    const chain = resolveProviderChain(appChain, [{
      id: "engineer",
      name: "Engineer",
      providerChain: [{ provider: "gemini", model: "gemini-2.5-pro" }],
    }], "Engineer");

    expect(chain).toEqual([{ provider: "gemini", model: "gemini-2.5-pro" }]);
  });

  it("inherits the app chain when the agent override is empty", () => {
    expect(resolveProviderChain(appChain, [{
      id: "engineer",
      providerChain: [],
    }], "engineer")).toEqual(appChain);
  });

  it("removes exhausted links while preserving configured order", () => {
    const exhausted = new Set([providerLinkKey(appChain[0])]);
    expect(availableProviderLinks(appChain, exhausted)).toEqual([appChain[1]]);
  });

  it("distinguishes quota exhaustion from transient provider failures", () => {
    expect(isProviderExhaustion(new Error("Gateway returned 429 - quota_exhausted"))).toBe(true);
    expect(isProviderExhaustion(new Error("Gateway connection lost"))).toBe(false);
  });
});

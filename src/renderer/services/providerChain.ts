export interface ProviderChainLink {
  id?: string;
  provider: string;
  model: string;
}

export interface AgentProviderConfig {
  id?: string;
  name?: string;
  providerChain?: ProviderChainLink[];
}

export const DEFAULT_PROVIDER_CHAIN: ProviderChainLink[] = [
  { provider: "gemini", model: "gemini-2.0-flash" },
  { provider: "claude", model: "haiku" },
];

export function providerLinkKey(link: Pick<ProviderChainLink, "provider" | "model">): string {
  return `${link.provider.trim().toLowerCase()}:${link.model.trim().toLowerCase()}`;
}

export function resolveProviderChain(
  appChain: unknown,
  agents: unknown,
  agentName: string,
): ProviderChainLink[] {
  const configuredAppChain = normalizeChain(appChain);
  const configuredAgents = Array.isArray(agents) ? agents as AgentProviderConfig[] : [];
  const normalizedAgentName = agentName.trim().toLowerCase();
  const agent = configuredAgents.find(candidate =>
    [candidate.id, candidate.name]
      .filter(Boolean)
      .some(value => String(value).trim().toLowerCase() === normalizedAgentName),
  );
  const agentChain = normalizeChain(agent?.providerChain);
  return agentChain.length > 0
    ? agentChain
    : configuredAppChain.length > 0
      ? configuredAppChain
      : DEFAULT_PROVIDER_CHAIN;
}

export function availableProviderLinks(
  chain: ProviderChainLink[],
  exhaustedKeys: ReadonlySet<string>,
): ProviderChainLink[] {
  return chain.filter(link => !exhaustedKeys.has(providerLinkKey(link)));
}

export function isProviderExhaustion(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /(?:^|\b)429\b|quota[_\s-]?exhausted|insufficient[_\s-]?quota|rate[_\s-]?limit|usage limit|credit(?:s)? (?:exhausted|depleted|balance)|billing hard limit|upgrade to pro/i.test(message);
}

function normalizeChain(value: unknown): ProviderChainLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => ({
      ...(typeof item?.id === "string" ? { id: item.id } : {}),
      provider: typeof item?.provider === "string" ? item.provider.trim() : "",
      model: typeof item?.model === "string" ? item.model.trim() : "",
    }))
    .filter(item => item.provider && item.model);
}

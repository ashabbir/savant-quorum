import { useState, useRef, useEffect } from "react";
import { Activity, GitBranch, FileText, Upload, Sparkles, Search, ListChecks, Terminal, RefreshCcw, Timer, Cpu, Zap, AlertTriangle, X, Copy, Download } from "lucide-react";
import { AreaChart, Area, LineChart, Line, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, PieChart, Pie, Tooltip as RechartsTooltip, RadialBarChart, RadialBar, Treemap } from "recharts";
import { motion, AnimatePresence } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Thinking } from "../App";
import { Message } from "./ChatArea";
import { ChatMarkdown } from "./ChatMarkdown";
import * as d3 from "d3";

const TABS = [
  { id: "pulse", icon: Activity, label: "pulse" },
  { id: "trace", icon: Cpu, label: "trace" },
  { id: "graph", icon: GitBranch, label: "graph" },
  { id: "summary", icon: FileText, label: "summary" },
  { id: "uploads", icon: Upload, label: "files" },
] as const;

type TabId = typeof TABS[number]["id"];

interface RightPanelProps {
  thinking: Thinking[];
  messages: Message[];
  statusText: string;
  sessionSummary: string;
  onSummarize: () => void;
  settings?: Record<string, any>;
  sessionFiles?: { name: string; content: string; summary?: string; loading?: boolean }[];
  onUploadFile?: (name: string, content: string) => Promise<string>;
  onDeleteSessionFile?: (name: string) => void;
}

function cleanLegacySummaryValue(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).trim()
    : trimmed;
}

function restoreLegacyOutcomeMarkdown(value: string) {
  return cleanLegacySummaryValue(value)
    .replace(/\s+---\s+/g, "\n\n---\n\n")
    .replace(
      /\s*##\s+(Answer|Evidence and reasoning|Uncertainty and counterevidence|Citations)\s+/gi,
      "\n\n#### $1\n\n",
    )
    .replace(/\s+(?=##\s+)/g, "\n\n")
    .replace(/^##\s+/gm, "#### ")
    .replace(/\s+(?=\d+\.\s+[A-Z])/g, "\n\n");
}

function normalizeSessionSummaryMarkdown(summary: string) {
  if (!summary.trim()) return "# Session Summary\n\nNo summary generated yet.";

  let turn = 0;
  let legacyTurnFound = false;
  const normalizedLines = summary.split("\n").flatMap(line => {
    const question = line.match(/^\s*-\s*User asked:\s*(.+)$/i);
    if (question) {
      turn += 1;
      legacyTurnFound = true;
      return [
        "",
        `## Turn ${turn}`,
        "",
        "### Question",
        "",
        `> ${cleanLegacySummaryValue(question[1])}`,
      ];
    }

    const agents = line.match(/^\s*-\s*Athena engaged:\s*(.+)$/i);
    if (agents) {
      return ["", `**Agents:** ${cleanLegacySummaryValue(agents[1])}`];
    }

    const outcome = line.match(/^\s*-\s*Outcome:\s*(.+)$/i);
    if (outcome) {
      return ["", "### Outcome", "", restoreLegacyOutcomeMarkdown(outcome[1])];
    }

    return [line];
  });

  if (!legacyTurnFound) return summary;
  const normalized = normalizedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return normalized.startsWith("# ") ? normalized : `# Session Summary\n\n${normalized}`;
}

function NavIcon({
  icon, label, onClick, isActive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  isActive?: boolean;
}) {
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={onClick}
            aria-label={`${label} insights`}
            style={{
              color: "var(--primary)",
              opacity: isActive ? 1 : 0.45,
              borderRight: isActive ? "2px solid var(--primary)" : "2px solid transparent",
            }}
            className="w-10 h-10 flex items-center justify-center hover:opacity-100 transition-all"
          >
            {icon}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="left"
            style={{
              background: "var(--secondary)",
              border: "1px solid var(--border)",
              color: "var(--primary)",
              fontFamily: "'Share Tech Mono', monospace",
            }}
            className="px-2 py-1 text-xs z-50"
          >
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function InsightsDashboard({
  thinking,
  messages,
  statusText,
}: {
  thinking: Thinking[];
  messages: Message[];
  statusText: string;
}) {
  const agentLabel = (message: Message) => {
    if (message.role === "user") return "YOU";
    if (message.role === "agent-whisper" && message.from) return message.from.toUpperCase();
    if (["athena", "moderator", "athena-whisper", "moderator-whisper"].includes(message.role)) return "ATHENA";
    return message.role.toUpperCase();
  };

  const visibleMessages = messages.filter(message => !["system", "internal"].includes(message.role));
  const responseMessages = visibleMessages.filter(message =>
    !["user", "error", "whisper", "agent-whisper", "athena-whisper", "moderator-whisper"].includes(message.role)
  );
  const citationIds = new Set(
    visibleMessages.flatMap(message => message.content.match(/\[CITE:\d+\]/gi) || [])
  );
  const citedResponses = responseMessages.filter(message => /\[CITE:\d+\]/i.test(message.content)).length;
  const citationCoverage = responseMessages.length > 0
    ? Math.round((citedResponses / responseMessages.length) * 100)
    : 0;
  const citationTablePresent = responseMessages.some(message => /##\s+Citations/i.test(message.content));
  const crossChecks = visibleMessages.filter(message => /cross-check/i.test(message.content)).length;
  const errors = visibleMessages.filter(message => message.role === "error");
  const timeouts = thinking.filter(item => item.type === "timeout").length;

  const contributionMap = new Map<string, { name: string; words: number; messages: number; citations: number }>();
  visibleMessages
    .filter(message => !["user", "error", "whisper", "athena-whisper", "moderator-whisper"].includes(message.role))
    .forEach(message => {
      const name = agentLabel(message);
      const current = contributionMap.get(name) || { name, words: 0, messages: 0, citations: 0 };
      current.words += message.content.trim().split(/\s+/).filter(Boolean).length;
      current.messages += 1;
      current.citations += (message.content.match(/\[CITE:\d+\]/gi) || []).length;
      contributionMap.set(name, current);
    });
  const contributions = Array.from(contributionMap.values())
    .sort((left, right) => right.words - left.words)
    .slice(0, 6);

  let userTurns = 0;
  let answerTurns = 0;
  let evidenceMarkers = 0;
  const timeline = visibleMessages.map((message, index) => {
    if (message.role === "user") userTurns += 1;
    if (responseMessages.includes(message)) answerTurns += 1;
    evidenceMarkers += (message.content.match(/\[CITE:\d+\]/gi) || []).length;
    return { step: index + 1, userTurns, answerTurns, evidenceMarkers };
  });

  const executionEffort = [
    {
      name: "MODERATION",
      value: thinking.filter(item => item.agent.toLowerCase() === "athena" && item.type !== "error").length,
      color: "var(--primary)",
    },
    {
      name: "SPECIALISTS",
      value: thinking.filter(item => !["athena", "system"].includes(item.agent.toLowerCase()) && item.type !== "error").length,
      color: "var(--chart-3)",
    },
    {
      name: "TOOLS",
      value: thinking.filter(item => ["mcp_call", "mcp_response", "shell"].includes(item.type || "")).length,
      color: "var(--chart-5)",
    },
    {
      name: "FAILURES",
      value: thinking.filter(item => ["error", "timeout"].includes(item.type || "")).length + errors.length,
      color: "var(--accent)",
    },
  ];

  const concerns: string[] = [];
  if (errors.length > 0) concerns.push(`${errors.length} user-visible error${errors.length === 1 ? "" : "s"} occurred.`);
  if (timeouts > 0) concerns.push(`${timeouts} timeout${timeouts === 1 ? "" : "s"} interrupted execution.`);
  if (responseMessages.length > 0 && citationCoverage < 100) {
    concerns.push(`${responseMessages.length - citedResponses} final response${responseMessages.length - citedResponses === 1 ? "" : "s"} lacked inline citations.`);
  }
  if (citationIds.size > 0 && !citationTablePresent) concerns.push("Inline citations exist without a citation table.");
  if (crossChecks === 0 && contributions.length > 1) concerns.push("Multiple agents contributed without a recorded adversarial cross-check.");

  const estimatedTokens = Math.round(
    (messages.reduce((sum, message) => sum + message.content.length, 0) +
      thinking.reduce((sum, item) => sum + item.thought.length, 0)) / 4
  );
  const runActive = statusText !== "IDLE";

  const cardStyle = {
    background: "var(--card)",
    border: "1px solid var(--border)",
  };
  const chartTooltip = {
    background: "var(--secondary)",
    border: "1px solid var(--border)",
    color: "var(--foreground)",
    fontSize: "10px",
  };

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: "thin" }}>
      <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--primary)] opacity-70" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
        01 / Overview
      </div>
      <section style={cardStyle} className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--foreground)]">What is happening now?</h2>
            <p className="text-[10px] text-[var(--muted-foreground)] mt-1">
              Live run state and the observable session footprint.
            </p>
          </div>
          <span
            className="text-[10px] font-bold px-2 py-1 border"
            style={{
              color: runActive ? "var(--warning)" : "var(--good)",
              borderColor: runActive ? "var(--warning)" : "var(--good)",
              fontFamily: "'Share Tech Mono', monospace",
            }}
          >
            {statusText}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            ["MESSAGES", visibleMessages.length],
            ["AGENTS", contributions.length],
            ["EVIDENCE", citationIds.size],
            ["EST. TOKENS", estimatedTokens],
          ].map(([label, value]) => (
            <div key={label} className="bg-[var(--secondary)] border border-[var(--border)] p-2">
              <div className="text-[8px] opacity-50">{label}</div>
              <div className="text-base font-bold text-[var(--primary)] mt-1" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 text-[9px] uppercase tracking-[0.2em] text-[var(--chart-3)] opacity-70 mt-1" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          02 / Swarm contribution
        </div>
        <section style={cardStyle} className="p-3 col-span-2">
          <h3 className="text-xs font-bold">Who contributed useful output?</h3>
          <p className="text-[9px] text-[var(--muted-foreground)] mt-1">
            Word volume by contributing agent; hover for messages and citations.
          </p>
          {contributions.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={contributions} layout="vertical" margin={{ top: 12, right: 12, bottom: 8, left: 10 }}>
                <XAxis type="number" tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} />
                <YAxis dataKey="name" type="category" width={72} tick={{ fontSize: 8, fill: "var(--foreground)" }} />
                <RechartsTooltip contentStyle={chartTooltip} />
                <Bar dataKey="words" name="Words contributed" fill="var(--chart-3)" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[170px] flex items-center justify-center text-[10px] opacity-40">No agent output yet.</div>
          )}
        </section>

        <div className="col-span-2 text-[9px] uppercase tracking-[0.2em] text-[var(--good)] opacity-70 mt-1" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          03 / Evidence
        </div>
        <section style={cardStyle} className="p-3">
          <h3 className="text-xs font-bold">Is the answer evidence-backed?</h3>
          <p className="text-[9px] text-[var(--muted-foreground)] mt-1">
            Coverage is the share of final responses with inline citations.
          </p>
          <div className="flex items-center gap-4 mt-5">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center"
              style={{
                background: `conic-gradient(var(--good) ${citationCoverage * 3.6}deg, var(--secondary) 0deg)`,
              }}
            >
              <div className="w-16 h-16 rounded-full bg-[var(--card)] flex items-center justify-center">
                <span className="text-xl font-bold text-[var(--good)]">{citationCoverage}%</span>
              </div>
            </div>
            <div className="flex-1 space-y-2 text-[10px]">
              <div className="flex justify-between"><span>Inline references</span><strong>{citationIds.size}</strong></div>
              <div className="flex justify-between"><span>Cited final responses</span><strong>{citedResponses}/{responseMessages.length}</strong></div>
              <div className="flex justify-between"><span>Citation table</span><strong>{citationTablePresent ? "YES" : "NO"}</strong></div>
              <div className="flex justify-between"><span>Cross-checks</span><strong>{crossChecks}</strong></div>
            </div>
          </div>
        </section>

        <div className="col-span-2 text-[9px] uppercase tracking-[0.2em] text-[var(--chart-5)] opacity-70 mt-1" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          04 / Execution
        </div>
        <section style={cardStyle} className="p-3 col-span-2">
          <h3 className="text-xs font-bold">How did the conversation accumulate evidence?</h3>
          <p className="text-[9px] text-[var(--muted-foreground)] mt-1">
            Cumulative turns and citation markers across the visible message sequence.
          </p>
          {timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={timeline} margin={{ top: 12, right: 12, bottom: 8, left: -18 }}>
                <XAxis dataKey="step" tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} />
                <RechartsTooltip contentStyle={chartTooltip} />
                <Line type="monotone" dataKey="userTurns" name="User turns" stroke="var(--primary)" dot={false} />
                <Line type="monotone" dataKey="answerTurns" name="Final answers" stroke="var(--chart-3)" dot={false} />
                <Line type="monotone" dataKey="evidenceMarkers" name="Citation markers" stroke="var(--good)" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[170px] flex items-center justify-center text-[10px] opacity-40">No conversation data yet.</div>
          )}
        </section>

        <section style={cardStyle} className="p-3">
          <h3 className="text-xs font-bold">Where did execution effort go?</h3>
          <p className="text-[9px] text-[var(--muted-foreground)] mt-1">
            Recorded orchestration events grouped by purpose, not inferred latency.
          </p>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={executionEffort} margin={{ top: 12, right: 12, bottom: 8, left: -18 }}>
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: "var(--foreground)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} />
              <RechartsTooltip contentStyle={chartTooltip} />
              <Bar dataKey="value" name="Recorded events" radius={[2, 2, 0, 0]}>
                {executionEffort.map(item => <Cell key={item.name} fill={item.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section style={cardStyle} className="p-3">
        <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--accent)] opacity-70 mb-2" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          05 / Attention
        </div>
        <h3 className="text-xs font-bold">What needs attention?</h3>
        <p className="text-[9px] text-[var(--muted-foreground)] mt-1">
          Actionable gaps derived from errors, timeouts, citations, and review coverage.
        </p>
        <div className="mt-3 space-y-2">
          {concerns.length > 0 ? concerns.map(concern => (
            <div key={concern} className="flex items-start gap-2 bg-[rgba(255,0,85,0.05)] border border-[rgba(255,0,85,0.2)] p-2 text-[10px]">
              <AlertTriangle size={12} className="text-[var(--accent)] mt-0.5 shrink-0" />
              <span>{concern}</span>
            </div>
          )) : (
            <div className="flex items-center gap-2 bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] p-2 text-[10px] text-[var(--good)]">
              <ListChecks size={12} />
              No observable evidence, execution, or review gaps.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function QualityPulseDashboard({
  thinking,
  messages,
  statusText,
}: {
  thinking: Thinking[];
  messages: Message[];
  statusText: string;
}) {
  const stopWords = new Set([
    "about", "after", "again", "also", "and", "are", "because", "before", "being", "could",
    "does", "from", "have", "into", "only", "should", "that", "their", "there", "these",
    "they", "this", "those", "through", "using", "what", "when", "where", "which", "with",
    "would", "your",
  ]);
  const keywords = (text: string) => new Set(
    text.toLowerCase()
      .replace(/\[cite:\d+\]/gi, " ")
      .replace(/[^a-z0-9_\s-]/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word))
  );
  const overlapPercent = (source: Set<string>, target: Set<string>) => {
    if (source.size === 0) return 100;
    let matches = 0;
    source.forEach(term => {
      if (target.has(term)) matches += 1;
    });
    return Math.round((matches / source.size) * 100);
  };
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

  const finalRoles = new Set(["athena", "moderator", "ai", "engineer", "architect", "security"]);
  const intentAnswerRoles = new Set(["athena", "moderator", "ai"]);
  const operationalPattern = /\b(still working|taking unusually long|done in \d+s|done \d+s|request received|triaging request|decomposing request|engaging specialists?|calling (?:agent|tool)|mcp|gateway|tool call|pulling|digging|searching|working agents?)\b/i;
  const isSubstantiveAnswer = (message: Message) => (
    finalRoles.has(message.role)
    && !message.role.includes("whisper")
    && !operationalPattern.test(message.content)
    && keywords(message.content).size >= 3
  );
  const participantLabel = (message: Message) => {
    if (message.role === "user") return "USER";
    if (message.role === "agent-whisper" && message.from) return message.from.toUpperCase();
    if (["athena", "moderator", "athena-whisper", "moderator-whisper"].includes(message.role)) return "ATHENA";
    return message.role.toUpperCase();
  };
  const finalAnswers = messages.filter(isSubstantiveAnswer);
  const intentAnswers = finalAnswers.filter(message => intentAnswerRoles.has(message.role));
  const userMessages = messages.filter(message => message.role === "user");
  const latestAnswer = finalAnswers.at(-1);
  const latestAnswerKeywords = keywords(latestAnswer?.content || "");
  const recentUserKeywords = new Set(
    userMessages.slice(-3).flatMap(message => Array.from(keywords(message.content)))
  );

  const driftPoints = intentAnswers.map(answer => {
    const answerIndex = messages.indexOf(answer);
    const precedingUser = messages.slice(0, answerIndex).reverse().find(message => message.role === "user");
    const alignment = overlapPercent(keywords(precedingUser?.content || ""), keywords(answer.content));
    return clamp(100 - alignment);
  });
  const topicDrift = driftPoints.length > 0
    ? clamp(driftPoints.reduce((sum, value) => sum + value, 0) / driftPoints.length)
    : 0;
  const contextRetention = latestAnswer ? overlapPercent(recentUserKeywords, latestAnswerKeywords) : 0;
  const driftTimeline = intentAnswers.map(answer => {
    const answerIndex = messages.indexOf(answer);
    const intentMessage = messages.slice(0, answerIndex).reverse().find(message => message.role === "user");
    const intentKeywords = keywords(intentMessage?.content || "");
    const answerKeywords = keywords(answer.content);
    return {
      id: answer.id,
      actor: participantLabel(answer),
      previousActor: "USER INTENT",
      drift: clamp(100 - overlapPercent(intentKeywords, answerKeywords)),
      topics: Array.from(intentKeywords).slice(0, 4).map(topic => topic.replace(/_/g, " ")),
      words: answer.content.trim().split(/\s+/).filter(Boolean).length,
      timestamp: new Date(answer.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
  });
  const participantDriftMap = new Map<string, { actor: string; total: number; transitions: number; words: number }>();
  driftTimeline.forEach(item => {
    const current = participantDriftMap.get(item.actor) || { actor: item.actor, total: 0, transitions: 0, words: 0 };
    current.total += item.drift;
    current.transitions += 1;
    current.words += item.words;
    participantDriftMap.set(item.actor, current);
  });
  const participantDrift = Array.from(participantDriftMap.values())
    .map(item => ({ ...item, average: clamp(item.total / item.transitions) }))
    .sort((left, right) => right.average - left.average);

  const analysisText = [...messages.map(message => message.content), ...thinking.map(item => item.thought)].join(" ").toLowerCase();
  const agreementSignals = (analysisText.match(/\bagree|agreed|confirmed|supports?|consistent|validated\b/g) || []).length;
  const challengeSignals = (analysisText.match(/\bcontradict|counter|disagree|alternative|uncertain|unverified|limitation|challenge|risk\b/g) || []).length;
  const activeAgents = new Set(
    messages
      .filter(message => message.role === "agent-whisper" && message.from)
      .map(message => message.from!.toLowerCase())
  );
  const confirmationBias = activeAgents.size > 1 && challengeSignals === 0
    ? 85
    : clamp((agreementSignals / Math.max(1, agreementSignals + challengeSignals)) * 100);

  const citedAnswers = finalAnswers.filter(answer => /\[CITE:\d+\]/i.test(answer.content));
  const tableBackedAnswers = finalAnswers.filter(answer => /##\s+Citations/i.test(answer.content));
  const crossCheckedAnswers = finalAnswers.filter(answer => /cross-check|counterevidence|contradict/i.test(answer.content));
  const uncitedAnswers = Math.max(0, finalAnswers.length - citedAnswers.length);
  const shallowCitations = Math.max(0, citedAnswers.length - tableBackedAnswers.length);
  const tableBackedOnly = Math.max(0, tableBackedAnswers.length - crossCheckedAnswers.length);
  const hallucinationRisk = finalAnswers.length === 0 ? 0 : clamp(
    (uncitedAnswers / finalAnswers.length) * 65 +
    (shallowCitations / finalAnswers.length) * 20 +
    ((activeAgents.size > 1 && crossCheckedAnswers.length === 0) ? 15 : 0)
  );

  const capturedInputIndexes = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) =>
      ["athena-whisper", "moderator-whisper"].includes(message.role) &&
      /added context captured|captured your added intel/i.test(message.content)
    );
  const adoptedInputs = capturedInputIndexes.filter(({ index }) =>
    messages.slice(index + 1).some(message => finalRoles.has(message.role))
  ).length;
  const humanInputAdoption = capturedInputIndexes.length > 0
    ? clamp((adoptedInputs / capturedInputIndexes.length) * 100)
    : 100;

  const contradictionsDetected = (analysisText.match(/\bcontradict|conflict|disagree|discrepancy|unverified\b/g) || []).length;
  const contradictionsResolved = (analysisText.match(/\bresolved|corrected|revised|partially-revised|reconciled\b/g) || []).length;
  const contradictionHandling = contradictionsDetected > 0
    ? clamp((Math.min(contradictionsResolved, contradictionsDetected) / contradictionsDetected) * 100)
    : 100;

  const contributionWords = new Map<string, number>();
  messages
    .filter(message => message.role === "agent-whisper" && message.from)
    .forEach(message => {
      const name = message.from!.toUpperCase();
      contributionWords.set(name, (contributionWords.get(name) || 0) + message.content.split(/\s+/).length);
    });
  const totalContributionWords = Array.from(contributionWords.values()).reduce((sum, value) => sum + value, 0);
  const contributionShares = Array.from(contributionWords.entries())
    .map(([name, words]) => ({
      name,
      words,
      share: totalContributionWords > 0 ? Math.round((words / totalContributionWords) * 100) : 0,
    }))
    .sort((left, right) => right.share - left.share);
  const agentDominance = contributionShares[0]?.share || 0;

  const qualityConcerns: Array<{ label: string; detail: string }> = [];
  if (topicDrift >= 60) qualityConcerns.push({ label: "Topic drift", detail: "Final answers retain less than 40% of the preceding user terms." });
  if (confirmationBias >= 65) qualityConcerns.push({ label: "Confirmation bias", detail: "Agreement signals substantially outweigh challenge signals." });
  if (contextRetention < 40 && latestAnswer) qualityConcerns.push({ label: "Context rot", detail: "The latest answer retains few terms from the last three user turns." });
  if (hallucinationRisk >= 50) qualityConcerns.push({ label: "Hallucination risk", detail: "Evidence provenance is missing or shallow for final answers." });
  if (humanInputAdoption < 100) qualityConcerns.push({ label: "HIL adoption", detail: "Some mid-run user context has no later final-answer checkpoint." });
  if (contradictionHandling < 100) qualityConcerns.push({ label: "Contradictions", detail: "Detected conflicts outnumber recorded revisions or resolutions." });
  if (agentDominance > 75 && contributionShares.length > 1) qualityConcerns.push({ label: "Agent dominance", detail: `${contributionShares[0].name} produced ${agentDominance}% of specialist output.` });
  const timeoutCount = thinking.filter(item => item.type === "timeout").length;
  if (timeoutCount > 0) qualityConcerns.push({ label: "Execution reliability", detail: `${timeoutCount} timeout${timeoutCount === 1 ? "" : "s"} recorded.` });

  const topicCounts = new Map<string, number>();
  messages
    .filter(message => !["system", "internal", "error"].includes(message.role))
    .forEach(message => {
      const contentWithoutCitations = message.content.split(/##\s+Citations/i)[0];
      new Set(keywords(contentWithoutCitations)).forEach(topic => {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      });
    });
  const topics = Array.from(topicCounts.entries())
    .map(([topic, mentions]) => ({ topic: topic.replace(/_/g, " "), mentions }))
    .sort((left, right) => right.mentions - left.mentions)
    .slice(0, 10);
  const maxTopicMentions = Math.max(1, topics[0]?.mentions || 1);

  const toolUsageMap = new Map<string, { tool: string; calls: number; agents: Map<string, number> }>();
  const recordTool = (tool: string, agent: string) => {
    const current = toolUsageMap.get(tool) || { tool, calls: 0, agents: new Map<string, number>() };
    const normalizedAgent = agent.toUpperCase();
    current.calls += 1;
    current.agents.set(normalizedAgent, (current.agents.get(normalizedAgent) || 0) + 1);
    toolUsageMap.set(tool, current);
  };
  thinking.forEach(item => {
    if (item.type === "shell") {
      recordTool("Shell command", item.agent);
      return;
    }
    if (item.type !== "mcp_call") return;
    const text = item.thought.toLowerCase();
    if (text.includes("call_gateway")) {
      recordTool("Gateway /runs", item.agent);
      return;
    }
    if (text.includes("resolving_abilities") || text.includes("resolve_abilities")) {
      recordTool("savant-abilities/resolve_abilities", item.agent);
      return;
    }
    const explicitTool = text.match(/(savant-[a-z-]+)[/\s:>_-]+([a-z][a-z0-9_]+)/i);
    recordTool(explicitTool ? `${explicitTool[1]}/${explicitTool[2]}` : "MCP tool call", item.agent);
  });
  const toolsUsed = Array.from(toolUsageMap.values()).sort((left, right) => right.calls - left.calls);

  const agentLedgerMap = new Map<string, {
    agent: string;
    part: string;
    messages: number;
    words: number;
    citations: number;
    tools: number;
    models: Set<string>;
  }>();
  const getLedgerAgent = (message: Message) => {
    if (message.role === "agent-whisper" && message.from) return message.from.toUpperCase();
    if (["athena", "moderator", "athena-whisper", "moderator-whisper"].includes(message.role)) return "ATHENA";
    return message.role.toUpperCase();
  };
  messages
    .filter(message => !["user", "system", "internal", "error", "whisper"].includes(message.role))
    .forEach(message => {
      const agent = getLedgerAgent(message);
      const existing = agentLedgerMap.get(agent) || {
        agent,
        part: agent === "ATHENA" ? "Moderation and synthesis" : "Specialist analysis",
        messages: 0,
        words: 0,
        citations: 0,
        tools: 0,
        models: new Set<string>(),
      };
      existing.messages += 1;
      existing.words += message.content.split(/\s+/).filter(Boolean).length;
      existing.citations += (message.content.match(/\[CITE:\d+\]/gi) || []).length;
      if (/cross-check/i.test(message.content)) existing.part = "Adversarial cross-check";
      else if (/rebuttal|revised|correction/i.test(message.content)) existing.part = "Revision and conflict resolution";
      else if (message.role === "agent-whisper") existing.part = "Specialist evidence and analysis";
      if (message.provider || message.model) {
        existing.models.add(`${message.provider || "unknown"}:${message.model || "unknown"}`);
      }
      agentLedgerMap.set(agent, existing);
    });
  toolsUsed.forEach(tool => {
      tool.agents.forEach((calls, agent) => {
      const existing = agentLedgerMap.get(agent) || {
        agent,
        part: agent === "ATHENA" ? "Moderation and orchestration" : "Tool-assisted analysis",
        messages: 0,
        words: 0,
        citations: 0,
        tools: 0,
        models: new Set<string>(),
      };
      existing.tools += calls;
      agentLedgerMap.set(agent, existing);
    });
  });
  const agentLedger = Array.from(agentLedgerMap.values()).sort((left, right) => right.words - left.words);

  const modelUsageMap = new Map<string, {
    provider: string;
    model: string;
    outputs: number;
    estimatedOutputTokens: number;
    agents: Set<string>;
  }>();
  messages
    .filter(message => !["user", "system", "internal", "error", "whisper"].includes(message.role))
    .forEach(message => {
      const provider = message.provider || "unattributed";
      const model = message.model || "unattributed";
      const key = `${provider}:${model}`;
      const existing = modelUsageMap.get(key) || {
        provider,
        model,
        outputs: 0,
        estimatedOutputTokens: 0,
        agents: new Set<string>(),
      };
      existing.outputs += 1;
      existing.estimatedOutputTokens += Math.ceil(message.content.length / 4);
      existing.agents.add(getLedgerAgent(message));
      modelUsageMap.set(key, existing);
    });
  const modelUsage = Array.from(modelUsageMap.values())
    .sort((left, right) => right.estimatedOutputTokens - left.estimatedOutputTokens);
  const totalEstimatedOutputTokens = modelUsage.reduce((sum, item) => sum + item.estimatedOutputTokens, 0);

  const severity = (risk: number) => risk >= 65 ? "HIGH" : risk >= 35 ? "WATCH" : "LOW";
  const riskColor = (risk: number) => risk >= 65 ? "var(--accent)" : risk >= 35 ? "var(--warning)" : "var(--good)";
  const retentionColor = (score: number) => score < 40 ? "var(--accent)" : score < 70 ? "var(--warning)" : "var(--good)";

  const MetricCard = ({
    title,
    icon,
    value,
    label,
    color,
    description,
    children,
  }: {
    title: string;
    icon: React.ReactNode;
    value: string;
    label: string;
    color: string;
    description: string;
    children: React.ReactNode;
  }) => (
    <article
      className="relative overflow-hidden p-3 min-h-[190px]"
      style={{
        background: "linear-gradient(145deg, color-mix(in srgb, var(--card) 94%, transparent), var(--secondary))",
        border: `1px solid color-mix(in srgb, ${color} 35%, var(--border))`,
      }}
    >
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: color }} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span style={{ color }}>{icon}</span>
          <h3 className="text-xs font-bold">{title}</h3>
        </div>
        <span className="text-[8px] font-bold border px-1.5 py-0.5" style={{ color, borderColor: color }}>
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold mt-3" style={{ color, fontFamily: "'Share Tech Mono', monospace" }}>{value}</div>
      <p className="text-[9px] text-[var(--muted-foreground)] mt-1 min-h-[28px]">{description}</p>
      <div className="mt-3">{children}</div>
    </article>
  );

  const sparklinePoints = (driftPoints.length > 0 ? driftPoints : [0])
    .map((value, index, values) => `${values.length === 1 ? 100 : (index / (values.length - 1)) * 200},${70 - (value / 100) * 60}`)
    .join(" ");

  return (
    <div className="h-full overflow-y-auto p-3 space-y-4" style={{ scrollbarWidth: "thin" }}>
      <header className="flex items-start justify-between gap-3 border border-[var(--border)] bg-[var(--card)] p-3">
        <div>
          <div className="text-[9px] uppercase tracking-[0.22em] text-[var(--primary)]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            AI conversation quality control
          </div>
          <h2 className="text-base font-bold mt-1">Pulse quality signals</h2>
          <p className="text-[10px] text-[var(--muted-foreground)] mt-1">
            Observable risk indicators. Lexical signals are diagnostics, not proof of model intent.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[9px] opacity-50">RUN STATE</div>
          <div className="text-[10px] font-bold mt-1 text-[var(--primary)]">{statusText}</div>
        </div>
      </header>

      <section>
        <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--primary)] mb-2" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          01 / Quality risk matrix
        </div>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            title="Topic drift"
            icon={<GitBranch size={14} />}
            value={`${topicDrift}%`}
            label={severity(topicDrift)}
            color={riskColor(topicDrift)}
            description="Lexical distance between each final answer and its preceding user request."
          >
            <svg viewBox="0 0 200 80" className="w-full h-16" role="img" aria-label="Topic drift across final answers">
              <line x1="0" y1="40" x2="200" y2="40" stroke="var(--border)" strokeDasharray="4 4" />
              <polyline points={sparklinePoints} fill="none" stroke={riskColor(topicDrift)} strokeWidth="3" />
            </svg>
          </MetricCard>

          <MetricCard
            title="Confirmation bias"
            icon={<ListChecks size={14} />}
            value={`${confirmationBias}%`}
            label={severity(confirmationBias)}
            color={riskColor(confirmationBias)}
            description="Risk rises when agreement dominates explicit challenge or counterevidence."
          >
            <div className="space-y-2 text-[9px]">
             <div className="flex justify-between gap-3">
               <span className="text-[var(--accent)]">Agreement <strong>{agreementSignals}</strong></span>
               <span className="text-[var(--good)]">Challenge <strong>{challengeSignals}</strong></span>
              </div>
             <div
               className="h-3 flex bg-[var(--background)] border border-[var(--border)] overflow-hidden"
               role="img"
               aria-label={`Agreement ${agreementSignals}, challenge ${challengeSignals}`}
             >
               <div
                 className="h-full bg-[var(--accent)]"
                 style={{ width: `${(agreementSignals / Math.max(1, agreementSignals + challengeSignals)) * 100}%` }}
               />
               <div
                 className="h-full bg-[var(--good)]"
                 style={{ width: `${(challengeSignals / Math.max(1, agreementSignals + challengeSignals)) * 100}%` }}
               />
             </div>
           </div>
          </MetricCard>

          <MetricCard
            title="Context retention"
            icon={<Cpu size={14} />}
            value={`${contextRetention}%`}
            label={contextRetention < 40 ? "ROT RISK" : contextRetention < 70 ? "WATCH" : "HEALTHY"}
            color={retentionColor(contextRetention)}
            description="Recent user terms retained in the latest final answer; low overlap flags context rot."
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-[var(--background)] border border-[var(--border)] overflow-hidden">
                <div className="h-full" style={{ width: `${contextRetention}%`, background: retentionColor(contextRetention) }} />
              </div>
              <span className="text-[9px] opacity-60">LAST 3 TURNS</span>
            </div>
          </MetricCard>

          <MetricCard
            title="Hallucination risk"
            icon={<AlertTriangle size={14} />}
            value={`${hallucinationRisk}%`}
            label={severity(hallucinationRisk)}
            color={riskColor(hallucinationRisk)}
            description="Evidence-depth signal: uncited, inline-only, table-backed, and cross-checked answers."
          >
            <div className="h-4 flex overflow-hidden border border-[var(--border)]" title="Evidence provenance depth">
              {[
                { value: uncitedAnswers, color: "var(--accent)", label: "Uncited" },
                { value: shallowCitations, color: "var(--warning)", label: "Inline only" },
                { value: tableBackedOnly, color: "var(--primary)", label: "Table backed" },
                { value: crossCheckedAnswers.length, color: "var(--good)", label: "Cross-checked" },
              ].map(item => (
                <div
                  key={item.label}
                  aria-label={`${item.label}: ${item.value}`}
                  style={{
                    width: `${finalAnswers.length > 0 ? (item.value / finalAnswers.length) * 100 : 0}%`,
                    background: item.color,
                  }}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[8px]">
              <span>■ Uncited: {uncitedAnswers}</span>
              <span>■ Inline only: {shallowCitations}</span>
              <span>■ Table backed: {tableBackedOnly}</span>
              <span>■ Cross-checked: {crossCheckedAnswers.length}</span>
            </div>
          </MetricCard>

          <MetricCard
            title="Human input adoption"
            icon={<Activity size={14} />}
            value={`${humanInputAdoption}%`}
            label={humanInputAdoption < 100 ? "CHECK" : "ADOPTED"}
            color={humanInputAdoption < 100 ? "var(--warning)" : "var(--good)"}
            description="Mid-run context acknowledgements followed by a later final-answer checkpoint."
          >
            <div className="flex items-center gap-2">
              {(capturedInputIndexes.length > 0 ? capturedInputIndexes : [{ index: 0 }]).map((_, index) => (
                <div key={index} className="flex items-center flex-1">
                  <span
                    className="w-3 h-3 rounded-full border-2"
                    style={{
                      borderColor: index < adoptedInputs ? "var(--good)" : "var(--warning)",
                      background: index < adoptedInputs ? "var(--good)" : "transparent",
                    }}
                  />
                  {index < Math.max(0, capturedInputIndexes.length - 1) && <span className="h-[2px] flex-1 bg-[var(--border)]" />}
                </div>
              ))}
              <span className="text-[9px]">{adoptedInputs}/{capturedInputIndexes.length}</span>
            </div>
          </MetricCard>

          <MetricCard
            title="Contradiction handling"
            icon={<RefreshCcw size={14} />}
            value={`${contradictionHandling}%`}
            label={contradictionHandling < 100 ? "UNRESOLVED" : "CLEAR"}
            color={contradictionHandling < 100 ? "var(--warning)" : "var(--good)"}
            description="Detected conflicts that are followed by an explicit revision or reconciliation signal."
          >
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="border border-[var(--border)] bg-[var(--background)] p-2">
                <div className="text-lg font-bold text-[var(--warning)]">{contradictionsDetected}</div>
                <div className="text-[8px] opacity-50">DETECTED</div>
              </div>
              <div className="border border-[var(--border)] bg-[var(--background)] p-2">
                <div className="text-lg font-bold text-[var(--good)]">{Math.min(contradictionsResolved, contradictionsDetected)}</div>
                <div className="text-[8px] opacity-50">RESOLVED</div>
              </div>
            </div>
          </MetricCard>
        </div>
      </section>

      <section className="border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--accent)]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          02 / Topic drift attribution
        </div>
        <h3 className="text-xs font-bold mt-2">Topic drift timeline</h3>
        <p className="text-[9px] text-[var(--muted-foreground)] mt-1">
          Each row measures Athena's final synthesis against the latest user intent. Specialist output, MCP/tool traffic, whispers, and status updates are excluded.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          {participantDrift.length > 0 ? participantDrift.map(item => (
            <div key={item.actor} className="border border-[var(--border)] bg-[var(--background)] p-2">
              <div className="flex items-center justify-between gap-2 text-[9px]">
                <strong className="truncate text-[var(--primary)]">{item.actor}</strong>
                <span style={{ color: riskColor(item.average) }}>{item.average}%</span>
              </div>
              <div className="h-1.5 bg-[var(--secondary)] border border-[var(--border)] mt-1">
                <div className="h-full" style={{ width: `${item.average}%`, background: riskColor(item.average) }} />
              </div>
              <div className="text-[8px] opacity-50 mt-1">{item.transitions} shifts · {item.words} words</div>
            </div>
          )) : <div className="text-[10px] opacity-40">No message transitions yet.</div>}
        </div>

        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-12 gap-2 text-[8px] uppercase tracking-wider opacity-50 border-b border-[var(--border)] pb-1">
              <span className="col-span-1">Time</span>
              <span className="col-span-2">Shift</span>
              <span className="col-span-1 text-right">Drift</span>
              <span className="col-span-1 text-right">Size</span>
              <span className="col-span-7">User intent keywords</span>
            </div>
            {driftTimeline.length > 0 ? driftTimeline.slice(-12).map(item => (
              <div key={item.id} className="grid grid-cols-12 gap-2 items-center border-b border-[color-mix(in_srgb,var(--border)_60%,transparent)] py-2 text-[9px]">
                <span className="col-span-1 font-mono opacity-60">{item.timestamp}</span>
                <span className="col-span-2 truncate" aria-label={`${item.previousActor} to ${item.actor}`}>
                  <span className="opacity-50">{item.previousActor}</span>
                  <span className="mx-1 text-[var(--primary)]">→</span>
                  <strong>{item.actor}</strong>
                </span>
                <span className="col-span-1 text-right font-bold" style={{ color: riskColor(item.drift) }}>{item.drift}%</span>
                <span className="col-span-1 text-right">{item.words}w</span>
                <span className="col-span-7 flex flex-wrap gap-1">
                  {item.topics.length > 0 ? item.topics.map(topic => (
                    <span key={topic} className="border border-[var(--border)] bg-[var(--secondary)] px-1.5 py-0.5">{topic}</span>
                  )) : <span className="opacity-40">No distinct terms</span>}
                </span>
              </div>
            )) : <div className="text-[10px] opacity-40 py-3">No message transitions yet.</div>}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--chart-3)]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            03 / Agent independence
          </div>
          <h3 className="text-xs font-bold mt-2">Is one agent dominating the conclusion?</h3>
          <div className="space-y-2 mt-3">
            {contributionShares.length > 0 ? contributionShares.map(item => (
              <div key={item.name}>
                <div className="flex justify-between text-[9px] mb-1"><span>{item.name}</span><strong>{item.share}%</strong></div>
                <div className="h-2 bg-[var(--background)] border border-[var(--border)]">
                  <div className="h-full bg-[var(--chart-3)]" style={{ width: `${item.share}%` }} />
                </div>
              </div>
            )) : <div className="text-[10px] opacity-40">No specialist output yet.</div>}
          </div>
        </div>

        <div className="border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--accent)]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            04 / Quality attention queue
          </div>
          <h3 className="text-xs font-bold mt-2">Quality attention queue</h3>
          <div className="space-y-2 mt-3">
            {qualityConcerns.length > 0 ? qualityConcerns.map(concern => (
              <div key={concern.label} className="border-l-2 border-[var(--accent)] bg-[rgba(255,0,85,0.05)] px-2 py-1.5">
                <div className="text-[10px] font-bold">{concern.label}</div>
                <div className="text-[9px] text-[var(--muted-foreground)] mt-0.5">{concern.detail}</div>
              </div>
            )) : (
              <div className="border-l-2 border-[var(--good)] bg-[rgba(0,255,136,0.05)] px-2 py-2 text-[10px] text-[var(--good)]">
                No quality thresholds are currently breached.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--primary)]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          05 / Conversation map
        </div>
        <h3 className="text-xs font-bold mt-2">Topics discussed</h3>
        <p className="text-[9px] text-[var(--muted-foreground)] mt-1">
          Terms ranked by the number of distinct messages in which they appear.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3">
          {topics.length > 0 ? topics.map((topic, index) => (
            <div key={topic.topic}>
              <div className="flex items-center justify-between text-[9px] mb-1">
                <span className="truncate"><strong className="text-[var(--primary)] mr-2">{String(index + 1).padStart(2, "0")}</strong>{topic.topic}</span>
                <span>{topic.mentions}</span>
              </div>
              <div className="h-1.5 bg-[var(--background)] border border-[var(--border)]">
                <div
                  className="h-full"
                  style={{
                    width: `${(topic.mentions / maxTopicMentions) * 100}%`,
                    background: index === 0 ? "var(--primary)" : "var(--chart-3)",
                  }}
                />
              </div>
            </div>
          )) : <div className="text-[10px] opacity-40">No topic data yet.</div>}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--chart-5)]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            06 / Tool inventory
          </div>
          <h3 className="text-xs font-bold mt-2">Tools used</h3>
          <p className="text-[9px] text-[var(--muted-foreground)] mt-1">
            Persisted tool-call events only; unreported agent-internal calls are not inferred.
          </p>
          <div className="space-y-2 mt-3">
            {toolsUsed.length > 0 ? toolsUsed.map(tool => (
              <div key={tool.tool} className="border border-[var(--border)] bg-[var(--secondary)] p-2">
                <div className="flex justify-between gap-2 text-[10px]">
                  <span className="font-mono text-[var(--chart-5)] truncate">{tool.tool}</span>
                  <strong>{tool.calls}</strong>
                </div>
                <div className="text-[8px] opacity-55 mt-1">
                  {Array.from(tool.agents.entries()).map(([agent, calls]) => `${agent} ×${calls}`).join(", ")}
                </div>
              </div>
            )) : <div className="text-[10px] opacity-40">No persisted tool calls.</div>}
          </div>
        </div>

        <div className="border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--good)]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            07 / Model telemetry
          </div>
          <h3 className="text-xs font-bold mt-2">Models and usage</h3>
          <p className="text-[9px] text-[var(--muted-foreground)] mt-1">
            Output tokens are estimated from stored text (~4 characters/token); provider billing usage is not yet persisted.
          </p>
          <div className="mt-3 flex items-end justify-between border-b border-[var(--border)] pb-2">
            <span className="text-[9px] opacity-55">ESTIMATED OUTPUT TOKENS</span>
            <strong className="text-lg text-[var(--good)]">{totalEstimatedOutputTokens.toLocaleString()}</strong>
          </div>
          <div className="space-y-2 mt-3">
            {modelUsage.length > 0 ? modelUsage.map(item => (
              <div key={`${item.provider}:${item.model}`}>
                <div className="flex justify-between gap-3 text-[9px]">
                  <div className="min-w-0">
                    <div className="font-mono text-[var(--primary)] truncate">{item.provider}:{item.model}</div>
                    <div className="text-[8px] opacity-50">{Array.from(item.agents).join(", ")} · {item.outputs} outputs</div>
                  </div>
                  <strong>{item.estimatedOutputTokens.toLocaleString()}</strong>
                </div>
                <div className="h-1.5 bg-[var(--background)] border border-[var(--border)] mt-1">
                  <div
                    className="h-full bg-[var(--good)]"
                    style={{ width: `${totalEstimatedOutputTokens > 0 ? (item.estimatedOutputTokens / totalEstimatedOutputTokens) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )) : <div className="text-[10px] opacity-40">No provider/model attribution stored yet.</div>}
          </div>
        </div>
      </section>

      <section className="border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--chart-3)]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          08 / Responsibility and contribution
        </div>
        <h3 className="text-xs font-bold mt-2">Agent contribution ledger</h3>
        <p className="text-[9px] text-[var(--muted-foreground)] mt-1">
          Observed responsibility, output volume, evidence markers, tools, and model attribution.
        </p>
        <div className="overflow-x-auto mt-3">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-12 gap-2 text-[8px] uppercase tracking-wider opacity-50 border-b border-[var(--border)] pb-1">
              <span className="col-span-2">Agent</span>
              <span className="col-span-4">Observed part</span>
              <span className="col-span-1 text-right">Msgs</span>
              <span className="col-span-1 text-right">Words</span>
              <span className="col-span-1 text-right">Cites</span>
              <span className="col-span-1 text-right">Tools</span>
              <span className="col-span-2">Model(s)</span>
            </div>
            {agentLedger.length > 0 ? agentLedger.map(agent => (
              <div key={agent.agent} className="grid grid-cols-12 gap-2 text-[9px] items-center border-b border-[color-mix(in_srgb,var(--border)_60%,transparent)] py-2">
                <span className="col-span-2 font-bold text-[var(--chart-3)] truncate">{agent.agent}</span>
                <span className="col-span-4 text-[var(--foreground)]">{agent.part}</span>
                <span className="col-span-1 text-right">{agent.messages}</span>
                <span className="col-span-1 text-right">{agent.words}</span>
                <span className="col-span-1 text-right text-[var(--good)]">{agent.citations}</span>
                <span className="col-span-1 text-right text-[var(--chart-5)]">{agent.tools}</span>
                <span className="col-span-2 font-mono text-[8px] text-[var(--muted-foreground)] truncate">
                  {Array.from(agent.models).join(", ") || "unattributed"}
                </span>
              </div>
            )) : <div className="text-[10px] opacity-40 py-3">No agent contribution data yet.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

export function RightPanel({
  thinking, messages, statusText, sessionSummary, onSummarize, settings, sessionFiles = [], onUploadFile, onDeleteSessionFile
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const [computingStep, setComputingStep] = useState(0);
  const [summaryMode, setSummaryMode] = useState<"rendered" | "source">("rendered");
  const summaryMarkdown = normalizeSessionSummaryMarkdown(sessionSummary);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (statusText === 'RECALIBRATING...') {
      setComputingStep(0);
      interval = setInterval(() => {
        setComputingStep(prev => (prev + 1) % 6);
      }, 700);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [statusText]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeTab !== null) {
        setActiveTab(null);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [activeTab]);

  // ── PULSE ANALYTICS DATA CALCULATION ──
  
  // 1. Messages by Role (Engagement)
  const getTopicAndHealthAnalytics = () => {
    const stopWords = new Set([
      'about', 'above', 'after', 'again', 'against', 'along', 'already', 'would', 'could', 'should',
      'there', 'their', 'these', 'those', 'where', 'which', 'while', 'under', 'after', 'before', 'hello', 'please'
    ]);
    const agentNames = new Set(['athena', 'moderator', 'engineer', 'architect', 'security', 'crosscheck', 'system', 'athena-whisper', 'agent-whisper']);
    
    const topicCounts: Record<string, number> = {};
    const messageTopics: string[] = [];

    messages.forEach(m => {
      if (m.role === 'system' || m.role === 'internal') return;
      const content = m.content.toLowerCase()
        .replace(/savant\s+quorum/g, 'savant_quorum')
        .replace(/savant\s+server/g, 'savant_server')
        .replace(/savant\s+gateway/g, 'savant_gateway')
        .replace(/knowledge\s+graph/g, 'knowledge_graph');
        
      const words = content.replace(/[^a-zA-Z_\s]/g, ' ').split(/\s+/);
      const candidates: Record<string, number> = {};
      
      words.forEach(w => {
        if (w.length > 4 && !stopWords.has(w) && !agentNames.has(w)) {
          candidates[w] = (candidates[w] || 0) + 1;
          topicCounts[w] = (topicCounts[w] || 0) + 1;
        }
      });

      let bestTopic = "";
      let maxCount = 0;
      Object.entries(candidates).forEach(([t, count]) => {
        if (count > maxCount) {
          maxCount = count;
          bestTopic = t;
        }
      });
      if (bestTopic) {
        messageTopics.push(bestTopic);
      }
    });

    let dominantTopic = "N/A";
    let dominantCount = 0;
    Object.entries(topicCounts).forEach(([t, count]) => {
      if (count > dominantCount) {
        dominantCount = count;
        dominantTopic = t;
      }
    });

    const totalTopics = Object.keys(topicCounts).length;

    let deviations = 0;
    for (let i = 1; i < messageTopics.length; i++) {
      if (messageTopics[i] !== messageTopics[i - 1]) {
        deviations++;
      }
    }

    let totalWords = 0;
    const uniqueWords = new Set<string>();
    let factMarkerCount = 0;
    
    messages.forEach(m => {
      if (m.role === 'system' || m.role === 'internal') return;
      const content = m.content.toLowerCase();
      const words = content.replace(/[^a-zA-Z]/g, ' ').split(/\s+/).filter(w => w.length > 2);
      words.forEach(w => {
        totalWords++;
        uniqueWords.add(w);
      });
      const matches = content.match(/fact\s*\[\d+\]|\[fact:\d+\]/gi);
      if (matches) {
        factMarkerCount += matches.length;
      }
    });

    const vocabularyRichness = totalWords > 0 ? (uniqueWords.size / totalWords) : 1;
    let healthScore = Math.round((vocabularyRichness * 70) + (Math.min(factMarkerCount, 10) * 3));
    if (messages.length === 0) healthScore = 100;
    healthScore = Math.min(Math.max(healthScore, 10), 100);

    let status = "STABLE";
    let statusColor = "var(--good)";
    if (healthScore < 45) {
      status = "ROT DETECTED";
      statusColor = "var(--accent)";
    } else if (healthScore < 70) {
      status = "DEGRADED";
      statusColor = "var(--warning)";
    }

    const sortedTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic.replace(/_/g, ' ').toUpperCase());

    return {
      totalTopics,
      dominantTopic: dominantTopic.replace(/_/g, ' ').toUpperCase(),
      deviations,
      healthScore,
      status,
      statusColor,
      sortedTopics
    };
  };

  const getMessageEngagement = () => {
    const counts: Record<string, number> = {};
    messages.forEach(m => {
      let role: string = m.role;
      if (role === 'agent-whisper' && m.from) role = m.from;
      if (role === 'moderator-whisper' || role === 'athena-whisper') role = 'athena';
      if (role === 'moderator' || role === 'whisper' || role === 'athena') role = 'athena';
      if (role === 'user') role = 'YOU';
      
      const label = role.toUpperCase();
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  };

  // 2. Whisper vs Message Ratio
  const getWhisperRatio = () => {
    const whispers = messages.filter(m => ['whisper', 'moderator-whisper', 'agent-whisper', 'athena-whisper'].includes(m.role)).length;
    const publics = messages.filter(m => !['whisper', 'moderator-whisper', 'agent-whisper', 'athena-whisper', 'system', 'internal'].includes(m.role)).length;
    return [
      { name: 'WHISPERS', value: whispers, color: '#ff00aa' },
      { name: 'PUBLIC', value: publics, color: '#00e5ff' }
    ].filter(v => v.value > 0);
  };

  // 3. Mermaid Usage
  const getMermaidUsage = () => {
    const types = ['graph', 'sequenceDiagram', 'flowchart', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt', 'pie'];
    const usage: Record<string, number> = {};
    messages.forEach(m => {
      types.forEach(type => {
        const regex = new RegExp(`\`\`\`mermaid\\s*${type}`, 'g');
        const matches = m.content.match(regex);
        if (matches) {
          usage[type] = (usage[type] || 0) + matches.length;
        }
      });
    });
    return Object.entries(usage)
      .map(([name, value]) => ({ name: name.replace('Diagram', '').toUpperCase(), value }))
      .sort((a, b) => b.value - a.value);
  };

  // 4. Fact Network (InfraNodus style)
  const getFactNetwork = () => {
    const factRegex = /fact\s*\[\d+\]|\[fact:\d+\]/i;
    const words: Record<string, { count: number; type: 'agent' | 'fact' | 'concept' | 'crosscheck' }> = {};
    const cooccurrence: Record<string, Record<string, { weight: number; type: 'communication' | 'semantic' | 'crosscheck' }>> = {};

    // Helper to register node
    const addNode = (text: string, type: 'agent' | 'fact' | 'concept' | 'crosscheck', increment = 1) => {
      const key = text.trim();
      if (!key) return;
      if (!words[key]) {
        words[key] = { count: 0, type };
      }
      words[key].count += increment;
    };

    // Helper to register edge
    const addEdge = (source: string, target: string, type: 'communication' | 'semantic' | 'crosscheck', weight = 1) => {
      const s = source.trim();
      const t = target.trim();
      if (!s || !t || s === t) return;
      const [a, b] = [s, t].sort();
      if (!cooccurrence[a]) cooccurrence[a] = {};
      if (!cooccurrence[a][b]) {
        cooccurrence[a][b] = { weight: 0, type };
      }
      cooccurrence[a][b].weight += weight;
      if (type === 'crosscheck') {
        cooccurrence[a][b].type = 'crosscheck';
      }
    };

    // Pre-register all possible agents to ensure they have correct type
    const agentsList = ['YOU', 'Moderator', 'Engineer', 'Architect', 'Security', 'CrossCheck'];
    agentsList.forEach(agent => {
      addNode(agent, 'agent', 0);
    });

    // Comprehensive standard English stop words
    const stopWords = new Set([
      'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'cant', 'cannot', 'could', 'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here', 'heres', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is', 'isnt', 'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such', 'than', 'that', 'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these', 'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent', 'what', 'whats', 'when', 'whens', 'where', 'wheres', 'which', 'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd', 'youll', 'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves', 'will', 'your', 'using', 'through', 'would', 'could', 'should', 'also'
    ]);
    
    // Keywords from MCP calls / tool execution / system logs to exclude
    const mcpKeywords = new Set([
      'mcp', 'call', 'response', 'tool', 'exec', 'shell', 'run', 'args', 'stdout', 'stderr', 'status', 'result', 'npm', 'node', 'vite', 'sqlite', 'database', 'query', 'sql', 'select', 'table', 'error', 'failed', 'success', 'pending', 'method', 'params', 'project', 'code', 'file', 'directory', 'path', 'folder', 'line', 'lines', 'index', 'import', 'export', 'const', 'function', 'return', 'class', 'type', 'fact', 'facts', 'savant', 'quorum', 'agent', 'moderator', 'engineer', 'architect', 'security', 'system', 'confirmed', 'verified', 'analysis', 'confirmed via'
    ]);

    const extractFromText = (text: string, forceFactOnly: boolean, senderAgent: string) => {
      if (!text) return;
      const content = text.toLowerCase();
      
      const lines = content.split('\n');
      const cleanLines = lines.filter(line => {
        const l = line.trim();
        return !l.startsWith('{') && !l.startsWith('}') && !l.includes('"toolName"') && !l.includes('"commandLine"') && !l.startsWith('➜') && !l.startsWith('>');
      });
      
      const cleanContent = cleanLines.join(' ');
      const sentences = cleanContent.split(/[.!?]/);
      
      sentences.forEach(s => {
        if (!forceFactOnly || factRegex.test(s)) {
          const clean = s.replace(/fact\s*\[\d+\]|\[fact:\d+\]/gi, '').replace(/[^a-z\s]/g, ' ');
          const tokens = Array.from(new Set(clean.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w) && !mcpKeywords.has(w))));
          
          tokens.forEach((w, i) => {
            addNode(w, 'concept', 1);
            addEdge(senderAgent, w, 'semantic', 1);
            tokens.slice(i + 1).forEach(w2 => {
              addEdge(w, w2, 'semantic', 0.5);
            });
          });
        }
      });
    };

    // Whispers list
    const allWhispers: { id: string; from: string; to: string; content: string; timestamp: Date | number }[] = [];
    messages.forEach((m, idx) => {
      if (m.role === 'agent-whisper' && m.from) {
        allWhispers.push({
          id: m.id || `w-${idx}`,
          from: m.from,
          to: 'Athena',
          content: m.content,
          timestamp: m.timestamp
        });
      } else if (m.role === 'moderator-whisper' || m.role === 'athena-whisper') {
        allWhispers.push({
          id: m.id || `w-${idx}`,
          from: 'Athena',
          to: m.to || 'Swarm/User',
          content: m.content,
          timestamp: m.timestamp
        });
      }
    });

    // Cross-checks list
    const allCrosschecks: { from: string; target: string; feedback: string; timestamp: Date | number }[] = [];
    messages.forEach((m) => {
      const crossCheckMatch = m.content.match(/cross-check feedback on\s+(\w+):?\s*([\s\S]*)/i);
      if (crossCheckMatch && m.from) {
        allCrosschecks.push({
          from: m.from,
          target: crossCheckMatch[1],
          feedback: crossCheckMatch[2]?.trim() || m.content,
          timestamp: m.timestamp
        });
      }
    });

    // Forwards list
    const allForwards: { from: string; to: string; content: string; trigger: string }[] = [];
    const agentOutputs: Record<string, string> = {};
    messages.forEach((m) => {
      let sender = 'Athena';
      if (m.role === 'user') sender = 'YOU';
      else if (m.role === 'agent-whisper' && m.from) sender = m.from;
      else if (m.role === 'moderator-whisper' || m.role === 'athena-whisper') sender = 'Athena';
      else if (m.role === 'moderator' || m.role === 'athena') sender = 'Athena';

      if (m.role === 'agent-whisper' && m.from) {
        agentOutputs[m.from] = m.content;
      }

      if (m.role === 'moderator-whisper' || m.role === 'athena-whisper') {
        // Find who is engaged
        const engaged: string[] = [];
        agentsList.forEach(agent => {
          if (agent !== 'Athena' && agent !== 'YOU' && agent !== 'CrossCheck') {
            const regex = new RegExp(`\\b${agent}\\b`, 'i');
            if (m.content.match(regex)) {
              engaged.push(agent);
            }
          }
        });

        if (engaged.length > 0) {
          engaged.forEach(target => {
            Object.entries(agentOutputs).forEach(([source, content]) => {
              if (source !== target) {
                allForwards.push({
                  from: source,
                  to: target,
                  content: content,
                  trigger: m.content
                });
              }
            });
          });
        }
      }
    });

    // Look at moderator thoughts for forwards
    thinking.forEach(t => {
      if (t.agent === 'Moderator') {
        const relayMatch = t.thought.match(/(?:relaying|forwarding|passing|sending)\s+(\w+)(?:\'s)?\s+(?:to|feedback to|info to|analysis to)\s+(\w+)/i);
        if (relayMatch) {
          const from = relayMatch[1];
          const to = relayMatch[2];
          const fromName = agentsList.find(a => a.toLowerCase() === from.toLowerCase());
          const toName = agentsList.find(a => a.toLowerCase() === to.toLowerCase());
          if (fromName && toName) {
            allForwards.push({
              from: fromName,
              to: toName,
              content: agentOutputs[fromName] || `Context from ${fromName}`,
              trigger: t.thought
            });
          }
        }
      }
    });

    // Facts list
    const allFacts: { label: string; content: string; source: string; timestamp: Date | number }[] = [];
    messages.forEach(m => {
      const sender = m.role === 'user' ? 'YOU' : (m.role === 'agent-whisper' && m.from ? m.from : (m.role === 'moderator' || m.role === 'moderator-whisper' || m.role === 'athena' || m.role === 'athena-whisper' ? 'Athena' : m.role));
      const sentences = m.content.split(/[.!?\n]/);
      sentences.forEach(s => {
        const match = s.match(/fact\s*\[\d+\]|\[fact:\d+\]/i);
        if (match) {
          const label = match[0].toUpperCase().replace(/\s+/g, '');
          if (!allFacts.some(f => f.label === label)) {
            allFacts.push({
              label,
              content: s.trim(),
              source: sender,
              timestamp: m.timestamp
            });
          }
        }
      });
    });

    // 1. Process all messages (whispers, user queries, final reports) for Graph Nodes & Edges
    messages.forEach(m => {
      let sender = 'Athena';
      if (m.role === 'user') sender = 'YOU';
      else if (m.role === 'agent-whisper' && m.from) sender = m.from;
      else if (m.role === 'moderator-whisper' || m.role === 'athena-whisper') sender = 'Athena';
      else if (m.role === 'moderator' || m.role === 'athena') sender = 'Athena';

      addNode(sender, 'agent', 1);

      // Check for whispers: who said what to moderator
      if (m.role === 'agent-whisper' && m.from) {
        addEdge(m.from, 'Athena', 'communication', 1);
      } else if (m.role === 'user') {
        addEdge('YOU', 'Athena', 'communication', 1);
      }

      // Check for cross-check messages
      const crossCheckMatch = m.content.match(/cross-check feedback on\s+(\w+)/i);
      if (crossCheckMatch) {
        const targetAgent = crossCheckMatch[1];
        addEdge(sender, targetAgent, 'crosscheck', 2);
        addNode('CrossCheck', 'crosscheck', 1);
        addEdge(sender, 'CrossCheck', 'crosscheck', 1);
        addEdge(targetAgent, 'CrossCheck', 'crosscheck', 1);
      }

      // Check for forwards
      if (sender === 'Athena') {
        agentsList.forEach(otherAgent => {
          if (otherAgent !== 'Athena' && otherAgent !== 'YOU' && otherAgent !== 'CrossCheck') {
            if (m.content.includes(otherAgent)) {
              addEdge('Athena', otherAgent, 'communication', 1);
              messages.filter(prev => prev.role === 'agent-whisper' && prev.from === otherAgent).forEach(() => {
                addEdge(otherAgent, 'Athena', 'communication', 1);
              });
            }
          }
        });
      }

      // Extract facts and concepts
      const content = m.content.toLowerCase();
      const factsFound = content.match(/fact\s*\[\d+\]|\[fact:\d+\]/gi);
      if (factsFound) {
        factsFound.forEach(f => {
          const factLabel = f.toUpperCase().replace(/\s+/g, '');
          addNode(factLabel, 'fact', 2);
          addEdge(sender, factLabel, 'semantic', 1.5);
        });
      }

      const isUserOrWhisper = ['user', 'moderator-whisper', 'agent-whisper', 'athena-whisper'].includes(m.role);
      extractFromText(m.content, !isUserOrWhisper, sender);
    });

    // 2. Process all thinking traces (neural trace)
    thinking.forEach(t => {
      const agent = t.agent || 'Athena';
      addNode(agent, 'agent', 1);

      // Check for forwards/communication in thoughts
      if (t.thought.toLowerCase().includes('forward') || t.thought.toLowerCase().includes('relay')) {
        agentsList.forEach(otherAgent => {
          if (otherAgent !== agent && t.thought.includes(otherAgent)) {
            addEdge(agent, otherAgent, 'communication', 1.5);
          }
        });
      }

      extractFromText(t.thought, false, agent);
    });

    // Build lists of nodes and edges
    const sortedConcepts = Object.entries(words)
      .filter(([_, data]) => data.type === 'concept')
      .map(([text, data]) => ({ text, count: data.count, type: data.type as 'concept' }))
      .sort((a, b) => b.count - a.count);

    const selectedConcepts = sortedConcepts.slice(0, 20); // Top 20 concepts

    const allFactsNodes = Object.entries(words)
      .filter(([_, data]) => data.type === 'fact' || data.type === 'crosscheck')
      .map(([text, data]) => ({ text, count: data.count, type: data.type as 'fact' | 'crosscheck' }));

    const selectedConceptsAndFacts = [...selectedConcepts, ...allFactsNodes];
    const selectedAgents = Object.entries(words)
      .filter(([_, data]) => data.type === 'agent' && data.count > 0)
      .map(([text, data]) => ({ text, count: data.count, type: data.type }));

    const finalNodes = [...selectedAgents, ...selectedConceptsAndFacts];
    const activeWords = new Set(finalNodes.map(n => n.text));

    const finalEdges: { source: string; target: string; weight: number; type: 'communication' | 'semantic' | 'crosscheck' }[] = [];
    Object.entries(cooccurrence).forEach(([a, targets]) => {
      if (!activeWords.has(a)) return;
      Object.entries(targets).forEach(([b, data]) => {
        if (!activeWords.has(b)) return;
        finalEdges.push({ source: a, target: b, weight: data.weight, type: data.type });
      });
    });

    return { 
      nodes: finalNodes, 
      edges: finalEdges,
      whispers: allWhispers,
      forwards: allForwards,
      crosschecks: allCrosschecks,
      facts: allFacts
    };
  };

  // 5. Agent Integrity & Topic Analysis (Hallucination & Diversion Diagnostics)
  const getAgentStats = () => {
    const stats: Record<string, {
      totalMessages: number;
      factsClaimed: number;
      factsChecked: number;
      factsVerifiedRight: number;
      diversionsCount: number;
    }> = {};

    const getAgentName = (m: Message): string => {
      let role = m.role;
      if (role === 'agent-whisper' && m.from) return m.from;
      if (role === 'moderator-whisper' || role === 'athena-whisper') return 'athena';
      if (role === 'whisper') return 'athena';
      if (role === 'user') return 'YOU';
      return role;
    };

    const initStats = (name: string) => {
      const k = name.toUpperCase();
      if (!stats[k]) {
        stats[k] = {
          totalMessages: 0,
          factsClaimed: 0,
          factsChecked: 0,
          factsVerifiedRight: 0,
          diversionsCount: 0,
        };
      }
      return k;
    };

    messages.forEach((m, idx) => {
      const sender = getAgentName(m);
      if (sender === 'SYSTEM' || sender === 'INTERNAL' || sender === 'ERROR') return;
      const key = initStats(sender);
      stats[key].totalMessages += 1;

      // Count facts claimed
      const factClaims = m.content.match(/fact\s*\[\d+\]|\[fact:\d+\]/gi) || [];
      stats[key].factsClaimed += factClaims.length;

      // Count facts checked and verified right
      const sentences = m.content.split(/[.!?\n]/);
      sentences.forEach(sentence => {
        const hasFact = /fact\s*\[\d+\]|\[fact:\d+\]/gi.test(sentence);
        if (hasFact) {
          const isCheck = /verify|check|confirm|validate|correct|true|accurate|match/i.test(sentence);
          if (isCheck) {
            stats[key].factsChecked += 1;
            const isRight = !/not|fail|incorrect|wrong|hallucinat|false|discrepancy/i.test(sentence);
            if (isRight) {
              stats[key].factsVerifiedRight += 1;
            }
          }
        }
      });

      // Detect diversions
      const contentLower = m.content.toLowerCase();
      const hasDiversionKeyword = /off-topic|tangent|divert|deviation|stray|unrelated|sidebar/i.test(contentLower);
      if (hasDiversionKeyword) {
        if ((sender === 'MODERATOR' || sender === 'YOU') && idx > 0) {
          const prevMsg = messages[idx - 1];
          const prevSender = getAgentName(prevMsg);
          if (prevSender !== 'SYSTEM' && prevSender !== 'INTERNAL' && prevSender !== 'ERROR') {
            const prevKey = initStats(prevSender);
            stats[prevKey].diversionsCount += 1;
          }
        } else {
          stats[key].diversionsCount += 1;
        }
      }
    });

    thinking.forEach(t => {
      if (!t.agent) return;
      const key = initStats(t.agent);
      const thoughtLower = t.thought.toLowerCase();

      const factMatches = t.thought.match(/fact\s*\[\d+\]|\[fact:\d+\]/gi) || [];
      if (factMatches.length > 0) {
        const isCheck = /verify|check|confirm|validate|lookup|compare|query|match/i.test(thoughtLower);
        if (isCheck) {
          stats[key].factsChecked += factMatches.length;
          const isRight = !/fail|incorrect|wrong|hallucinat|false|error|discrepancy/i.test(thoughtLower);
          if (isRight) {
            stats[key].factsVerifiedRight += factMatches.length;
          }
        }
      }
    });

    return Object.entries(stats).map(([name, data]) => {
      const onTopicPercentage = data.totalMessages > 0
        ? Math.max(0, Math.min(100, Math.round((1 - (data.diversionsCount / data.totalMessages)) * 100)))
        : 100;

      return {
        agent: name,
        ...data,
        onTopicPercentage,
      };
    });
  };

  const getTimelineData = () => {
    if (messages.length === 0) return [{ idx: 1, length: 0, facts: 0 }];
    return messages.map((m, idx) => ({
      idx: idx + 1,
      length: m.content.split(/\s+/).length,
      facts: (m.content.match(/fact\s*\[\d+\]|\[fact:\d+\]/gi) || []).length
    }));
  };

  const getConsensusData = () => {
    let agree = 0;
    let disagree = 0;
    messages.forEach(m => {
      const content = m.content.toLowerCase();
      const agreeMatches = content.match(/agree|correct|match|accurate|confirm|validate|support/gi) || [];
      const disagreeMatches = content.match(/disagree|differ|conflict|contradict|incorrect|discrepancy|error|dispute/gi) || [];
      agree += agreeMatches.length;
      disagree += disagreeMatches.length;
    });
    const data = [];
    if (agree > 0) data.push({ name: 'AGREEMENT', value: agree, color: 'var(--good)' });
    if (disagree > 0) data.push({ name: 'FRICTION', value: disagree, color: 'rgba(255, 0, 85, 1)' });
    if (data.length === 0) {
      data.push({ name: 'AGREEMENT', value: 1, color: 'var(--good)' });
    }
    return data;
  };

  const getThoughtLatencyData = () => {
    const counts: Record<string, { totalLen: number; count: number }> = {};
    thinking.forEach(t => {
      if (!t.agent) return;
      const name = t.agent.toUpperCase();
      if (!counts[name]) counts[name] = { totalLen: 0, count: 0 };
      counts[name].totalLen += t.thought.length;
      counts[name].count += 1;
    });
    const res = Object.entries(counts).map(([name, d]) => ({
      name,
      avgLength: Math.round(d.totalLen / d.count)
    })).sort((a, b) => b.avgLength - a.avgLength);
    return res.length > 0 ? res : [{ name: 'NONE', avgLength: 0 }];
  };

  const getComplexityData = () => {
    const counts: Record<string, { words: number; msgs: number }> = {};
    messages.forEach(m => {
      let role: string = m.role;
      if (role === 'agent-whisper' && m.from) role = m.from;
      if (role === 'moderator-whisper') role = 'moderator';
      if (role === 'whisper') role = 'moderator';
      if (role === 'user') role = 'YOU';
      if (role === 'system' || role === 'internal' || role === 'error') return;
      
      const name = role.toUpperCase();
      if (!counts[name]) counts[name] = { words: 0, msgs: 0 };
      counts[name].words += m.content.split(/\s+/).length;
      counts[name].msgs += 1;
    });
    const res = Object.entries(counts).map(([name, d]) => ({
      name,
      avgWords: Math.round(d.words / d.msgs)
    })).sort((a, b) => b.avgWords - a.avgWords);
    return res.length > 0 ? res : [{ name: 'NONE', avgWords: 0 }];
  };

  const getMcpCallStats = () => {
    const stats: Record<string, { server: string; tool: string; caller: string; count: number }> = {};

    const getAgentName = (m: Message): string => {
      let role = m.role;
      if (role === 'agent-whisper' && m.from) return m.from;
      if (role === 'moderator-whisper' || role === 'athena-whisper') return 'athena';
      if (role === 'whisper') return 'athena';
      if (role === 'user') return 'YOU';
      return role;
    };

    const recordCall = (server: string, tool: string, caller: string) => {
      const s = server.toLowerCase();
      const t = tool.toLowerCase();
      const c = caller.toUpperCase();
      const key = `${s}|${t}|${c}`;
      if (!stats[key]) {
        stats[key] = {
          server: s,
          tool: t,
          caller: c,
          count: 0
        };
      }
      stats[key].count += 1;
    };

    const toolsMap: Record<string, string[]> = {
      'savant-abilities': ['resolve_abilities', 'validate_store', 'list_personas', 'list_rules', 'list_policies', 'list_repos', 'read_asset', 'learn'],
      'savant-workspace': ['list_workspaces', 'create_workspace', 'get_workspace', 'list_tasks', 'create_task', 'create_jira_ticket']
    };

    thinking.forEach(t => {
      if (!t.agent) return;
      const caller = t.agent;
      const text = t.thought.toLowerCase();

      const regex = /(savant-abilities|savant-workspace)[\/\s\->:]+([a-z_0-9]+)/gi;
      let match;
      let found = false;
      while ((match = regex.exec(text)) !== null) {
        const server = match[1].toLowerCase();
        const tool = match[2].toLowerCase();
        if (toolsMap[server] && toolsMap[server].includes(tool)) {
          recordCall(server, tool, caller);
          found = true;
        }
      }

      if (!found) {
        if (text.includes('resolving_abilities') || text.includes('abilities_resolved') || text.includes('resolve_abilities')) {
          recordCall('savant-abilities', 'resolve_abilities', caller);
        } else if (text.includes('validate_store')) {
          recordCall('savant-abilities', 'validate_store', caller);
        } else if (text.includes('list_personas')) {
          recordCall('savant-abilities', 'list_personas', caller);
        } else if (text.includes('list_rules')) {
          recordCall('savant-abilities', 'list_rules', caller);
        } else if (text.includes('list_policies')) {
          recordCall('savant-abilities', 'list_policies', caller);
        } else if (text.includes('list_repos')) {
          recordCall('savant-abilities', 'list_repos', caller);
        } else if (text.includes('read_asset')) {
          recordCall('savant-abilities', 'read_asset', caller);
        } else if (text.includes('learn')) {
          recordCall('savant-abilities', 'learn', caller);
        } else if (text.includes('list_workspaces')) {
          recordCall('savant-workspace', 'list_workspaces', caller);
        } else if (text.includes('create_workspace')) {
          recordCall('savant-workspace', 'create_workspace', caller);
        } else if (text.includes('get_workspace')) {
          recordCall('savant-workspace', 'get_workspace', caller);
        } else if (text.includes('list_tasks')) {
          recordCall('savant-workspace', 'list_tasks', caller);
        } else if (text.includes('create_task')) {
          recordCall('savant-workspace', 'create_task', caller);
        } else if (text.includes('create_jira_ticket')) {
          recordCall('savant-workspace', 'create_jira_ticket', caller);
        }
      }
    });

    messages.forEach(m => {
      const caller = getAgentName(m);
      if (caller === 'SYSTEM' || caller === 'INTERNAL' || caller === 'ERROR') return;
      const text = m.content.toLowerCase();

      const regex = /(savant-abilities|savant-workspace)[\/\s\->:]+([a-z_0-9]+)/gi;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const server = match[1].toLowerCase();
        const tool = match[2].toLowerCase();
        if (toolsMap[server] && toolsMap[server].includes(tool)) {
          recordCall(server, tool, caller);
        }
      }
    });

    return Object.values(stats).sort((a, b) => b.count - a.count);
  };

  const engagementData = getMessageEngagement();
  const ratioData = getWhisperRatio();
  const mermaidData = getMermaidUsage();
  const factNetwork = getFactNetwork();

  const agentStats = getAgentStats();
  const totalDiversions = agentStats.reduce((sum, a) => sum + a.diversionsCount, 0);
  const mcpCallStats = getMcpCallStats();
  const timelineData = getTimelineData();
  const consensusData = getConsensusData();
  const thoughtLatencyData = getThoughtLatencyData();
  const complexityData = getComplexityData();
  const providerStats = getProviderLeaderboard();
  const cognitiveROI = getCognitiveROI();

  const sortedByFacts = [...agentStats].sort((a, b) => b.factsClaimed - a.factsClaimed);
  const mostFactsAgent = sortedByFacts.length > 0 && sortedByFacts[0].factsClaimed > 0 ? sortedByFacts[0] : null;
  const leastFactsAgent = sortedByFacts.length > 0 ? sortedByFacts[sortedByFacts.length - 1] : null;

  const sortedByChecksRight = [...agentStats].sort((a, b) => {
    if (b.factsVerifiedRight !== a.factsVerifiedRight) {
      return b.factsVerifiedRight - a.factsVerifiedRight;
    }
    return b.factsChecked - a.factsChecked;
  });
  const factCheckChampion = sortedByChecksRight.length > 0 && sortedByChecksRight[0].factsVerifiedRight > 0 ? sortedByChecksRight[0] : null;

  const sortedByOnTopic = [...agentStats].sort((a, b) => b.onTopicPercentage - a.onTopicPercentage);
  const mostOnTopicAgent = sortedByOnTopic.length > 0 ? sortedByOnTopic[0] : null;

  const getStreamGraphData = () => {
    if (messages.length === 0) return [{ idx: 1 }];
    const agents = Array.from(new Set(agentStats.map(a => a.agent)));
    return messages.map((m, idx) => {
      const point: Record<string, any> = { idx: idx + 1 };
      agents.forEach(agent => {
        point[agent] = 0;
      });
      let sender = 'MODERATOR';
      if (m.role === 'agent-whisper' && m.from) sender = m.from;
      else if (m.role === 'user') sender = 'YOU';
      else if (m.role === 'moderator') sender = 'MODERATOR';
      
      point[sender] = m.content.split(/\s+/).length;
      return point;
    });
  };

  const getRadialBarData = () => {
    const counts: Record<string, number> = {};
    thinking.forEach(t => {
      if (!t.agent) return;
      const name = t.agent.toUpperCase();
      counts[name] = (counts[name] || 0) + t.thought.length;
    });
    const colors = ['#ff00aa', '#00e5ff', '#00ff88', '#ffe600', '#ff2244', '#ff9100'];
    const data = Object.entries(counts).map(([name, value], idx) => ({
      name,
      value,
      fill: colors[idx % colors.length]
    })).sort((a, b) => b.value - a.value);
    return data.length > 0 ? data : [{ name: 'NONE', value: 0, fill: '#8884d8' }];
  };

  const getStackedBarData = () => {
    const data = agentStats.map(item => {
      const verified = item.factsVerifiedRight;
      const unverifiedChecks = Math.max(0, item.factsChecked - item.factsVerifiedRight);
      const uncheckedClaims = Math.max(0, item.factsClaimed - item.factsChecked);
      return {
        name: item.agent.substring(0, 8).toUpperCase(),
        verified,
        unverifiedChecks,
        uncheckedClaims
      };
    });
    return data.length > 0 ? data : [{ name: 'NONE', verified: 0, unverifiedChecks: 0, uncheckedClaims: 0 }];
  };

  const getActionDistributionData = () => {
    let mcpCalls = 0;
    let shellExecs = 0;
    let redecisions = 0;
    let timeouts = 0;
    let loopChecks = 0;

    thinking.forEach(t => {
      if (t.type === 'mcp_call' || t.type === 'mcp_response') mcpCalls++;
      else if (t.type === 'shell') shellExecs++;
      else if (t.type === 'redecision') redecisions++;
      else if (t.type === 'timeout') timeouts++;
      else if (t.type === 'loop_check') loopChecks++;
    });

    return [
      { name: 'MCP', value: mcpCalls, color: 'var(--primary)' },
      { name: 'SHELL', value: shellExecs, color: 'var(--chart-3)' },
      { name: 'LOOP', value: loopChecks, color: 'var(--warning)' },
      { name: 'FAIL', value: timeouts, color: 'rgba(255, 0, 85, 0.95)' }
    ];
  };

  const streamGraphData = getStreamGraphData();
  const stackedBarData = getStackedBarData();
  const actionDistributionData = getActionDistributionData();
  function getProviderLeaderboard() {
    const stats: Record<string, {
      provider: string;
      model: string;
      messagesCount: number;
      factsClaimed: number;
      factsChecked: number;
      factsVerifiedRight: number;
      diversionsCount: number;
    }> = {};

    const getAgentName = (m: Message): string => {
      let role = m.role;
      if (role === 'agent-whisper' && m.from) return m.from;
      if (role === 'moderator-whisper' || role === 'athena-whisper') return 'athena';
      if (role === 'whisper') return 'athena';
      if (role === 'user') return 'YOU';
      return role;
    };

    const chain = settings?.["provider:chain"] || [
      { provider: 'gemini', model: 'gemini-2.0-flash' },
      { provider: 'claude', model: 'haiku' }
    ];
    const defaultProvider = chain[0]?.provider || 'gemini';
    const defaultModel = chain[0]?.model || 'gemini-2.0-flash';

    messages.forEach((m, idx) => {
      const sender = getAgentName(m);
      if (sender === 'SYSTEM' || sender === 'INTERNAL' || sender === 'ERROR' || sender === 'YOU') return;

      const provider = m.provider || defaultProvider;
      const model = m.model || defaultModel;
      const key = `${provider}|${model}`;

      if (!stats[key]) {
        stats[key] = {
          provider,
          model,
          messagesCount: 0,
          factsClaimed: 0,
          factsChecked: 0,
          factsVerifiedRight: 0,
          diversionsCount: 0
        };
      }

      stats[key].messagesCount += 1;

      // Count facts claimed
      const factClaims = m.content.match(/fact\s*\[\d+\]|\[fact:\d+\]/gi) || [];
      stats[key].factsClaimed += factClaims.length;

      // Count facts checked and verified right
      const sentences = m.content.split(/[.!?\n]/);
      sentences.forEach(sentence => {
        const hasFact = /fact\s*\[\d+\]|\[fact:\d+\]/gi.test(sentence);
        if (hasFact) {
          const isCheck = /verify|check|confirm|validate|correct|true|accurate|match/i.test(sentence);
          if (isCheck) {
            stats[key].factsChecked += 1;
            const isRight = !/not|fail|incorrect|wrong|hallucinat|false|discrepancy/i.test(sentence);
            if (isRight) {
              stats[key].factsVerifiedRight += 1;
            }
          }
        }
      });

      // Count diversions
      const contentLower = m.content.toLowerCase();
      const hasDiversion = /off-topic|tangent|divert|deviation|stray|unrelated|sidebar/i.test(contentLower);
      if (hasDiversion) {
        stats[key].diversionsCount += 1;
      }
    });

    return Object.values(stats).map(d => {
      const accuracyRate = d.factsChecked > 0 ? Math.round((d.factsVerifiedRight / d.factsChecked) * 100) : 100;
      const efficiencyScore = d.messagesCount > 0 ? (d.factsClaimed / d.messagesCount).toFixed(1) : '0';
      return {
        ...d,
        accuracyRate,
        efficiencyScore
      };
    }).sort((a, b) => b.accuracyRate - a.accuracyRate || parseFloat(b.efficiencyScore) - parseFloat(a.efficiencyScore));
  };

  function getCognitiveROI() {
    let totalChars = 0;
    messages.forEach(m => totalChars += m.content.length);
    thinking.forEach(t => totalChars += t.thought.length);
    const estTokens = Math.round(totalChars / 4);

    const totalFacts = agentStats.reduce((sum, a) => sum + a.factsClaimed, 0);
    const tokenROI = estTokens > 0 ? ((totalFacts / estTokens) * 1000).toFixed(2) : '0.00';

    const loopOverhead = thinking.filter(t => t.type === 'redecision' || t.type === 'loop_check' || t.type === 'timeout').length;

    const consensusArr = consensusData || [];
    const agreeObj = consensusArr.find(c => c.name === 'AGREEMENT');
    const frictionObj = consensusArr.find(c => c.name === 'FRICTION');
    const agreeVal = agreeObj ? agreeObj.value : 0;
    const frictionVal = frictionObj ? frictionObj.value : 0;
    const consensusRatio = (agreeVal + frictionVal) > 0 ? Math.round((agreeVal / (agreeVal + frictionVal)) * 100) : 100;

    let productivityRating = 100;
    productivityRating -= loopOverhead * 10;
    productivityRating -= totalDiversions * 15;
    productivityRating = Math.max(10, Math.min(100, productivityRating));
    if (totalFacts === 0 && messages.length > 5) {
      productivityRating = Math.round(productivityRating * 0.5);
    }

    return {
      estTokens,
      tokenROI,
      loopOverhead,
      consensusRatio,
      productivityRating
    };
  };

  // Base stats are declared at the top to resolve TDZ issues

  function handleTabClick(tabId: TabId) {
    setActiveTab(prev => prev === tabId ? null : tabId);
  }

  const getThinkingIcon = (type: Thinking['type'], color: string) => {
    switch (type) {
      case 'mcp_call': return <Search size={10} style={{ color }} />;
      case 'mcp_response': return <ListChecks size={10} style={{ color }} />;
      case 'shell': return <Terminal size={10} style={{ color }} />;
      case 'redecision': return <RefreshCcw size={10} style={{ color }} />;
      case 'timeout': return <Timer size={10} style={{ color }} />;
      case 'loop_check': return <Activity size={10} style={{ color }} />;
      default: return <Cpu size={10} style={{ color }} className="opacity-60" />;
    }
  }

  const getAgentColor = (agent: string) => {
    const a = agent.toLowerCase();
    if (a === 'moderator') return 'var(--good)';
    if (a === 'system') return 'var(--chart-5)';
    return 'var(--muted-foreground)';
  }

  function addUploadedFiles(files: FileList | File[]) {
    Array.from(files).forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        window.dispatchEvent(new CustomEvent('toast', { detail: `File ${file.name} is too large (max 5MB)` }));
        return;
      }
      const reader = new FileReader();
      reader.onload = async (event) => {
        const rawContent = event.target?.result;
        if (typeof rawContent === 'string') {
          const content = rawContent.replace(/\0/g, '');
          if (onUploadFile) {
            try {
              await onUploadFile(file.name, content);
            } catch (err: any) {
              window.dispatchEvent(new CustomEvent('toast', { detail: `Failed to upload ${file.name}: ${err.message}` }));
            }
          }
        }
      };
      reader.onerror = () => {
        window.dispatchEvent(new CustomEvent('toast', { detail: `Failed to read file ${file.name}` }));
      };
      reader.readAsText(file);
    });
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addUploadedFiles(e.dataTransfer.files);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      addUploadedFiles(e.target.files);
    }
    e.target.value = "";
  }

  const drawerOpen = activeTab !== null;

  return (
    <>
      <AnimatePresence initial={false}>
        {drawerOpen && (
          <motion.div
            key="drawer-panel"
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{
              position: "absolute",
              left: 0,
              right: 40,
              top: 0,
              bottom: 0,
              overflow: "hidden",
              borderRight: "1px solid var(--border)",
              background: "var(--background)",
              zIndex: 10,
            }}
          >
            <div className="flex flex-col overflow-hidden h-full w-full">
              <div
                style={{
                  color: "var(--primary)",
                  fontFamily: "'Share Tech Mono', monospace",
                  borderBottom: "1px solid var(--border)",
                }}
                className="px-3 py-1.5 text-sm opacity-55 uppercase tracking-widest shrink-0 flex justify-between items-center"
              >
                <span>// {TABS.find(t => t.id === activeTab)?.label}</span>
                {activeTab === 'trace' && <span className="text-[var(--chart-3)] animate-pulse">{statusText}</span>}
              </div>

              <div className="flex-1 overflow-hidden">
                {activeTab === "pulse" && (
                  <QualityPulseDashboard thinking={thinking} messages={messages} statusText={statusText} />
                )}

                {false && (
                  <div className="p-3 h-full overflow-y-auto space-y-4" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--primary) transparent" }}>
                    
                    {/* 1. CHAT VISUALIZATIONS CONTAINER (1 per row at top) */}
                    <section className="bg-[var(--card)] border border-[var(--border)] p-3">
                      <div style={{ color: "var(--primary)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[11px] uppercase tracking-widest mb-3 opacity-70 flex items-center gap-1">
                        <Activity size={11} className="text-[var(--primary)] animate-pulse" />
                        // CHAT_INSIGHTS_VISUALIZATIONS
                      </div>

                      <div className="space-y-3">
                        {/* Row 1: The 4 requested charts in a single row (4 per row) */}
                        <div className="grid grid-cols-4 gap-3">
                          {/* Visual 1: Engagement */}
                          <div className="bg-[var(--secondary)] border border-[var(--border)] p-2">
                            <div style={{ color: "var(--primary)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[9px] uppercase tracking-widest mb-1.5 opacity-70">
                              // engagement_messages
                            </div>
                            <ResponsiveContainer width="100%" height={60}>
                              <BarChart data={engagementData} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" hide />
                                <Bar dataKey="value" fill="var(--primary)" radius={[0, 1, 1, 0]}>
                                  {engagementData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.name === 'YOU' ? 'var(--primary)' : 'var(--chart-3)'} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          {/* Visual 2: Stream Graph (Multi-Agent Chat Flow) */}
                          <div className="bg-[var(--secondary)] border border-[var(--border)] p-2">
                            <div style={{ color: "var(--primary)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[9px] uppercase tracking-widest mb-1.5 opacity-70">
                              // chat_flow_stream_graph
                            </div>
                            <ResponsiveContainer width="100%" height={60}>
                              <AreaChart data={streamGraphData}>
                                <XAxis dataKey="idx" hide />
                                <RechartsTooltip 
                                  contentStyle={{ background: 'var(--secondary)', border: '1px solid var(--border)', fontSize: '8px' }}
                                />
                                {Array.from(new Set(agentStats.map(a => a.agent))).map((agent, index) => {
                                  const colors = ['#00e5ff', '#ff00aa', '#00ff88', '#ffe600', '#ff2244', '#ff9100'];
                                  return (
                                    <Area 
                                      key={agent}
                                      type="monotone" 
                                      dataKey={agent} 
                                      stackId="1" 
                                      stroke={colors[index % colors.length]} 
                                      fill={colors[index % colors.length]} 
                                      opacity={0.6}
                                    />
                                  );
                                })}
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>

                          {/* Visual 3: Consensus Ratio */}
                          <div className="bg-[var(--secondary)] border border-[var(--border)] p-2 flex flex-col justify-between">
                            <div style={{ color: "var(--good)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[9px] uppercase tracking-widest mb-1 opacity-70 w-full">
                              // consensus_balance
                            </div>
                            <div className="flex-1 min-h-0 flex items-center gap-2">
                              <div className="w-[45%] h-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={consensusData}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={8}
                                      outerRadius={16}
                                      paddingAngle={2}
                                      dataKey="value"
                                    >
                                      {consensusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                      ))}
                                    </Pie>
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                              {(() => {
                                const agreeObj = consensusData.find(d => d.name === 'AGREEMENT') || { value: 0 };
                                const frictionObj = consensusData.find(d => d.name === 'FRICTION') || { value: 0 };
                                const total = agreeObj.value + frictionObj.value;
                                const ratio = total > 0 ? Math.round((agreeObj.value / total) * 100) : 100;
                                return (
                                  <div style={{ fontFamily: "'Share Tech Mono', monospace" }} className="flex-1 text-[8px] flex flex-col justify-center space-y-0.5 opacity-90 leading-tight">
                                    <div className="flex justify-between text-[var(--good)]">
                                      <span>AGREE:</span>
                                      <span>{agreeObj.value}</span>
                                    </div>
                                    <div className="flex justify-between text-[rgba(255,0,85,1)]">
                                      <span>FRICTION:</span>
                                      <span>{frictionObj.value}</span>
                                    </div>
                                    <div className="border-t border-[rgba(255,255,255,0.15)] pt-0.5 flex justify-between font-bold text-[var(--primary)]">
                                      <span>RATIO:</span>
                                      <span>{ratio}%</span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Visual 4: Factual Stacked Bar */}
                          <div className="bg-[var(--secondary)] border border-[var(--border)] p-2">
                            <div style={{ color: "var(--chart-3)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[9px] uppercase tracking-widest mb-1.5 opacity-70">
                              // factual_distribution_stack
                            </div>
                            <ResponsiveContainer width="100%" height={60}>
                              <BarChart data={stackedBarData}>
                                <XAxis dataKey="name" hide />
                                <RechartsTooltip 
                                  contentStyle={{ background: 'var(--secondary)', border: '1px solid var(--border)', fontSize: '8px' }}
                                />
                                <Bar dataKey="verified" stackId="a" fill="var(--good)" radius={[1, 1, 0, 0]} />
                                <Bar dataKey="unverifiedChecks" stackId="a" fill="rgba(255, 0, 85, 0.8)" radius={[1, 1, 0, 0]} />
                                <Bar dataKey="uncheckedClaims" stackId="a" fill="var(--primary)" radius={[1, 1, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Row 2: Remaining 3 charts (3 per row) */}
                        <div className="grid grid-cols-3 gap-3">
                          {/* Visual 5: Agent Average Thought Size */}
                          <div className="bg-[var(--secondary)] border border-[var(--border)] p-2">
                            <div style={{ color: "var(--chart-5)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[9px] uppercase tracking-widest mb-1.5 opacity-70">
                              // agent_average_thought_size
                            </div>
                            <ResponsiveContainer width="100%" height={60}>
                              <BarChart data={thoughtLatencyData}>
                                <XAxis dataKey="name" hide />
                                <YAxis hide />
                                <RechartsTooltip 
                                  contentStyle={{ background: 'var(--secondary)', border: '1px solid var(--border)', fontSize: '8px' }}
                                />
                                <Bar dataKey="avgLength" fill="var(--chart-5)" radius={[1, 1, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          {/* Visual 6: Action Execution Distribution */}
                          <div className="bg-[var(--secondary)] border border-[var(--border)] p-2">
                            <div style={{ color: "var(--chart-5)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[9px] uppercase tracking-widest mb-1.5 opacity-70">
                              // action_execution_types
                            </div>
                            <ResponsiveContainer width="100%" height={60}>
                              <BarChart data={actionDistributionData}>
                                <XAxis dataKey="name" hide />
                                <YAxis hide />
                                <RechartsTooltip 
                                  contentStyle={{ background: 'var(--secondary)', border: '1px solid var(--border)', fontSize: '8px' }}
                                />
                                <Bar dataKey="value" fill="var(--primary)" radius={[1, 1, 0, 0]}>
                                  {actionDistributionData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          {/* Visual 7: Agent Output Volume (Words) */}
                          <div className="bg-[var(--secondary)] border border-[var(--border)] p-2">
                            <div style={{ color: "var(--chart-3)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[9px] uppercase tracking-widest mb-1.5 opacity-70">
                              // agent_output_volume_words
                            </div>
                            <ResponsiveContainer width="100%" height={60}>
                              <BarChart data={complexityData}>
                                <XAxis dataKey="name" hide />
                                <RechartsTooltip 
                                  contentStyle={{ background: 'var(--secondary)', border: '1px solid var(--border)', fontSize: '8px' }}
                                />
                                <Bar dataKey="words" fill="var(--chart-3)" radius={[1, 1, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Topic & Chat Health Section */}
                    <section className="bg-[var(--card)] border border-[var(--border)] p-3">
                      <div style={{ color: "var(--primary)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[11px] uppercase tracking-widest mb-3 opacity-70 flex items-center gap-1">
                        <Activity size={11} className="text-[var(--primary)] animate-pulse" />
                        // TOPIC_AND_CHAT_HEALTH_INSIGHTS
                      </div>

                      {(() => {
                        const { totalTopics, dominantTopic, deviations, healthScore, status, statusColor, sortedTopics } = getTopicAndHealthAnalytics();
                        return (
                          <div className="grid grid-cols-4 gap-3 text-center">
                            <div className="bg-[var(--secondary)] border border-[var(--border)] p-2.5 flex flex-col justify-between">
                              <div className="text-[9px] opacity-50 uppercase font-bold tracking-wider mb-1">Topics Discussed ({totalTopics})</div>
                              <div 
                                style={{ 
                                  maxHeight: "36px", 
                                  overflowY: "auto", 
                                  fontFamily: "'Share Tech Mono', monospace" 
                                }} 
                                className="flex flex-wrap gap-1 justify-center p-1 border border-[rgba(0,229,255,0.1)] bg-[rgba(0,0,0,0.2)] scrollbar-thin scrollbar-thumb-[rgba(0,229,255,0.2)] scrollbar-track-transparent"
                              >
                                {sortedTopics.length > 0 ? (
                                  sortedTopics.map(t => (
                                    <span key={t} className="px-1 py-0.5 bg-[rgba(0,229,255,0.06)] border border-[rgba(0,229,255,0.15)] rounded-sm text-[8px] text-[var(--primary)] whitespace-nowrap">
                                      {t}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[8px] opacity-40">NONE</span>
                                )}
                              </div>
                            </div>
                            <div className="bg-[var(--secondary)] border border-[var(--border)] p-2.5 flex flex-col justify-between">
                              <div className="text-[9px] opacity-50 uppercase font-bold tracking-wider">Dominant Topic</div>
                              <div style={{ color: "var(--chart-3)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[11px] font-bold truncate mt-2.5 uppercase">
                                {dominantTopic}
                              </div>
                            </div>
                            <div className="bg-[var(--secondary)] border border-[var(--border)] p-2.5 flex flex-col justify-between">
                              <div className="text-[9px] opacity-50 uppercase font-bold tracking-wider">Topic Deviations</div>
                              <div style={{ color: "rgba(255, 0, 85, 0.9)", fontFamily: "'Share Tech Mono', monospace" }} className="text-xl font-bold mt-1">
                                {deviations}
                              </div>
                            </div>
                            <div className="bg-[var(--secondary)] border border-[var(--border)] p-2.5 flex flex-col justify-between">
                              <div className="text-[9px] opacity-50 uppercase font-bold tracking-wider">Chat Health</div>
                              <div className="mt-1 flex items-center justify-center gap-1.5">
                                <span style={{ color: statusColor, fontFamily: "'Share Tech Mono', monospace" }} className="text-base font-bold">
                                  {healthScore}%
                                </span>
                                <span style={{ background: statusColor }} className="w-1.5 h-1.5 rounded-full animate-ping shrink-0" />
                              </div>
                              <div style={{ color: statusColor, fontSize: '8px' }} className="font-bold tracking-widest uppercase mt-0.5 opacity-80">
                                {status}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </section>

                    {/* 2. DIAGNOSTICS GRIDS (3 per row - most of them) */}
                    <div className="grid grid-cols-3 gap-3">
                      {/* Factual Integrity & Hallucination Diagnostics */}
                      <section className="bg-[var(--card)] border border-[var(--border)] p-3">
                        <div style={{ color: "var(--good)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[11px] uppercase tracking-widest mb-3 opacity-70 flex items-center gap-1">
                          <Zap size={11} className="text-[var(--good)] animate-pulse" />
                          // FACTUAL_INTEGRITY_DIAGNOSTICS
                        </div>
                        
                        {/* High-level facts summaries */}
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-[var(--secondary)] border border-[var(--border)] p-2 text-center">
                            <div className="text-[9px] opacity-50 uppercase">Most Facts</div>
                            <div style={{ color: "var(--primary)", fontFamily: "'Share Tech Mono', monospace" }} className="text-sm font-bold truncate mt-1">
                              {mostFactsAgent ? `${mostFactsAgent?.agent} (${mostFactsAgent?.factsClaimed})` : "N/A"}
                            </div>
                          </div>
                          <div className="bg-[var(--secondary)] border border-[var(--border)] p-2 text-center">
                            <div className="text-[9px] opacity-50 uppercase">Least Facts</div>
                            <div style={{ color: "var(--chart-5)", fontFamily: "'Share Tech Mono', monospace" }} className="text-sm font-bold truncate mt-1">
                              {leastFactsAgent ? `${leastFactsAgent?.agent} (${leastFactsAgent?.factsClaimed})` : "N/A"}
                            </div>
                          </div>
                          <div className="bg-[var(--secondary)] border border-[var(--border)] p-2 text-center">
                            <div className="text-[9px] opacity-50 uppercase">Champion</div>
                            <div style={{ color: "var(--good)", fontFamily: "'Share Tech Mono', monospace" }} className="text-sm font-bold truncate mt-1" title={factCheckChampion ? `Checked ${factCheckChampion?.factsChecked}, Verified ${factCheckChampion?.factsVerifiedRight} right` : ""}>
                              {factCheckChampion ? `${factCheckChampion?.agent} (${factCheckChampion?.factsVerifiedRight}✓)` : "N/A"}
                            </div>
                          </div>
                        </div>

                        {/* Details table/list */}
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-4 text-[9px] uppercase tracking-wider opacity-50 px-1 font-bold">
                            <span>Agent</span>
                            <span className="text-right">Claims</span>
                            <span className="text-right">Checks</span>
                            <span className="text-right">Right</span>
                          </div>
                          <div style={{ height: 1, background: "var(--border)", opacity: 0.3 }} />
                          {agentStats.length === 0 ? (
                            <div className="text-center text-[11px] opacity-35 py-2">No data.</div>
                          ) : (
                            agentStats.map((item, idx) => (
                              <div key={idx} className="grid grid-cols-4 text-[11px] items-center px-1 py-1 hover:bg-[var(--secondary)]">
                                <span style={{ fontFamily: "'Share Tech Mono', monospace", color: "var(--primary)" }} className="truncate font-medium">{item.agent}</span>
                                <span className="text-right text-[var(--foreground)]">{item.factsClaimed}</span>
                                <span className="text-right text-[var(--foreground)]">{item.factsChecked}</span>
                                <span className="text-right text-[var(--good)] font-bold">{item.factsVerifiedRight}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </section>

                      {/* Topic Drift & Diversion Analysis */}
                      <section className="bg-[var(--card)] border border-[var(--border)] p-3">
                        <div style={{ color: "var(--chart-3)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[11px] uppercase tracking-widest mb-3 opacity-70 flex items-center gap-1">
                          <GitBranch size={11} className="text-[var(--chart-3)]" />
                          // TOPIC_DRIFT_ANALYSIS
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-[var(--secondary)] border border-[var(--border)] p-2 text-center">
                            <div className="text-[9px] opacity-50 uppercase">Most On-Topic</div>
                            <div style={{ color: "var(--good)", fontFamily: "'Share Tech Mono', monospace" }} className="text-sm font-bold truncate mt-1">
                              {mostOnTopicAgent ? `${mostOnTopicAgent?.agent} (${mostOnTopicAgent?.onTopicPercentage}%)` : "N/A"}
                            </div>
                          </div>
                          <div className="bg-[var(--secondary)] border border-[var(--border)] p-2 text-center">
                            <div className="text-[9px] opacity-50 uppercase">Diversions</div>
                            <div style={{ color: "rgba(255, 0, 85, 1)", fontFamily: "'Share Tech Mono', monospace" }} className="text-sm font-bold truncate mt-1">
                              {totalDiversions} times
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="grid grid-cols-12 text-[9px] uppercase tracking-wider opacity-50 px-1 font-bold">
                            <span className="col-span-4">Agent</span>
                            <span className="col-span-5 text-center">On-Topic</span>
                            <span className="col-span-3 text-right">Divs</span>
                          </div>
                          <div style={{ height: 1, background: "var(--border)", opacity: 0.3 }} />
                          {agentStats.length === 0 ? (
                            <div className="text-center text-[11px] opacity-35 py-2">No data.</div>
                          ) : (
                            agentStats.map((item, idx) => (
                              <div key={idx} className="grid grid-cols-12 text-[11px] items-center px-1 py-1 hover:bg-[var(--secondary)]">
                                <span style={{ fontFamily: "'Share Tech Mono', monospace", color: "var(--chart-3)" }} className="col-span-4 truncate font-medium">{item.agent}</span>
                                <div className="col-span-5 px-2 flex items-center gap-1.5">
                                  <div className="flex-1 bg-[var(--secondary)] h-1.5 rounded-none overflow-hidden border border-[var(--border)]">
                                    <div 
                                      style={{ 
                                        width: `${item.onTopicPercentage}%`,
                                        background: item.onTopicPercentage > 80 ? 'var(--good)' : item.onTopicPercentage > 50 ? 'var(--chart-3)' : 'rgba(255, 0, 85, 1)'
                                      }} 
                                      className="h-full rounded-none"
                                    />
                                  </div>
                                  <span className="text-[9px] min-w-[20px] text-right font-bold">{item.onTopicPercentage}%</span>
                                </div>
                                <span className={`col-span-3 text-right font-bold ${item.diversionsCount > 0 ? 'text-[rgba(255,0,85,1)]' : 'text-[var(--muted-foreground)]'}`}>
                                  {item.diversionsCount}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </section>

                      {/* COGNITIVE ROI & EFFICIENCY DIAGNOSTICS */}
                      <section className="bg-[var(--card)] border border-[var(--border)] p-3 flex flex-col justify-between">
                        <div>
                          <div style={{ color: "var(--primary)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[11px] uppercase tracking-widest mb-3 opacity-70 flex items-center gap-1">
                            <Timer size={11} className="text-[var(--primary)]" />
                            // COGNITIVE_ROI_DIAGNOSTICS
                          </div>

                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="bg-[var(--secondary)] border border-[var(--border)] p-1.5 text-center">
                              <div className="text-[8px] opacity-50 uppercase">Est. Tokens</div>
                              <div style={{ color: "var(--primary)", fontFamily: "'Share Tech Mono', monospace" }} className="text-sm font-bold mt-1">
                                {cognitiveROI.estTokens}
                              </div>
                            </div>
                            <div className="bg-[var(--secondary)] border border-[var(--border)] p-1.5 text-center">
                              <div className="text-[8px] opacity-50 uppercase">Token ROI</div>
                              <div style={{ color: "var(--good)", fontFamily: "'Share Tech Mono', monospace" }} className="text-sm font-bold mt-1" title="Facts per 1,000 tokens">
                                {cognitiveROI.tokenROI} <span className="text-[8px] opacity-45">F/1K</span>
                              </div>
                            </div>
                            <div className="bg-[var(--secondary)] border border-[var(--border)] p-1.5 text-center">
                              <div className="text-[8px] opacity-50 uppercase">Loop Overhead</div>
                              <div style={{ color: cognitiveROI.loopOverhead > 2 ? "rgba(255, 0, 85, 1)" : "var(--chart-3)", fontFamily: "'Share Tech Mono', monospace" }} className="text-sm font-bold mt-1">
                                {cognitiveROI.loopOverhead} cycles
                              </div>
                            </div>
                            <div className="bg-[var(--secondary)] border border-[var(--border)] p-1.5 text-center">
                              <div className="text-[8px] opacity-50 uppercase">Productivity</div>
                              <div style={{ color: "var(--good)", fontFamily: "'Share Tech Mono', monospace" }} className="text-sm font-bold mt-1">
                                {cognitiveROI.productivityRating}%
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1 text-[11px]">
                          <div className="flex justify-between items-center opacity-70">
                            <span>Consensus Ratio:</span>
                            <span className="font-bold text-[var(--primary)]">{cognitiveROI.consensusRatio}%</span>
                          </div>
                          <div className="flex justify-between items-center opacity-70">
                            <span>Factual Density:</span>
                            <span className="font-bold text-[var(--good)]">
                              {(messages.length > 0 ? (agentStats.reduce((sum, a) => sum + a.factsClaimed, 0) / messages.length).toFixed(2) : "0.00")}
                            </span>
                          </div>
                          {cognitiveROI.loopOverhead > 2 && (
                            <div className="text-[9px] text-[rgba(255,0,85,0.85)] flex items-center gap-1 mt-1 font-bold animate-pulse">
                              <AlertTriangle size={9} />
                              WARNING: High loop overhead.
                            </div>
                          )}
                        </div>
                      </section>

                      {/* MODEL PROVIDER PERFORMANCE LEADERBOARD */}
                      <section className="bg-[var(--card)] border border-[var(--border)] p-3">
                        <div style={{ color: "var(--chart-3)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[11px] uppercase tracking-widest mb-3 opacity-70 flex items-center gap-1">
                          <ListChecks size={11} className="text-[var(--chart-3)]" />
                          // MODEL_PROVIDER_LEADERBOARD
                        </div>

                        <div className="space-y-1.5">
                          <div className="grid grid-cols-12 text-[9px] uppercase tracking-wider opacity-50 px-1 font-bold">
                            <span className="col-span-4">Provider/Model</span>
                            <span className="col-span-2 text-right">Msgs</span>
                            <span className="col-span-2 text-right">Facts</span>
                            <span className="col-span-2 text-right">Acc</span>
                            <span className="col-span-2 text-right">Dens</span>
                          </div>
                          <div style={{ height: 1, background: "var(--border)", opacity: 0.3 }} />
                          {providerStats.length === 0 ? (
                            <div className="text-center text-[11px] opacity-35 py-2">No stats found.</div>
                          ) : (
                            providerStats.map((item, idx) => (
                              <div key={idx} className="grid grid-cols-12 text-[11px] items-center px-1 py-1 hover:bg-[var(--secondary)]">
                                <div className="col-span-4 truncate flex flex-col">
                                  <span style={{ fontFamily: "'Share Tech Mono', monospace", color: "var(--primary)" }} className="font-medium truncate">{item.provider}</span>
                                  <span className="text-[8px] text-[var(--muted-foreground)] truncate">{item.model}</span>
                                </div>
                                <span className="col-span-2 text-right text-[var(--foreground)]">{item.messagesCount}</span>
                                <span className="col-span-2 text-right text-[var(--foreground)]">{item.factsClaimed}</span>
                                <span className="col-span-2 text-right text-[var(--good)] font-bold">{item.accuracyRate}%</span>
                                <span className="col-span-2 text-right text-[var(--chart-3)] font-bold">{item.efficiencyScore} F/M</span>
                              </div>
                            ))
                          )}
                        </div>
                      </section>

                      {/* MCP INTEGRATION METRICS (Spans 2 columns to complete the 3-column row) */}
                      <section className="bg-[var(--card)] border border-[var(--border)] p-3 col-span-2">
                        <div style={{ color: "var(--chart-5)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[11px] uppercase tracking-widest mb-3 opacity-70 flex items-center gap-1">
                          <Cpu size={11} className="text-[var(--chart-5)]" />
                          // MCP_INTEGRATION_METRICS
                        </div>

                        <div className="space-y-2">
                          <div className="grid grid-cols-12 text-[9px] uppercase tracking-wider opacity-50 px-1 font-bold">
                            <span className="col-span-4">MCP Server</span>
                            <span className="col-span-4">Tool</span>
                            <span className="col-span-3">Caller</span>
                            <span className="col-span-1 text-right">Calls</span>
                          </div>
                          <div style={{ height: 1, background: "var(--border)", opacity: 0.3 }} />
                          {mcpCallStats.length === 0 ? (
                            <div className="text-center text-[11px] opacity-35 py-2">No MCP calls.</div>
                          ) : (
                            mcpCallStats.map((item, idx) => (
                              <div key={idx} className="grid grid-cols-12 text-[11px] items-center px-1 py-1 hover:bg-[var(--secondary)]">
                                <span style={{ fontFamily: "'Share Tech Mono', monospace", color: "var(--chart-5)" }} className="col-span-4 truncate font-medium">{item.server}</span>
                                <span style={{ fontFamily: "'Share Tech Mono', monospace", color: "var(--primary)" }} className="col-span-4 truncate font-medium">{item.tool}</span>
                                <span className="col-span-3 truncate text-[var(--foreground)]">{item.caller}</span>
                                <span className="col-span-1 text-right text-[var(--chart-3)] font-bold">{item.count}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </section>
                    </div>

                    {/* 3. NEURAL FACT INDEX / WORD CLOUD (1 per row at bottom) */}
                    <section className="bg-[var(--card)] border border-[var(--border)] p-3">
                      <div style={{ color: "var(--good)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[11px] uppercase tracking-widest mb-2 opacity-70">
                        // NEURAL_FACT_INDEX
                      </div>
                      <div className="h-[380px] border border-[var(--border)] bg-[var(--secondary)] relative overflow-hidden">
                        <NeuralFactNetwork data={factNetwork} />
                      </div>
                      <div className="flex justify-center gap-4 mt-2 opacity-40 hover:opacity-100 transition-opacity">
                        <span style={{ color: "var(--good)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[9px]">
                          SCROLL TO ZOOM · DRAG TO PAN
                        </span>
                      </div>
                    </section>

                  </div>
                )}

                {activeTab === "trace" && (
                  <div className="trace-viewport">
                    {thinking.map(t => {
                      const agentColor = getAgentColor(t.agent);
                      return (
                        <div
                          key={t.id}
                          style={{ borderLeft: `2px solid ${agentColor}` }}
                          className="trace-card"
                        >
                          <div className="trace-card-header">
                            <span style={{ color: agentColor }} className="trace-agent-name">
                              {t.agent.toUpperCase()}
                            </span>
                            <div className="trace-meta-info">
                              {getThinkingIcon(t.type, agentColor)}
                              <span className="trace-timestamp">
                                {new Date(t.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          <div className="trace-thought-text">
                            {t.thought}
                          </div>
                        </div>
                      );
                    })}
                    {thinking.length === 0 && (
                      <div className="trace-empty-state">
                        <Zap size={32} />
                        <span className="trace-empty-text">idle_state</span>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "graph" && (
                  <div className="p-3 h-full flex flex-col">
                    <div
                      onDragOver={e => e.preventDefault()}
                      onDrop={handleFileDrop}
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                        color: "var(--primary)",
                        fontFamily: "'Share Tech Mono', monospace",
                      }}
              className="p-3 text-[11px] opacity-60 text-center uppercase tracking-widest shrink-0"
                    >
                      neural_session_graph
                    </div>
                    <div className="flex-1 min-h-0 relative overflow-hidden bg-[var(--card)] border border-[var(--border)] border-t-0">
                       <AgentGraph messages={messages} thinking={thinking} />
                    </div>
                    <div className="flex justify-center gap-4 mt-2 opacity-40 hover:opacity-100 transition-opacity">
                      <span style={{ color: "var(--primary)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[11px]">
                        SCROLL TO ZOOM · DRAG TO PAN
                      </span>
                    </div>
                  </div>
                )}

                {activeTab === "summary" && (
                  <div className="p-3 h-full flex flex-col min-h-0 space-y-3">
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={onSummarize}
                        disabled={statusText === 'RECALIBRATING...'}
                        style={{
                          background: "var(--primary)",
                          color: "var(--background)",
                          fontFamily: "'Share Tech Mono', monospace",
                          opacity: statusText === 'RECALIBRATING...' ? 0.7 : 1,
                          cursor: statusText === 'RECALIBRATING...' ? "not-allowed" : "pointer"
                        }}
                        className="flex-1 px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                      >
                        {statusText === 'RECALIBRATING...' ? (
                          <>
                            <RefreshCcw size={12} className="animate-spin" />
                            COMPUTING...
                          </>
                        ) : (
                          <>
                            <Sparkles size={12} />
                            Regenerate
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label="Rendered markdown"
                        onClick={() => setSummaryMode("rendered")}
                        className={`px-2 py-2 text-[10px] border ${summaryMode === "rendered" ? "text-[var(--primary)] border-[var(--primary)]" : "text-[var(--muted-foreground)] border-[var(--border)]"}`}
                      >
                        PREVIEW
                      </button>
                      <button
                        type="button"
                        aria-label="Markdown source"
                        onClick={() => setSummaryMode("source")}
                        className={`px-2 py-2 text-[10px] border ${summaryMode === "source" ? "text-[var(--primary)] border-[var(--primary)]" : "text-[var(--muted-foreground)] border-[var(--border)]"}`}
                      >
                        MARKDOWN
                      </button>
                    </div>

                    {statusText === 'RECALIBRATING...' ? (
                      <div
                        style={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          fontFamily: "'Share Tech Mono', monospace",
                          color: "var(--primary)",
                          position: "relative",
                        }}
                        className="flex-1 min-h-0 p-4 text-[11px] leading-relaxed relative overflow-y-auto"
                      >
                        <div 
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background: "linear-gradient(rgba(0, 229, 255, 0.05) 50%, rgba(0, 0, 0, 0) 50%)",
                            backgroundSize: "100% 4px",
                            zIndex: 10
                          }}
                        />
                        
                        {/* Scanning Line */}
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            height: "2px",
                            background: "var(--primary)",
                            boxShadow: "0 0 8px var(--primary)",
                            opacity: 0.8,
                            animation: "scan 2s linear infinite",
                            zIndex: 20
                          }}
                        />
                        
                        <style dangerouslySetInnerHTML={{__html: `
                          @keyframes scan {
                            0% { top: 0%; }
                            50% { top: 100%; }
                            100% { top: 0%; }
                          }
                        `}} />

                        <div className="space-y-2 relative z-0">
                          <div className="flex items-center gap-2 text-xs font-bold text-[var(--primary)] uppercase tracking-wider mb-3">
                            <Cpu size={14} className="animate-pulse" />
                            <span>NEURAL RECALIBRATION ACTIVE</span>
                          </div>

                          <div className="space-y-1 opacity-80 text-xs">
                            {[
                              "INITIALIZING NEURAL RECALIBRATION PROTOCOL...",
                              "CONNECTING TO ATHENA CORE SYNERGY...",
                              "EVALUATING CHAT SYNAPSES AND INTENTS...",
                              "EXTRACTING MULTI-AGENT COGNITIVE PATHWAYS...",
                              "SYNTHESIZING TEMPORAL SUMMARY STATES...",
                              "FINALIZING NEURAL DEPLOYMENT MATRIX..."
                            ].slice(0, computingStep + 1).map((step, idx) => (
                              <div key={idx} className="flex gap-2 items-start">
                                <span style={{ color: "var(--primary)" }}>&gt;</span>
                                <span className={idx === computingStep ? "animate-pulse font-bold" : "opacity-60"}>
                                  {step}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="mt-4 pt-3 border-t border-[rgba(0,229,255,0.15)] flex justify-between items-center text-[10px] opacity-50">
                            <span>THROUGHPUT: {(Math.random() * 50 + 150).toFixed(1)} GB/S</span>
                            <span className="animate-ping">●</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          fontFamily: "'Rajdhani', sans-serif",
                          color: "var(--foreground)",
                        }}
                        className="flex-1 min-h-0 p-4 text-[12px] leading-relaxed overflow-y-auto"
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p style={{ color: "var(--primary)", fontFamily: "'Share Tech Mono', monospace" }}>
                            // session_summary.md
                          </p>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label="Copy markdown"
                              title="Copy markdown"
                              onClick={() => navigator.clipboard.writeText(summaryMarkdown)}
                              className="p-1.5 border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                            >
                              <Copy size={11} />
                            </button>
                            <button
                              type="button"
                              aria-label="Download markdown"
                              title="Download markdown"
                              onClick={() => {
                                const blob = new Blob([summaryMarkdown], { type: "text/markdown" });
                                const url = URL.createObjectURL(blob);
                                const anchor = document.createElement("a");
                                anchor.href = url;
                                anchor.download = "session-summary.md";
                                anchor.click();
                                URL.revokeObjectURL(url);
                              }}
                              className="p-1.5 border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                            >
                              <Download size={11} />
                            </button>
                          </div>
                        </div>
                        {summaryMode === "rendered" ? (
                          <div className="summary-markdown">
                            <ChatMarkdown content={summaryMarkdown} />
                          </div>
                        ) : (
                          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono text-[var(--foreground)]">
                            {summaryMarkdown}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "uploads" && (
                  <div className="p-3 space-y-3" onDragOver={e => e.preventDefault()} onDrop={handleFileDrop}>
                    <div
                      style={{
                        border: "1px dashed var(--border)",
                        background: "var(--card)",
                        color: "var(--primary)",
                        fontFamily: "'Share Tech Mono', monospace",
                      }}
                      className="p-4 text-center text-[11px] opacity-60"
                    >
                      <Upload size={16} className="mx-auto mb-1 opacity-40" />
                      drop files or{" "}
                      <label className="underline cursor-pointer">
                        browse
                        <input type="file" multiple className="hidden" onChange={handleFileInput} />
                      </label>
                    </div>
                    {sessionFiles.length > 0 && (
                      <div className="space-y-2">
                        {sessionFiles.map((file, index) => (
                          <div
                            key={`${file.name}-${index}`}
                            style={{
                              background: "var(--secondary)",
                              border: "1px solid var(--border)",
                              color: "var(--foreground)",
                              fontFamily: "'Share Tech Mono', monospace",
                              borderRadius: "4px"
                            }}
                            className="p-2 text-xs flex flex-col gap-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 overflow-hidden flex-1">
                                <FileText size={10} style={{ color: "var(--primary)" }} />
                                <span className="truncate opacity-75 font-semibold" title={file.name}>{file.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {file.loading && <span className="text-[10px] text-[var(--chart-3)] animate-pulse">(summarizing...)</span>}
                                <button
                                  type="button"
                                  onClick={() => onDeleteSessionFile?.(file.name)}
                                  className="text-[var(--muted-foreground)] hover:text-[var(--accent)] transition-colors p-0.5"
                                  title="Delete file"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </div>
                            {file.summary && (
                              <details className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                                <summary className="cursor-pointer hover:text-[var(--primary)] transition-colors select-none font-bold">
                                  View Summary
                                </summary>
                                <div 
                                  className="mt-1 p-1.5 bg-[var(--secondary)] border border-[var(--border)] rounded-none overflow-y-auto select-text max-h-40 whitespace-pre-wrap"
                                  style={{ fontFamily: "var(--font-sans)", lineHeight: "1.3" }}
                                >
                                  {file.summary}
                                </div>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <aside
        style={{
          background: "var(--background)",
          borderLeft: "1px solid var(--border)",
          width: 40,
        }}
        className="h-full shrink-0 flex flex-col justify-start py-2 z-20"
      >
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <NavIcon
              key={tab.id}
              icon={<Icon size={16} />}
              label={tab.label}
              onClick={() => handleTabClick(tab.id)}
              isActive={activeTab === tab.id}
            />
          );
        })}
      </aside>
    </>
  );
}

function NeuralFactNetwork({ data }: { data: { nodes: any[], edges: any[], whispers?: any[], forwards?: any[], crosschecks?: any[], facts?: any[] } }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'inspector' | 'whispers' | 'forwards' | 'crosschecks' | 'facts'>('inspector');
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [selectedEdge, setSelectedEdge] = useState<any>(null);
  const containerRef = useRef<SVGSVGElement>(null);

  // Simple deterministic circle layout + jitter for network feel
  const nodesWithPos = data.nodes.map((node, i) => {
    const angle = (i / data.nodes.length) * 2 * Math.PI;
    const radius = 40 + (i % 3) * 15; // Vary radius for depth
    return {
      ...node,
      x: 100 + radius * Math.cos(angle),
      y: 100 + radius * Math.sin(angle),
    };
  });

  const maxCount = Math.max(...data.nodes.map(n => n.count), 1);

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.5), 5));
  };

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan(prev => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }));
    }
  };

  return (
    <div className="flex flex-row h-full w-full bg-[var(--background)] select-none min-h-0 overflow-hidden">
      {/* Left side: SVG Visualization */}
      <div className="flex-1 min-h-0 relative bg-[var(--secondary)] border border-[var(--border)] overflow-hidden">
        <svg 
          ref={containerRef}
          width="100%" height="100%" 
          viewBox="0 0 200 200"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={() => {
            setSelectedNode(null);
            setSelectedEdge(null);
          }}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <defs>
            <filter id="factGlow">
              <feGaussianBlur stdDeviation="1.5" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} style={{ transformOrigin: 'center' }}>
            {/* Edges */}
            {data.edges.map((edge, i) => {
              const s = nodesWithPos.find(n => n.text === edge.source);
              const t = nodesWithPos.find(n => n.text === edge.target);
              if (!s || !t) return null;
              
              const isSelected = selectedEdge?.source === edge.source && selectedEdge?.target === edge.target;
              
              let strokeColor = "var(--good)";
              if (edge.type === 'crosscheck') {
                strokeColor = "var(--chart-5)";
              } else if (edge.type === 'communication') {
                strokeColor = "var(--primary)";
              }

              return (
                <line
                  key={i}
                  x1={s.x} y1={s.y}
                  x2={t.x} y2={t.y}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 0.8 : 0.3}
                  strokeOpacity={isSelected ? 0.9 : 0.15 + (edge.weight / 5) * 0.3}
                  strokeDasharray={edge.type === 'crosscheck' ? "2,2" : undefined}
                  cursor="pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEdge(edge);
                    setSelectedNode(null);
                    if (edge.type === 'crosscheck') {
                      setActiveSubTab('crosschecks');
                    } else if (edge.type === 'communication') {
                      setActiveSubTab('whispers');
                    } else {
                      setActiveSubTab('inspector');
                    }
                  }}
                />
              );
            })}

            {/* Nodes */}
            {nodesWithPos.map((node, i) => {
              const sizeRatio = node.count / maxCount;
              const fontSize = 5 + sizeRatio * 6;
              const opacity = 0.4 + sizeRatio * 0.6;
              const isSelected = selectedNode?.text === node.text;

              let nodeColor = "var(--good)";
              let radius = 1.5 + sizeRatio * 2;
              
              if (node.type === 'agent') {
                nodeColor = "var(--primary)";
                radius = 3.0 + sizeRatio * 1.5;
              } else if (node.type === 'fact') {
                nodeColor = "var(--chart-3)";
                radius = 2.0 + sizeRatio * 1.0;
              } else if (node.type === 'crosscheck') {
                nodeColor = "var(--chart-5)";
                radius = 2.0 + sizeRatio * 1.0;
              }

              return (
                <g 
                  key={i}
                  cursor="pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNode(node);
                    setSelectedEdge(null);
                    if (node.type === 'fact') {
                      setActiveSubTab('facts');
                    } else if (node.type === 'crosscheck') {
                      setActiveSubTab('crosschecks');
                    } else {
                      setActiveSubTab('inspector');
                    }
                  }}
                >
                  {isSelected && (
                    <circle
                      cx={node.x} cy={node.y}
                      r={radius + 1.5}
                      fill="none"
                      stroke={nodeColor}
                      strokeWidth={0.5}
                      className="animate-pulse"
                    />
                  )}
                  <circle 
                    cx={node.x} cy={node.y} 
                    r={radius} 
                    fill={nodeColor} 
                    fillOpacity={isSelected ? 1.0 : 0.8}
                    filter="url(#factGlow)"
                  />
                  <text
                    x={node.x} y={node.y - (radius + 1.5)}
                    textAnchor="middle"
                    fill={nodeColor}
                    fontSize={fontSize}
                    fontWeight={node.type === 'agent' || isSelected ? 'bold' : 'normal'}
                    fontFamily="'Share Tech Mono', monospace"
                    style={{ opacity: isSelected ? 1.0 : opacity, textTransform: 'uppercase' }}
                  >
                    {node.text}
                  </text>
                </g>
              );
            })}

            {data.nodes.length === 0 && (
              <text 
                x="100" y="100" 
                textAnchor="middle" 
                fill="var(--good)" 
                opacity="0.2" 
                fontSize="8"
                fontFamily="'Share Tech Mono', monospace"
              >
                // AWAITING_FACTUAL_INTEL...
              </text>
            )}
          </g>
        </svg>
      </div>

      {/* Right side: Interactive inspector panel */}
      <div className="flex-shrink-0 w-[680px] border-l border-[var(--border)] bg-[var(--background)] flex flex-col min-h-0 h-full text-[10px] font-mono">
        {/* Tab Headers (Symmetric 2x2 grid + full width Facts row) */}
        <div className="flex flex-wrap border-b border-[var(--border)] bg-[var(--secondary)] text-[11px] font-bold tracking-widest flex-shrink-0">
          <button
            onClick={() => setActiveSubTab('inspector')}
            style={{ width: '50%' }}
            className={`text-center py-1 border-r border-b border-[var(--border)] uppercase transition-colors ${
              activeSubTab === 'inspector' ? 'text-[var(--primary)] bg-[var(--card)] font-bold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            INSPECT
          </button>
          <button
            onClick={() => setActiveSubTab('whispers')}
            style={{ width: '50%' }}
            className={`text-center py-1 border-b border-[var(--border)] uppercase transition-colors ${
              activeSubTab === 'whispers' ? 'text-[var(--primary)] bg-[var(--card)] font-bold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            WHISP ({data.whispers?.length || 0})
          </button>
          <button
            onClick={() => setActiveSubTab('forwards')}
            style={{ width: '50%' }}
            className={`text-center py-1 border-r border-b border-[var(--border)] uppercase transition-colors ${
              activeSubTab === 'forwards' ? 'text-[var(--primary)] bg-[var(--card)] font-bold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            FWD ({data.forwards?.length || 0})
          </button>
          <button
            onClick={() => setActiveSubTab('crosschecks')}
            style={{ width: '50%' }}
            className={`text-center py-1 border-b border-[var(--border)] uppercase transition-colors ${
              activeSubTab === 'crosschecks' ? 'text-[var(--primary)] bg-[var(--card)] font-bold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            CROSS ({data.crosschecks?.length || 0})
          </button>
          <button
            onClick={() => setActiveSubTab('facts')}
            style={{ width: '100%' }}
            className={`text-center py-1 border-b border-[var(--border)] uppercase transition-colors ${
              activeSubTab === 'facts' ? 'text-[var(--primary)] bg-[var(--card)] font-bold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            FACTS ({data.facts?.length || 0})
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-1.5" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--primary) transparent' }}>
          {activeSubTab === 'inspector' && (
            <div className="space-y-1.5">
              {selectedNode ? (
                <div>
                  <div className="flex justify-between items-center border-b border-[var(--border)] pb-1 mb-1">
                    <span className="font-bold text-[var(--primary)] uppercase text-[12px] truncate">{selectedNode.text}</span>
                    <span className="px-1.5 py-0.5 text-[9px] bg-[var(--secondary)] border border-[var(--border)] uppercase shrink-0" style={{ color: selectedNode.type === 'agent' ? 'var(--primary)' : selectedNode.type === 'fact' ? 'var(--chart-3)' : selectedNode.type === 'crosscheck' ? 'var(--chart-5)' : 'var(--good)' }}>
                      {selectedNode.type}
                    </span>
                  </div>
                  <div className="space-y-0.5 text-[10px] opacity-80">
                    <div>Occurrences: <span className="font-bold text-[var(--foreground)]">{selectedNode.count}</span></div>
                    {selectedNode.type === 'agent' && (
                      <>
                        <div>Whispers: <span className="font-bold text-[var(--foreground)]">{(data.whispers || []).filter(w => w.from === selectedNode.text).length}</span></div>
                        <div>Forwards: <span className="font-bold text-[var(--foreground)]">{(data.forwards || []).filter(f => f.to === selectedNode.text).length}</span></div>
                      </>
                    )}
                  </div>
                  {selectedNode.type === 'fact' && (
                    <div className="mt-2 p-1.5 bg-[var(--secondary)] border border-[var(--chart-3)]/20 text-[10px] rounded-none">
                      <div className="text-[var(--chart-3)] font-bold mb-0.5 text-[10px]">FACT DETAILS</div>
                      <div className="text-[var(--foreground)] italic">"{(data.facts || []).find(f => f.label === selectedNode.text)?.content || 'No text extracted.'}"</div>
                      <div className="text-[9px] mt-0.5 opacity-55">Source: {(data.facts || []).find(f => f.label === selectedNode.text)?.source || 'Unknown'}</div>
                    </div>
                  )}
                </div>
              ) : selectedEdge ? (
                <div>
                  <div className="flex justify-between items-center border-b border-[var(--border)] pb-1 mb-1">
                    <span className="font-bold text-[var(--primary)] uppercase text-[11px] truncate">{selectedEdge.source} ⇄ {selectedEdge.target}</span>
                    <span className="px-1.5 py-0.5 text-[9px] bg-[var(--secondary)] border border-[var(--border)] uppercase shrink-0" style={{ color: selectedEdge.type === 'communication' ? 'var(--primary)' : selectedEdge.type === 'crosscheck' ? 'var(--chart-5)' : 'var(--good)' }}>
                      {selectedEdge.type}
                    </span>
                  </div>
                  <div className="text-[10px] opacity-80">
                    <div>Weight: <span className="font-bold text-[var(--foreground)]">{selectedEdge.weight.toFixed(1)}</span></div>
                  </div>
                  {selectedEdge.type === 'crosscheck' && (
                    <div className="mt-2 p-1.5 bg-[var(--secondary)] border border-[var(--chart-5)]/20 text-[10px] rounded-none">
                      <div className="text-[var(--chart-5)] font-bold mb-0.5 text-[10px]">CROSS-CHECK</div>
                      <div className="text-[var(--foreground)] italic">
                        "{(data.crosschecks || []).find(c => (c.from === selectedEdge.source && c.target === selectedEdge.target) || (c.from === selectedEdge.target && c.target === selectedEdge.source))?.feedback || 'Feedback logged.'}"
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-[var(--muted-foreground)] py-4 italic text-[10.5px]">
                  Click node/edge to inspect paths.
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'whispers' && (
            <div className="space-y-1">
              {(data.whispers || []).length === 0 ? (
                <div className="text-center text-[var(--muted-foreground)] py-4 italic text-[10.5px]">No whispers.</div>
              ) : (data.whispers || []).map((w, idx) => (
                <div key={idx} className="p-1 bg-[var(--secondary)] border border-[var(--primary)]/10 text-[10px] rounded-none">
                  <div className="flex justify-between text-[var(--primary)] font-bold mb-0.5">
                    <span>{w.from} ➔ {w.to}</span>
                  </div>
                  <div className="text-[var(--foreground)]">{w.content}</div>
                </div>
              ))}
            </div>
          )}

          {activeSubTab === 'forwards' && (
            <div className="space-y-1">
              {(data.forwards || []).length === 0 ? (
                <div className="text-center text-[var(--muted-foreground)] py-4 italic text-[10.5px]">No forwards.</div>
              ) : (data.forwards || []).map((f, idx) => (
                <div key={idx} className="p-1 bg-[var(--secondary)] border border-[var(--good)]/10 text-[10px] rounded-none">
                  <div className="text-[var(--good)] font-bold mb-0.5">
                    <span>{f.from} ➔ {f.to}</span>
                  </div>
                  <div className="text-[var(--foreground)] line-clamp-3 hover:line-clamp-none transition-all cursor-pointer bg-[var(--secondary)] p-1 border border-[var(--border)] mt-0.5">
                    {f.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeSubTab === 'crosschecks' && (
            <div className="space-y-1">
              {(data.crosschecks || []).length === 0 ? (
                <div className="text-center text-[var(--muted-foreground)] py-4 italic text-[10.5px]">No cross-checks.</div>
              ) : (data.crosschecks || []).map((c, idx) => (
                <div key={idx} className="p-1 bg-[var(--secondary)] border border-[var(--chart-5)]/10 text-[10px] rounded-none">
                  <div className="flex justify-between text-[var(--chart-5)] font-bold mb-0.5">
                    <span>{c.from} ➔ {c.target}</span>
                  </div>
                  <div className="text-[var(--foreground)] italic">"{c.feedback}"</div>
                </div>
              ))}
            </div>
          )}

          {activeSubTab === 'facts' && (
            <div className="space-y-1">
              {(data.facts || []).length === 0 ? (
                <div className="text-center text-[var(--muted-foreground)] py-4 italic text-[10.5px]">No facts.</div>
              ) : (data.facts || []).map((f, idx) => (
                <div key={idx} className="p-1 bg-[var(--secondary)] border border-[var(--chart-3)]/10 text-[10px] rounded-none">
                  <div className="flex justify-between text-[var(--chart-3)] font-bold mb-0.5">
                    <span className="font-bold truncate">{f.label}</span>
                  </div>
                  <div className="text-[var(--foreground)]">{f.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SunburstNode {
  name: string;
  size?: number;
  children?: SunburstNode[];
}

interface NeuralPathSunburstProps {
  messages: Message[];
  thinking: Thinking[];
}

function NeuralPathSunburst({ messages, thinking }: NeuralPathSunburstProps) {
  const [hoveredNode, setHoveredNode] = useState<d3.HierarchyRectangularNode<SunburstNode> | null>(null);

  // 1. EXTRACT PATHS FROM TIMELINE
  const turnsList: string[][] = [];
  let currentTurnActors: string[] = [];

  const allEvents = [
    ...messages.map(m => ({
      role: m.role,
      agent: m.role === 'user' ? 'YOU' : (m.from || m.role),
      timestamp: typeof m.timestamp === 'object' ? (m.timestamp as Date).getTime() : m.timestamp
    })),
    ...thinking.map(t => ({
      role: "internal",
      agent: t.agent,
      timestamp: t.timestamp
    }))
  ].sort((a, b) => a.timestamp - b.timestamp);

  allEvents.forEach(evt => {
    const actor = evt.agent.toUpperCase();
    if (evt.role === 'user') {
      if (currentTurnActors.length > 0) {
        turnsList.push(currentTurnActors);
      }
      currentTurnActors = [actor];
    } else {
      if (currentTurnActors.length === 0 || currentTurnActors[currentTurnActors.length - 1] !== actor) {
        currentTurnActors.push(actor);
      }
    }
  });

  if (currentTurnActors.length > 0) {
    turnsList.push(currentTurnActors);
  }

  const pathCounts: Record<string, number> = {};
  turnsList.forEach(turn => {
    const pathStr = turn.join("-").toLowerCase();
    pathCounts[pathStr] = (pathCounts[pathStr] || 0) + 1;
  });

  const csvData: [string, number][] = Object.keys(pathCounts).length > 0
    ? Object.entries(pathCounts)
    : [
        ["you-moderator-architect-engineer-moderator", 10],
        ["you-moderator-engineer-moderator", 6],
        ["you-moderator-security-moderator", 4],
        ["you-moderator-architect-moderator", 3],
        ["you-moderator-security-architect-engineer-moderator", 2],
      ];

  const buildHierarchy = (csv: [string, number][]): SunburstNode => {
    const rootNode: SunburstNode = { name: "root", children: [] };
    for (let i = 0; i < csv.length; i++) {
      const sequence = csv[i][0];
      const size = csv[i][1];
      const parts = sequence.split("-");
      let currentNode = rootNode;
      for (let j = 0; j < parts.length; j++) {
        const children = currentNode.children || [];
        if (!currentNode.children) currentNode.children = children;
        const nodeName = parts[j];
        let childNode: SunburstNode | undefined;
        if (j + 1 < parts.length) {
          let foundChild = false;
          for (let k = 0; k < children.length; k++) {
            if (children[k].name === nodeName) {
              childNode = children[k];
              foundChild = true;
              break;
            }
          }
          if (!foundChild) {
            childNode = { name: nodeName, children: [] };
            children.push(childNode);
          }
          currentNode = childNode!;
        } else {
          childNode = { name: nodeName, size };
          children.push(childNode);
        }
      }
    }
    return rootNode;
  };

  const hierarchyData = buildHierarchy(csvData);

  const width = 450;
  const height = 430;
  const radius = Math.min(width, height) / 2 - 15;

  const actorColors: Record<string, string> = {
    "you": "var(--primary)",
    "user": "var(--primary)",
    "moderator": "var(--good)",
    "architect": "var(--chart-3)",
    "engineer": "var(--chart-5)",
    "security": "var(--accent)",
    "system": "var(--border)",
    "other": "#a173d1"
  };

  const getActorColor = (name: string) => {
    const norm = name.toLowerCase();
    return actorColors[norm] || "var(--chart-3)";
  };

  const root = d3.hierarchy<SunburstNode>(hierarchyData)
    .sum(d => d.size || 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  const partitionLayout = d3.partition<SunburstNode>()
    .size([2 * Math.PI, radius * radius]);

  const partitionRoot = partitionLayout(root);
  const nodes = partitionRoot.descendants().filter(d => {
    return d.depth > 0 && (d.x1 - d.x0 > 0.005);
  });

  const arcGenerator = d3.arc<d3.HierarchyRectangularNode<SunburstNode>>()
    .startAngle(d => d.x0)
    .endAngle(d => d.x1)
    .innerRadius(d => Math.sqrt(d.y0))
    .outerRadius(d => Math.sqrt(d.y1));

  const getAncestors = (node: d3.HierarchyRectangularNode<SunburstNode>) => {
    const pathList: d3.HierarchyRectangularNode<SunburstNode>[] = [];
    let current: d3.HierarchyRectangularNode<SunburstNode> | null = node;
    while (current && current.depth > 0) {
      pathList.unshift(current);
      current = current.parent;
    }
    return pathList;
  };

  const ancestors = hoveredNode ? getAncestors(hoveredNode) : [];

  const totalSize = root.value || 1;
  const hoveredValue = hoveredNode ? hoveredNode.value || 0 : 0;
  const percentage = hoveredNode ? ((100 * hoveredValue) / totalSize).toFixed(1) : "0.0";

  const breadcrumbW = 85;
  const breadcrumbH = 22;
  const breadcrumbSpacing = 3;
  const breadcrumbTip = 6;

  const getBreadcrumbPoints = (idx: number) => {
    const points = [];
    points.push("0,0");
    points.push(`${breadcrumbW},0`);
    points.push(`${breadcrumbW + breadcrumbTip},${breadcrumbH / 2}`);
    points.push(`${breadcrumbW},${breadcrumbH}`);
    points.push(`0,${breadcrumbH}`);
    if (idx > 0) {
      points.push(`${breadcrumbTip},${breadcrumbH / 2}`);
    }
    return points.join(" ");
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--background)] select-none relative p-3 font-mono">
      {/* Breadcrumbs Trail */}
      <div 
        className="flex-shrink-0 h-[32px] flex items-center border border-[var(--border)] bg-[var(--secondary)] px-2 rounded-none overflow-x-auto overflow-y-hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {ancestors.length === 0 ? (
          <div className="text-[9px] text-[var(--muted-foreground)] uppercase tracking-widest font-mono">
            // HOVER_OVER_ARC_TO_EXPLORE_ROUTING_FLOWS
          </div>
        ) : (
          <div className="flex items-center gap-[3px] py-1">
            {ancestors.map((node, idx) => {
              const name = node.data.name.toUpperCase();
              const color = getActorColor(node.data.name);
              return (
                <div key={idx} className="relative flex items-center shrink-0">
                  <svg width={breadcrumbW + breadcrumbTip} height={breadcrumbH}>
                    <polygon
                      points={getBreadcrumbPoints(idx)}
                      fill="var(--secondary)"
                      stroke={color}
                      strokeWidth="0.8"
                    />
                    <text
                      x={(breadcrumbW + breadcrumbTip) / 2}
                      y={breadcrumbH / 2}
                      dy="0.35em"
                      textAnchor="middle"
                      fill={color}
                      fontSize="7.5"
                      fontWeight="bold"
                      fontFamily="'Share Tech Mono', monospace"
                    >
                      {name}
                    </text>
                  </svg>
                </div>
              );
            })}
            
            <div 
              style={{
                background: "rgba(0, 229, 255, 0.1)",
                border: "1px solid var(--primary)",
                color: "var(--primary)",
                fontFamily: "'Share Tech Mono', monospace"
              }}
              className="px-2 py-0.5 text-[8px] font-bold rounded-none ml-2 uppercase shrink-0"
            >
              {percentage}% OF RUNS
            </div>
          </div>
        )}
      </div>

      {/* Main Chart Section */}
      <div className="flex-1 min-h-0 flex items-center justify-center relative">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="max-w-full max-h-full"
        >
          <g transform={`translate(${width / 2}, ${height / 2})`}>
            <circle r={radius} fill="none" stroke="var(--border)" strokeWidth="0.5" />
            
            {nodes.map((node, idx) => {
              const isHighlighted = hoveredNode ? ancestors.includes(node) : true;
              const fill = getActorColor(node.data.name);
              
              return (
                <path
                  key={idx}
                  d={arcGenerator(node) || ""}
                  fill={fill}
                  stroke="var(--background)"
                  strokeWidth="1.5"
                  opacity={isHighlighted ? 0.95 : 0.2}
                  style={{
                    cursor: "pointer",
                    transition: "opacity 0.25s, transform 0.2s",
                    filter: hoveredNode === node ? "none" : undefined
                  }}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                />
              );
            })}

            <circle r="55" fill="var(--background)" stroke="var(--border)" strokeWidth="1" />
            <circle r="51" fill="var(--card)" />
            
            {hoveredNode && (
              <circle 
                r="53" 
                fill="none" 
                stroke={getActorColor(hoveredNode.data.name)} 
                strokeWidth="1" 
                className="animate-pulse" 
              />
            )}
            
            <g transform="translate(0, 0)">
              {hoveredNode ? (
                <>
                  <text
                    y="-14"
                    textAnchor="middle"
                    fill={getActorColor(hoveredNode.data.name)}
                    fontSize="9.5"
                    fontWeight="bold"
                    fontFamily="'Share Tech Mono', monospace"
                    className="uppercase tracking-wider"
                  >
                    {hoveredNode.data.name}
                  </text>
                  <text
                    y="8"
                    textAnchor="middle"
                    fill="white"
                    fontSize="16"
                    fontWeight="bold"
                    fontFamily="'Share Tech Mono', monospace"
                  >
                    {percentage}%
                  </text>
                  <text
                    y="24"
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.4)"
                    fontSize="7"
                    fontFamily="var(--font-sans)"
                    className="uppercase tracking-wide"
                  >
                    {hoveredValue} {hoveredValue === 1 ? 'run' : 'runs'}
                  </text>
                </>
              ) : (
                <>
                  <text
                    y="-10"
                    textAnchor="middle"
                    fill="rgba(0, 229, 255, 0.4)"
                    fontSize="8.5"
                    fontWeight="bold"
                    fontFamily="'Share Tech Mono', monospace"
                    className="uppercase tracking-widest"
                  >
                    // NEURAL
                  </text>
                  <text
                    y="6"
                    textAnchor="middle"
                    fill="white"
                    fontSize="11"
                    fontWeight="bold"
                    fontFamily="'Share Tech Mono', monospace"
                    className="uppercase tracking-widest"
                  >
                    ROUTING
                  </text>
                  <text
                    y="22"
                    textAnchor="middle"
                    fill="var(--good)"
                    fontSize="7.5"
                    fontWeight="bold"
                    fontFamily="'Share Tech Mono', monospace"
                    className="uppercase tracking-wider"
                  >
                    TOTAL: {totalSize} {totalSize === 1 ? 'RUN' : 'RUNS'}
                  </text>
                </>
              )}
            </g>
          </g>
        </svg>

        <div 
          className="absolute bottom-2 left-2 p-2 rounded-none border border-[var(--border)] bg-[var(--background)] flex flex-col gap-1 text-[8px] font-mono"
          style={{ width: "90px" }}
        >
          <div className="text-[var(--primary)] font-bold mb-1">// ROSTER</div>
          {Object.entries(actorColors)
            .filter(([k]) => k !== 'system' && k !== 'other')
            .map(([actor, color]) => (
              <div key={actor} className="flex items-center gap-1.5">
                <span 
                  className="w-2 h-2 rounded-none inline-block shrink-0" 
                  style={{ backgroundColor: color, border: `1px solid ${color}` }}
                />
                <span className="text-[var(--foreground)] uppercase truncate">{actor}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

function AgentGraph({ messages, thinking }: { messages: Message[], thinking: Thinking[] }) {
  const [graphMode, setGraphMode] = useState<"topology" | "tree" | "sunburst">("topology");
  const [viewMode, setViewMode] = useState<"single" | "full">("single");
  const [activeTurnIdx, setActiveTurnIdx] = useState<number>(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [customNodePositions, setCustomNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

  const containerRef = useRef<SVGSVGElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);

  useEffect(() => {
    zoomRef.current = zoom;
    panRef.current = pan;
  }, [zoom, pan]);

  // ── 1. ZOOM TO CURSOR WHEEL LISTENER ──
  useEffect(() => {
    const svgEl = containerRef.current;
    if (!svgEl) return;

    const handleWheelZoom = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svgEl.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;

      const nextZoom = Math.min(Math.max(currentZoom * factor, 0.1), 8);

      const graphX = (localX - currentPan.x) / currentZoom;
      const graphY = (localY - currentPan.y) / currentZoom;

      setZoom(nextZoom);
      setPan({
        x: localX - graphX * nextZoom,
        y: localY - graphY * nextZoom
      });
    };

    svgEl.addEventListener("wheel", handleWheelZoom, { passive: false });
    return () => {
      svgEl.removeEventListener("wheel", handleWheelZoom);
    };
  }, []);

  // ── 2. PARSE TIMELINE / TURNS ──
  const turns: {
    id: number;
    userQuery: string;
    events: {
      id: string;
      role: string;
      agent: string;
      type: "message" | "thought";
      content: string;
      timestamp: number;
    }[];
  }[] = [];

  let currentTurnEvents: typeof turns[0]["events"] = [];
  let currentTurnQuery = "";
  let turnCounter = 0;

  const allEvents = [
    ...messages.map(m => ({
      id: m.id,
      role: m.role,
      agent: m.role === 'user' ? 'YOU' : (m.from || m.role),
      type: "message" as const,
      content: m.content,
      timestamp: typeof m.timestamp === 'object' ? (m.timestamp as Date).getTime() : m.timestamp,
      provider: m.provider,
      model: m.model
    })),
    ...thinking.map(t => ({
      id: t.id,
      role: "internal",
      agent: t.agent,
      type: "thought" as const,
      content: t.thought,
      timestamp: t.timestamp,
      provider: undefined,
      model: undefined
    }))
  ].sort((a, b) => a.timestamp - b.timestamp);

  allEvents.forEach(evt => {
    if (evt.role === 'user') {
      if (currentTurnEvents.length > 0) {
        turns.push({
          id: turnCounter++,
          userQuery: currentTurnQuery,
          events: currentTurnEvents
        });
      }
      currentTurnQuery = evt.content;
      currentTurnEvents = [evt];
    } else {
      currentTurnEvents.push(evt);
    }
  });

  if (currentTurnEvents.length > 0) {
    turns.push({
      id: turnCounter++,
      userQuery: currentTurnQuery,
      events: currentTurnEvents
    });
  }

  // Sync turn index to latest when turn length changes
  useEffect(() => {
    if (turns.length > 0) {
      setActiveTurnIdx(turns.length - 1);
    }
  }, [turns.length]);

  // Determine dynamic node positions for Quorum Topology Mode
  const activeAgents = new Set<string>();
  messages.forEach(m => {
    const roleLower = m.role.toLowerCase();
    if (!['user', 'moderator', 'system', 'internal', 'error', 'ai', 'whisper', 'moderator-whisper'].includes(roleLower)) {
      activeAgents.add(roleLower);
    }
    if (m.from) {
      const fromLower = m.from.toLowerCase();
      if (fromLower !== 'moderator' && fromLower !== 'system') activeAgents.add(fromLower);
    }
  });
  thinking.forEach(t => {
    if (t.agent) {
      const agentLower = t.agent.toLowerCase();
      if (agentLower !== 'moderator' && agentLower !== 'system') activeAgents.add(agentLower);
    }
  });

  // Default ones to ensure graph remains filled
  activeAgents.add("architect");
  activeAgents.add("engineer");
  activeAgents.add("security");

  const otherAgents = Array.from(activeAgents);
  const agentNodes = otherAgents.map((id, idx) => {
    const total = otherAgents.length;
    const angle = total === 1 ? Math.PI / 2 : (idx / (total - 1)) * Math.PI * 0.7 + Math.PI * 0.15;
    return {
      id,
      label: id.toUpperCase(),
      x: total === 1 ? 300 : 300 + 200 * Math.cos(angle + Math.PI / 2),
      y: total === 1 ? 360 : 320 + 100 * Math.sin(angle + Math.PI / 2),
      color: "var(--chart-3)",
      type: "agent"
    };
  });

  const topologyNodes = [
    { id: "user", label: "USER", x: 300, y: 60, color: "var(--primary)", type: "user" },
    { id: "athena", label: "ATHENA", x: 300, y: 190, color: "var(--good)", type: "moderator" },
    ...agentNodes
  ];

  // Compute edges based on actual message flow
  const edgeCounts: Record<string, number> = {};
  messages.forEach(m => {
    const fromLower = m.from?.toLowerCase() || m.role.toLowerCase();
    
    if (m.role === 'user') {
      edgeCounts["user->athena"] = (edgeCounts["user->athena"] || 0) + 1;
    } else if (m.role === 'moderator' || m.role === 'athena') {
      edgeCounts["athena->user"] = (edgeCounts["athena->user"] || 0) + 1;
    } else if ((m.role === 'moderator-whisper' || m.role === 'athena-whisper') && m.to) {
      const key = `athena->${m.to.toLowerCase()}`;
      edgeCounts[key] = (edgeCounts[key] || 0) + 1;
    } else if (m.role === 'agent-whisper' && m.from) {
      const from = m.from.toLowerCase();
      const crossCheckMatch = m.content.match(/cross-check feedback on\s+(\w+)/i);
      if (crossCheckMatch) {
        const to = crossCheckMatch[1].toLowerCase();
        const key = `${from}->${to}`;
        edgeCounts[key] = (edgeCounts[key] || 0) + 1;
      } else {
        const key = `${from}->athena`;
        edgeCounts[key] = (edgeCounts[key] || 0) + 1;
      }
    } else if (m.from && !['user', 'moderator', 'system', 'athena'].includes(m.from.toLowerCase())) {
      const key = `${m.from.toLowerCase()}->athena`;
      edgeCounts[key] = (edgeCounts[key] || 0) + 1;
    }
  });

  const topologyEdges: { from: string; to: string; label: string; count: number; type: string }[] = [];
  Object.entries(edgeCounts).forEach(([key, count]) => {
    const [from, to] = key.split("->");
    let type = "whisper";
    if (from === 'user') type = "input";
    else if (to === 'user') type = "output";
    else if (from === 'athena') type = "delegate";
    else if (from !== 'athena' && to !== 'athena') type = "crosscheck";
    
    topologyEdges.push({ from, to, label: `${count} msg`, count, type });
  });

  if (topologyEdges.length === 0) {
    topologyEdges.push({ from: "user", to: "athena", label: "0 msg", count: 0, type: "input" });
    topologyEdges.push({ from: "athena", to: "architect", label: "0 msg", count: 0, type: "delegate" });
    topologyEdges.push({ from: "athena", to: "engineer", label: "0 msg", count: 0, type: "delegate" });
    topologyEdges.push({ from: "athena", to: "security", label: "0 msg", count: 0, type: "delegate" });
    topologyEdges.push({ from: "architect", to: "athena", label: "0 msg", count: 0, type: "whisper" });
    topologyEdges.push({ from: "engineer", to: "athena", label: "0 msg", count: 0, type: "whisper" });
    topologyEdges.push({ from: "security", to: "athena", label: "0 msg", count: 0, type: "whisper" });
  }

  // ── 3. COGNITIVE TREE WATERFALL MODE ──
  const getXOffset = (agentName: string) => {
    const name = agentName.toLowerCase();
    if (name === 'you' || name === 'user') return 300;
    if (name === 'moderator' || name === 'athena') return 300;
    if (name === 'engineer') return 180;
    if (name === 'architect') return 420;
    if (name === 'security') return 240;
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return 120 + (Math.abs(hash) % 360);
  };

  const turnEvents = viewMode === "full" ? allEvents : (turns[activeTurnIdx]?.events || []);
  const treeNodes = turnEvents.map((evt, idx) => {
    const agent = evt.agent.toLowerCase();
    const x = getXOffset(evt.agent);
    const y = 60 + idx * 70;
    
    let color = "var(--primary)";
    if (agent === 'you' || agent === 'user') color = "var(--primary)";
    else if (agent === 'moderator' || agent === 'athena') color = "var(--good)";
    else if (agent === 'system') color = "var(--chart-5)";
    else color = "var(--chart-3)";

    return {
      id: evt.id,
      label: evt.agent.toUpperCase(),
      detail: evt.type === 'thought' ? 'THINKING' : 'MESSAGE',
      x,
      y,
      color,
      type: evt.type,
      evt
    };
  });

  const treeEdges: { from: string; to: string; type: string; label: string; count: number }[] = [];
  for (let idx = 0; idx < treeNodes.length - 1; idx++) {
    treeEdges.push({
      from: treeNodes[idx].id,
      to: treeNodes[idx + 1].id,
      type: treeNodes[idx + 1].type === 'thought' ? 'thought' : 'message',
      label: "",
      count: 0
    });
  }

  // Select active set
  const currentNodes = graphMode === "topology" ? topologyNodes : treeNodes;
  const currentEdges = graphMode === "topology" ? topologyEdges : treeEdges;

  // ── 4. DRAG / PAN HANDLERS (wheel zoom is in useEffect) ──
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as SVGElement).tagName === 'svg' || (e.target as SVGElement).id === 'grid-bg') {
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedNodeId) {
      const dx = e.movementX / zoom;
      const dy = e.movementY / zoom;
      setCustomNodePositions(prev => {
        const defaultNode = currentNodes.find(n => n.id === draggedNodeId);
        const currentPos = prev[draggedNodeId] || { x: defaultNode?.x || 300, y: defaultNode?.y || 200 };
        return {
          ...prev,
          [draggedNodeId]: {
            x: currentPos.x + dx,
            y: currentPos.y + dy
          }
        };
      });
    } else if (isDragging) {
      setPan({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggedNodeId(null);
  };

  const zoomIn = () => setZoom(prev => Math.min(prev * 1.25, 8));
  const zoomOut = () => setZoom(prev => Math.max(prev / 1.25, 0.1));
  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCustomNodePositions({});
    setSelectedNode(null);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--background)] select-none relative">
      {/* Mode Selectors */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-[var(--border)] bg-[var(--secondary)] px-2 py-1">
        <div className="flex gap-1.5 items-center">
          <button
            onClick={() => { setGraphMode("topology"); resetZoom(); }}
            style={{ fontFamily: "'Share Tech Mono', monospace" }}
            className={`px-2 py-0.5 border border-[var(--border)] rounded-none text-[8px] uppercase font-bold transition-all ${
              graphMode === "topology" ? 'bg-[var(--card)] text-[var(--primary)] border-[var(--primary)]' : 'text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
            }`}
          >
            [TOPOLOGY]
          </button>
          <button
            onClick={() => { setGraphMode("tree"); resetZoom(); }}
            style={{ fontFamily: "'Share Tech Mono', monospace" }}
            className={`px-2 py-0.5 border border-[var(--border)] rounded-none text-[8px] uppercase font-bold transition-all ${
              graphMode === "tree" ? 'bg-[var(--card)] text-[var(--primary)] border-[var(--primary)]' : 'text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
            }`}
          >
            [COGNITIVE TRACE]
          </button>
          <button
            onClick={() => { setGraphMode("sunburst"); resetZoom(); }}
            style={{ fontFamily: "'Share Tech Mono', monospace" }}
            className={`px-2 py-0.5 border border-[var(--border)] rounded-none text-[8px] uppercase font-bold transition-all ${
              graphMode === "sunburst" ? 'bg-[var(--card)] text-[var(--primary)] border-[var(--primary)]' : 'text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
            }`}
          >
            [PATH SUNBURST]
          </button>
        </div>
      </div>

      {/* Sub tabs for Cognitive Trace */}
      {graphMode === "tree" && (
        <div className="flex-shrink-0 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-3 py-1">
          <div className="flex gap-4">
            <button
              onClick={() => { setViewMode("single"); resetZoom(); }}
              className={`text-[9px] uppercase font-bold tracking-wider py-1 border-b-2 transition-all ${
                viewMode === "single"
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
              style={{ fontFamily: "'Share Tech Mono', monospace" }}
            >
              SINGLE TURN
            </button>
            <button
              onClick={() => { setViewMode("full"); resetZoom(); }}
              className={`text-[9px] uppercase font-bold tracking-wider py-1 border-b-2 transition-all ${
                viewMode === "full"
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
              style={{ fontFamily: "'Share Tech Mono', monospace" }}
            >
              FULL SESSION
            </button>
          </div>

          {viewMode === "single" && turns.length > 0 && (
            <div className="flex items-center gap-2 text-[9px] font-mono text-[var(--muted-foreground)]">
              <button
                onClick={() => setActiveTurnIdx(prev => Math.max(prev - 1, 0))}
                disabled={activeTurnIdx === 0}
                className="px-1.5 py-0.5 border border-[var(--border)] rounded-none disabled:opacity-20 hover:text-[var(--primary)] hover:border-[var(--primary)]/50 transition-colors"
              >
                &lt;
              </button>
              <span>
                TURN {activeTurnIdx + 1} / {turns.length}
              </span>
              <button
                onClick={() => setActiveTurnIdx(prev => Math.min(prev + 1, turns.length - 1))}
                disabled={activeTurnIdx === turns.length - 1}
                className="px-1.5 py-0.5 border border-[var(--border)] rounded-none disabled:opacity-20 hover:text-[var(--primary)] hover:border-[var(--primary)]/50 transition-colors"
              >
                &gt;
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Canvas Controls */}
      {graphMode !== "sunburst" && (
        <div className="absolute right-2 top-10 flex flex-col gap-1.5 z-10 opacity-30 hover:opacity-100 transition-opacity">
          <button onClick={zoomIn} title="Zoom In" className="w-5 h-5 bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] hover:text-[var(--primary)] flex items-center justify-center text-[11px] rounded-none font-mono">+</button>
          <button onClick={zoomOut} title="Zoom Out" className="w-5 h-5 bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] hover:text-[var(--primary)] flex items-center justify-center text-[11px] rounded-none font-mono">-</button>
          <button onClick={resetZoom} title="Reset Canvas" className="w-5 h-5 bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] hover:text-[var(--primary)] flex items-center justify-center text-[9px] rounded-none font-mono">↺</button>
        </div>
      )}

      {/* SVG Canvas */}
      <div className="flex-1 min-h-0 relative bg-[var(--card)] overflow-hidden">
        {graphMode === "sunburst" ? (
          <NeuralPathSunburst messages={messages} thinking={thinking} />
        ) : currentNodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--muted-foreground)] text-[10px]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            // NO_ACTIVE_SESSION_DATA
          </div>
        ) : (
          <svg
            ref={containerRef}
            width="100%"
            height="100%"
            viewBox="0 0 600 500"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isDragging ? 'grabbing' : draggedNodeId ? 'grabbing' : 'grab' }}
          >
            <defs>
              <pattern id="canvas-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--border)" strokeWidth="0.5" />
              </pattern>
              <marker id="arrow-cyan" markerWidth="8" markerHeight="6" refX="40" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--primary)" />
              </marker>
              <marker id="arrow-green" markerWidth="8" markerHeight="6" refX="40" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--good)" />
              </marker>
              <marker id="arrow-yellow" markerWidth="8" markerHeight="6" refX="40" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--chart-3)" />
              </marker>
              <marker id="arrow-purple" markerWidth="8" markerHeight="6" refX="40" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--chart-5)" />
              </marker>
              <marker id="arrow-tree" markerWidth="6" markerHeight="4" refX="32" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="rgba(0, 229, 255, 0.4)" />
              </marker>
              <marker id="arrow-tree-dashed" markerWidth="6" markerHeight="4" refX="32" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="rgba(182, 36, 255, 0.4)" />
              </marker>
            </defs>

            {/* Grid Background */}
            <rect id="grid-bg" width="100%" height="100%" fill="url(#canvas-grid)" />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* 1. DRAW EDGES */}
              {currentEdges.map((edge, i) => {
                const fromNode = currentNodes.find(n => n.id === edge.from);
                const toNode = currentNodes.find(n => n.id === edge.to);
                if (!fromNode || !toNode) return null;

                const fromPos = customNodePositions[edge.from] || { x: fromNode.x, y: fromNode.y };
                const toPos = customNodePositions[edge.to] || { x: toNode.x, y: toNode.y };

                let strokeColor = "rgba(255,255,255,0.08)";
                let markerId = "arrow-tree";
                let dashArray: string | undefined = undefined;

                if (graphMode === "topology") {
                  if (edge.count > 0) {
                    if (edge.type === 'input') { strokeColor = "var(--primary)"; markerId = "arrow-cyan"; }
                    else if (edge.type === 'delegate') { strokeColor = "var(--good)"; markerId = "arrow-green"; dashArray = "3,3"; }
                    else if (edge.type === 'whisper') { strokeColor = "var(--primary)"; markerId = "arrow-cyan"; }
                    else if (edge.type === 'crosscheck') { strokeColor = "var(--chart-5)"; markerId = "arrow-purple"; dashArray = "1,1"; }
                    else if (edge.type === 'output') { strokeColor = "var(--primary)"; markerId = "arrow-cyan"; }
                  }
                } else {
                  // Tree Waterfall mode
                  strokeColor = edge.type === 'thought' ? "rgba(182, 36, 255, 0.45)" : "rgba(0, 229, 255, 0.4)";
                  if (edge.type === 'thought') {
                    dashArray = "2,2";
                    markerId = "arrow-tree-dashed";
                  }
                }

                // Curving path for crosschecks to prevent overlaps
                const dx = toPos.x - fromPos.x;
                const dy = toPos.y - fromPos.y;
                const isCross = graphMode === "topology" && edge.type === 'crosscheck';
                let pathData = `M ${fromPos.x} ${fromPos.y} L ${toPos.x} ${toPos.y}`;
                
                if (isCross) {
                  const cx = (fromPos.x + toPos.x) / 2 - dy * 0.15;
                  const cy = (fromPos.y + toPos.y) / 2 + dx * 0.15;
                  pathData = `M ${fromPos.x} ${fromPos.y} Q ${cx} ${cy} ${toPos.x} ${toPos.y}`;
                }

                const strokeWidth = graphMode === "topology" && edge.count > 0 ? Math.min(0.5 + edge.count * 0.5, 3) : 0.8;

                return (
                  <g key={`edge-${i}`} style={{ opacity: graphMode === "topology" && edge.count === 0 ? 0.3 : 1 }}>
                    <path
                      d={pathData}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={dashArray}
                      markerEnd={`url(#${markerId})`}
                    />
                    {graphMode === "topology" && edge.count > 0 && (
                      <g transform={`translate(${(fromPos.x + toPos.x) / 2}, ${(fromPos.y + toPos.y) / 2})`}>
                        <rect x="-16" y="-6" width="32" height="12" fill="var(--secondary)" stroke={strokeColor} strokeWidth="0.5" rx="2" />
                        <text y="2.5" textAnchor="middle" fill={strokeColor} fontSize="7" fontWeight="bold" fontFamily="'Share Tech Mono', monospace">
                          {edge.count}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* 2. DRAW NODES */}
              {currentNodes.map(node => {
                const pos = customNodePositions[node.id] || { x: node.x, y: node.y };
                const isTopology = graphMode === "topology";
                
                // Find last message provider/model for this agent
                const lastMsg = isTopology ? [...messages].reverse().find(m => 
                  (m.from?.toLowerCase() === node.id.toLowerCase() || m.role?.toLowerCase() === node.id.toLowerCase()) &&
                  m.provider
                ) : null;
                const activeChainLink = lastMsg ? `${lastMsg.provider}:${lastMsg.model}` : null;

                const w = isTopology ? (activeChainLink ? 96 : 84) : 110;
                const h = isTopology ? (activeChainLink ? 36 : 24) : 32;

                // For tree node text preview extraction
                const nodeEvt = (node as any).evt;
                const isThought = (node as any).type === "thought";
                const cleanContent = nodeEvt?.content ? nodeEvt.content.replace(/\s+/g, ' ') : '';
                const previewText = cleanContent ? cleanContent.substring(0, 18) + (cleanContent.length > 18 ? '...' : '') : '';

                return (
                  <g
                    key={`node-${node.id}`}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggedNodeId(node.id);
                    }}
                    onClick={() => {
                      if (graphMode === "tree" && nodeEvt) {
                        setSelectedNode(nodeEvt);
                      } else if (graphMode === "topology") {
                        const nodeId = node.id;
                        const agentMessages = messages.filter(m => {
                          const from = m.from?.toLowerCase() || m.role.toLowerCase();
                          return from === nodeId;
                        });
                        const agentThoughts = thinking.filter(t => t.agent?.toLowerCase() === nodeId);
                        
                        setSelectedNode({
                          id: nodeId,
                          agent: node.label,
                          type: "agent_summary",
                          timestamp: Date.now(),
                          content: `AGENT INTEGRATION REPORT: ${node.label}\n\n` +
                            `Active Role: ${nodeId.toUpperCase()}\n` +
                            `Messages Relayed: ${agentMessages.length}\n` +
                            `Cognitive Tasks: ${agentThoughts.length}\n\n` +
                            `--- CHRONOLOGICAL ACTIVITY LOG ---\n\n` +
                            [
                              ...agentMessages.map(m => `[MESSAGE] ${new Date(typeof m.timestamp === 'object' ? (m.timestamp as Date).getTime() : m.timestamp).toLocaleTimeString()}:\n${m.content}`),
                              ...agentThoughts.map(t => `[THINKING] ${new Date(t.timestamp).toLocaleTimeString()}:\n${t.thought}`)
                            ].join("\n\n")
                        });
                      }
                    }}
                    style={{ cursor: draggedNodeId === node.id ? 'grabbing' : 'grab' }}
                  >
                    <rect
                      x={-w / 2}
                      y={-h / 2}
                      width={w}
                      height={h}
                      fill={isThought ? "rgba(182, 36, 255, 0.08)" : "var(--secondary)"}
                      stroke={node.color}
                      strokeWidth={draggedNodeId === node.id ? 1.5 : 0.8}
                      strokeDasharray={isThought ? "3,3" : undefined}
                      rx={3}
                      style={{
                        filter: draggedNodeId === node.id ? "none" : undefined,
                        transition: 'stroke 0.2s, filter 0.2s'
                      }}
                    />
                    
                    {/* Node text content */}
                    {isTopology ? (
                      <>
                        <text
                          y={activeChainLink ? "-3" : "3"}
                          textAnchor="middle"
                          fill={node.color}
                          fontSize="9"
                          fontWeight="bold"
                          fontFamily="'Share Tech Mono', monospace"
                        >
                          {node.label}
                        </text>
                        {activeChainLink && (
                          <text
                            y="8"
                            textAnchor="middle"
                            fill="rgba(255, 255, 255, 0.45)"
                            fontSize="6"
                            fontFamily="'Share Tech Mono', monospace"
                          >
                            {activeChainLink}
                          </text>
                        )}
                      </>
                    ) : (
                      <>
                        <text
                          y="-3"
                          textAnchor="middle"
                          fill={node.color}
                          fontSize="8.5"
                          fontWeight="bold"
                          fontFamily="'Share Tech Mono', monospace"
                        >
                          {node.label}
                        </text>
                        <text
                          y="8"
                          textAnchor="middle"
                          fill={isThought ? "rgba(182, 36, 255, 0.7)" : "rgba(255,255,255,0.45)"}
                          fontSize="6.5"
                          fontFamily="var(--font-sans)"
                        >
                          {nodeEvt?.provider ? `[${nodeEvt.provider}:${nodeEvt.model}] ${previewText}` : previewText}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>

      {/* Interactive Turn Details Footer for Tree Mode */}
      {graphMode === "tree" && (
        <div className="flex-shrink-0 h-[100px] border-t border-[var(--border)] bg-[var(--background)] p-2 text-[10px] font-mono overflow-y-auto">
          <div className="text-[var(--primary)] font-bold mb-1">
            {viewMode === "full" ? "// FULL_SESSION_TRACE" : "// ACTIVE_TURN_QUERY"}
          </div>
          <div className="text-[var(--foreground)] italic p-1 bg-[var(--secondary)] border border-[var(--border)] mb-1 select-text">
            {viewMode === "full" 
              ? `Displaying entire session sequence containing ${allEvents.length} events across ${turns.length} turns.`
              : `"${turns[activeTurnIdx]?.userQuery || ''}"`}
          </div>
          <div className="text-[8px] text-[var(--muted-foreground)]">
            Click any node in the tree flow map above to inspect the full contents of that reasoning stage.
          </div>
        </div>
      )}

      {/* Inspector Modal Overlay */}
      {selectedNode && (
        <div className="absolute inset-0 bg-[var(--background)]/90 flex items-center justify-center p-3 z-50">
          <div
            style={{
              background: "var(--background)",
              border: "1px solid var(--primary)",
              fontFamily: "var(--font-sans)",
              borderRadius: "4px"
            }}
            className="w-full max-w-md p-4 flex flex-col max-h-[85%] select-text"
          >
            <div style={{ fontFamily: "'Share Tech Mono', monospace" }} className="flex justify-between items-center border-b border-[var(--border)] pb-1.5 mb-2">
              <span className="text-[var(--primary)] uppercase text-[10px] font-bold tracking-wider">
                // INSPECT: {selectedNode.agent}
              </span>
              <span className="text-[8px] text-[var(--muted-foreground)] opacity-60">
                {selectedNode.type.toUpperCase()} · {new Date(selectedNode.timestamp).toLocaleTimeString()}
              </span>
            </div>
            
            <div
              className="flex-1 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap pr-1 bg-[var(--secondary)] border border-[var(--border)] p-2"
              style={{ maxHeight: "300px", scrollbarWidth: "thin", fontFamily: "var(--font-sans)", scrollbarColor: 'var(--primary) transparent' }}
            >
              {selectedNode.content}
            </div>

            <div className="flex justify-end mt-3">
              <button
                onClick={() => setSelectedNode(null)}
                style={{
                background: "var(--card)",
                border: "1px solid var(--primary)",
                color: "var(--primary)",
                fontFamily: "'Share Tech Mono', monospace",
              }}
                className="px-3 py-1 text-[10px] hover:bg-[var(--primary)] hover:text-[var(--background)] transition-colors"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  formatRunDuration,
  getRunTiming,
  type AgentRunDisplayState,
} from "../services/agentRunSupervision";
import { Thinking } from "../App";

interface AgentStallDialogProps {
  agents: Record<string, AgentRunDisplayState>;
  thinking?: Thinking[];
  onDecision: (runId: string, decision: "kill" | "wait") => Promise<void>;
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function isTerminalRunStatus(status?: string): boolean {
  if (!status) return false;
  return /(^|[\s:-])(complete|completed|done|error|failed|failure|killed|cancelled|canceled|terminated)([\s:-]|$)/i.test(status);
}

export function AgentStallDialog({ agents, thinking = [], onDecision }: AgentStallDialogProps) {
  const [now, setNow] = useState(Date.now());
  const [candidate, setCandidate] = useState<{
    agentName: string;
    runId: string;
    lastActivityAt: number;
  } | null>(null);
  const promptedActivityRef = useRef<Record<string, number>>({});
  const checkingStallRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (candidate) {
      const active = agents[candidate.agentName];
      if (
        !active
        || active.runId !== candidate.runId
        || active.lastActivityAt !== candidate.lastActivityAt
        || isTerminalRunStatus(active.status)
      ) {
        setCandidate(null);
      }
      return;
    }

    async function evaluateStall() {
      for (const [agentName, state] of Object.entries(agents)) {
        if (!state.runId || !state.lastActivityAt) continue;
        if (isTerminalRunStatus(state.status)) continue;
        const timing = getRunTiming(state, now);
        if (
          timing.idleMs >= timing.stallWarningMs
          && promptedActivityRef.current[state.runId] !== state.lastActivityAt
        ) {
          // Skip if already checking this run activity
          const checkKey = `${state.runId}-${state.lastActivityAt}`;
          if (checkingStallRef.current[checkKey]) continue;
          checkingStallRef.current[checkKey] = true;

          // Retrieve last 2 thoughts for this agent
          const agentThoughts = thinking
            .filter(t => t.agent.toLowerCase() === agentName.toLowerCase() && t.thought)
            .slice(0, 2);

          if (agentThoughts.length >= 2) {
            try {
              const t1 = agentThoughts[0].thought;
              const t2 = agentThoughts[1].thought;
              
              const embed1 = await window.system.getEmbeddings(t1);
              const embed2 = await window.system.getEmbeddings(t2);
              
              if (embed1.length > 0 && embed2.length > 0) {
                const sim = cosineSimilarity(embed1, embed2);
                if (sim < 0.85) {
                  // Thoughts are sufficiently different; auto-extend the idle timer
                  console.log(`[StallSupervision] Automatically extending run for ${agentName} (Thought Similarity: ${sim.toFixed(2)})`);
                  await onDecision(state.runId, "wait");
                  delete checkingStallRef.current[checkKey];
                  return;
                }
              }
            } catch (err) {
              console.error("Failed to check semantic stall similarity:", err);
            }
          }

          promptedActivityRef.current[state.runId] = state.lastActivityAt;
          setCandidate({ agentName, runId: state.runId, lastActivityAt: state.lastActivityAt });
          delete checkingStallRef.current[checkKey];
          break;
        }
      }
    }

    evaluateStall();
  }, [agents, candidate, now, thinking, onDecision]);

  const activeState = candidate ? agents[candidate.agentName] : undefined;
  const timing = activeState ? getRunTiming(activeState, now) : null;

  return (
    <AlertDialog.Root open={Boolean(candidate)} onOpenChange={(open) => !open && setCandidate(null)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className="fixed inset-0 z-[200]"
          style={{ background: "rgba(2, 5, 10, 0.82)" }}
        />
        <AlertDialog.Content
          className="fixed left-1/2 top-1/2 z-[201] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 p-5"
          style={{
            background: "var(--card)",
            border: "1px solid var(--warning)",
            boxShadow: "0 0 24px rgba(255,230,0,0.12)",
          }}
        >
          <AlertDialog.Title
            className="text-sm font-bold tracking-wider"
            style={{ color: "var(--warning)", fontFamily: "'Share Tech Mono', monospace" }}
          >
            ATHENA // POSSIBLE STALLED RUN
          </AlertDialog.Title>
          <AlertDialog.Description
            className="mt-3 text-sm leading-relaxed"
            style={{ color: "var(--foreground)" }}
          >
            {candidate?.agentName} has produced no new model, MCP, Splunk, tool, or output activity for{" "}
            {formatRunDuration(timing?.idleMs || 0)}. The run may be stuck. Kill it, or keep waiting and reset
            the idle timer?
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                className="px-3 py-2 text-xs"
                style={{ border: "1px solid var(--primary)", color: "var(--primary)" }}
                onClick={() => candidate && onDecision(candidate.runId, "wait")}
              >
                NO — KEEP WAITING
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                className="px-3 py-2 text-xs font-bold"
                style={{ background: "var(--destructive)", color: "var(--destructive-foreground)" }}
                onClick={() => candidate && onDecision(candidate.runId, "kill")}
              >
                YES — KILL RUN
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

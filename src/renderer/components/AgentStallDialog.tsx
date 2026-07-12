import { useEffect, useRef, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  formatRunDuration,
  getRunTiming,
  type AgentRunDisplayState,
} from "../services/agentRunSupervision";

interface AgentStallDialogProps {
  agents: Record<string, AgentRunDisplayState>;
  onDecision: (runId: string, decision: "kill" | "wait") => Promise<void>;
}

export function AgentStallDialog({ agents, onDecision }: AgentStallDialogProps) {
  const [now, setNow] = useState(Date.now());
  const [candidate, setCandidate] = useState<{
    agentName: string;
    runId: string;
    lastActivityAt: number;
  } | null>(null);
  const promptedActivityRef = useRef<Record<string, number>>({});

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
      ) {
        setCandidate(null);
      }
      return;
    }

    for (const [agentName, state] of Object.entries(agents)) {
      if (!state.runId || !state.lastActivityAt) continue;
      const timing = getRunTiming(state, now);
      if (
        timing.idleMs >= timing.stallWarningMs
        && promptedActivityRef.current[state.runId] !== state.lastActivityAt
      ) {
        promptedActivityRef.current[state.runId] = state.lastActivityAt;
        setCandidate({ agentName, runId: state.runId, lastActivityAt: state.lastActivityAt });
        break;
      }
    }
  }, [agents, candidate, now]);

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

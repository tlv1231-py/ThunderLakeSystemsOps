"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ActivityEntry } from "@/lib/income/types";

type TermLine = {
  id: string;
  ts: string;
  prefix: string;
  text: string;
  color: string;
};

const ACTION_LABELS: Record<string, string> = {
  agent_pr_opened:       "PR_OPENED ",
  agent_error:           "AGENT_ERR ",
  agent_no_changes:      "NO_CHANGE ",
  agent_skip:            "SKIP______",
  discovery_run:         "DISCOVERY ",
  opportunity_queued:    "QUEUED____",
  opportunity_dismissed: "DISMISSED ",
  active_mode:           "ACTIVE_MOD",
  approval_approved:     "APPROVED_ ",
  earning_logged:        "EARN_LOG_ ",
  discover:              "DISCOVERY ",
};

function toTermLine(entry: ActivityEntry): TermLine {
  const ts = new Date(entry.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  const engine = (entry.engine ?? "SYS").toUpperCase().slice(0, 6).padEnd(6);

  let color = "text-[#00cc33]";
  if (entry.status === "error")                        color = "text-[#ff0040]";
  else if (entry.status === "warning")                 color = "text-[#ffb800]";
  else if (entry.action === "agent_pr_opened")         color = "text-[#00ff41]";
  else if (entry.action?.startsWith("discover"))       color = "text-[#00e5ff]";
  else if (entry.action === "active_mode")             color = "text-[#ffb800]";
  else if (entry.action === "opportunity_queued")      color = "text-[#00e5ff]";

  const actionLabel = ACTION_LABELS[entry.action] ?? entry.action.toUpperCase().slice(0, 10).padEnd(10);
  const prefix = `[${engine}] ${actionLabel}`;
  const text = entry.detail ?? entry.action ?? "";

  return { id: entry.id, ts, prefix, text, color };
}

interface Props {
  initialEntries: ActivityEntry[];
}

export function IncomeTerminalFeed({ initialEntries }: Props) {
  const [lines, setLines] = useState<TermLine[]>(() =>
    [...initialEntries].reverse().slice(0, 80).map(toTermLine)
  );
  const [connected, setConnected] = useState(false);
  const [blink, setBlink] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  useEffect(() => {
    const t = setInterval(() => setBlink(b => !b), 530);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const channel = (supabase as any)
      .channel("income_terminal_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "income_activity_log" },
        (payload: any) => {
          setLines(prev => [...prev.slice(-99), toTermLine(payload.new as ActivityEntry)]);
        }
      )
      .subscribe((status: string) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="flex flex-col h-full bg-black border border-[#00ff41]/20 font-mono overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#00ff41]/20 bg-[#030603] shrink-0">
        <span className="text-[9px] text-[#007a1f] uppercase tracking-[0.2em]">SYS::ACTIVITY_FEED</span>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? "bg-[#00ff41]" : "bg-[#ff0040]"}`} />
          <span className={`text-[9px] uppercase tracking-widest ${connected ? "text-[#00ff41]" : "text-[#ff0040]"}`}>
            {connected ? "LIVE" : "CONN..."}
          </span>
        </div>
      </div>

      {/* Feed body */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-px min-h-0">
        {lines.length === 0 && (
          <div className="text-[#004d14] text-[11px] py-4">&gt; Awaiting system events…</div>
        )}
        {lines.map(line => (
          <div key={line.id} className="flex gap-2 text-[10px] leading-[1.6]">
            <span className="text-[#2a4d2a] shrink-0 tabular-nums w-[52px]">{line.ts}</span>
            <span className={`shrink-0 font-semibold ${line.color}`}>{line.prefix}</span>
            <span className="text-[#008f21] truncate">{line.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Prompt */}
      <div className="px-3 py-1 border-t border-[#00ff41]/20 bg-[#030603] shrink-0">
        <span className="text-[11px] text-[#00ff41]">&gt;_{blink ? "█" : " "}</span>
      </div>
    </div>
  );
}

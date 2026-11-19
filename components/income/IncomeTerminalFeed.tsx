"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ActivityEntry } from "@/lib/income/types";

const SCAN_INTERVAL_MS = 15 * 60 * 1000; // 15 min

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
  if (entry.status === "error")                  color = "text-[#ff0040]";
  else if (entry.status === "warning")           color = "text-[#ffb800]";
  else if (entry.action === "agent_pr_opened")   color = "text-[#00ff41]";
  else if (entry.action?.startsWith("discover")) color = "text-[#00e5ff]";
  else if (entry.action === "active_mode")       color = "text-[#ffb800]";
  else if (entry.action === "opportunity_queued") color = "text-[#00e5ff]";

  const actionLabel = ACTION_LABELS[entry.action] ?? entry.action.toUpperCase().slice(0, 10).padEnd(10);
  const text = entry.detail ?? entry.action ?? "";
  return { id: entry.id, ts, prefix: `[${engine}] ${actionLabel}`, text, color };
}

function isDiscoveryEntry(entry: ActivityEntry) {
  return entry.action === "discovery_run" || entry.action === "discover";
}

interface Props {
  initialEntries: ActivityEntry[];
  lastDiscoveryRun: string | null;
}

export function IncomeTerminalFeed({ initialEntries, lastDiscoveryRun }: Props) {
  const [lines, setLines] = useState<TermLine[]>(() =>
    [...initialEntries].reverse().slice(0, 80).map(toTermLine)
  );
  const [connected, setConnected] = useState(false);
  const [blink, setBlink] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  // Track last scan time — updated live when a discovery event arrives
  const [lastScan, setLastScan] = useState<number | null>(() =>
    lastDiscoveryRun ? new Date(lastDiscoveryRun).getTime() : null
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new lines
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  // Tick every second for the countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Blinking cursor
  useEffect(() => {
    const t = setInterval(() => setBlink(b => !b), 530);
    return () => clearInterval(t);
  }, []);

  // Supabase realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = (supabase as any)
      .channel("income_terminal_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "income_activity_log" },
        (payload: any) => {
          const entry = payload.new as ActivityEntry;
          setLines(prev => [...prev.slice(-99), toTermLine(entry)]);
          if (isDiscoveryEntry(entry)) {
            setLastScan(new Date(entry.created_at).getTime());
          }
        }
      )
      .subscribe((status: string) => setConnected(status === "SUBSCRIBED"));

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Countdown display
  const { label: countdownLabel, overdue } = (() => {
    if (!lastScan) return { label: "NEVER_SCANNED", overdue: true };
    const remaining = lastScan + SCAN_INTERVAL_MS - now;
    if (remaining <= 0) {
      const overdueSecs = Math.floor(Math.abs(remaining) / 1000);
      const m = Math.floor(overdueSecs / 60);
      const s = overdueSecs % 60;
      return { label: `+${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")} OVERDUE`, overdue: true };
    }
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    return { label: `NEXT: ${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`, overdue: false };
  })();

  return (
    <div className="flex flex-col h-full bg-black border border-[#00ff41]/20 font-mono overflow-hidden">
      {/* Header row 1: title + live status */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#00ff41]/10 bg-[#030603] shrink-0">
        <span className="text-[9px] text-[#007a1f] uppercase tracking-[0.2em]">SYS::ACTIVITY_FEED</span>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? "bg-[#00ff41]" : "bg-[#ff0040]"}`} />
          <span className={`text-[9px] uppercase tracking-widest ${connected ? "text-[#00ff41]" : "text-[#ff0040]"}`}>
            {connected ? "LIVE" : "CONN..."}
          </span>
        </div>
      </div>

      {/* Header row 2: countdown */}
      <div className={`px-3 py-1.5 border-b border-[#00ff41]/20 bg-[#030603] shrink-0 flex items-center justify-between`}>
        <span className="text-[9px] text-[#004d14] uppercase tracking-widest">DISCOVERY_CYCLE · 15:00</span>
        <span className={`text-[11px] font-bold tabular-nums tracking-widest ${
          overdue ? "text-[#ffb800] animate-pulse" : "text-[#00ff41]"
        }`}>
          {countdownLabel}
        </span>
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

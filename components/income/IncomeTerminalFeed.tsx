"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ActivityEntry } from "@/lib/income/types";

type TermLine = {
  id: string;
  ts: string;
  tsSortKey: number;
  prefix: string;
  text: string;
  color: string;
};

const ACTION_LABELS: Record<string, string> = {
  scan_start:            "SCAN_INIT ",
  scan_source:           "SCAN_SRC  ",
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
  pr_merged:             "██ MERGED ",
  pr_closed:             "PR_CLOSED ",
  pr_check_run:          "PR_CHECK  ",
};

function toTermLine(entry: ActivityEntry): TermLine {
  const ts = new Date(entry.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const engine = (entry.engine ?? "SYS").toUpperCase().slice(0, 6).padEnd(6);

  let color = "text-[#00cc33]";
  if (entry.action === "pr_merged")              color = "text-[#00ff41]";
  else if (entry.status === "error")             color = "text-[#ff0040]";
  else if (entry.status === "warning")           color = "text-[#ffb800]";
  else if (entry.action === "agent_pr_opened")   color = "text-[#00ff41]";
  else if (entry.action === "scan_start")        color = "text-[#00e5ff]";
  else if (entry.action === "scan_source")       color = "text-[#00e5ff]";
  else if (entry.action?.startsWith("discover")) color = "text-[#00e5ff]";
  else if (entry.action === "active_mode")       color = "text-[#ffb800]";
  else if (entry.action === "opportunity_queued") color = "text-[#00e5ff]";

  const actionLabel = ACTION_LABELS[entry.action] ?? entry.action.toUpperCase().slice(0, 10).padEnd(10);
  const text = entry.detail ?? entry.action ?? "";
  return { id: entry.id, ts, tsSortKey: new Date(entry.created_at).getTime(), prefix: `[${engine}] ${actionLabel}`, text, color };
}

interface Props {
  initialEntries: ActivityEntry[];
  lastDiscoveryRun: string | null;
  userId: string;
}

export function IncomeTerminalFeed({ initialEntries, lastDiscoveryRun, userId }: Props) {
  const [lines, setLines] = useState<TermLine[]>(() => {
    // Deduplicate by id, keep most recent 80, ascending order
    const seen = new Set<string>();
    const deduped: ActivityEntry[] = [];
    for (const e of initialEntries) {
      if (!seen.has(e.id)) { seen.add(e.id); deduped.push(e); }
    }
    return deduped.slice(0, 80).reverse().map(toTermLine);
  });
  const [connected, setConnected] = useState(false);
  const [blink, setBlink] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  // Typewriter animation state
  const [typingState, setTypingState] = useState<{ entry: TermLine; pos: number } | null>(null);
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingQueueRef = useRef<TermLine[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Last scan timestamp
  const [lastScanTs, setLastScanTs] = useState<number | null>(() => {
    if (lastDiscoveryRun) return new Date(lastDiscoveryRun).getTime();
    const e = initialEntries.find(e => e.action === "discovery_run" || e.action === "scan_start");
    return e ? new Date(e.created_at).getTime() : null;
  });

  // Auto-scroll to bottom on new lines or typing
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, typingState]);

  // Tick every second for the countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Blinking cursor (only when not typing)
  useEffect(() => {
    const t = setInterval(() => setBlink(b => !b), 530);
    return () => clearInterval(t);
  }, []);

  // Typewriter engine
  function flushEntry(entry: TermLine) {
    setLines(prev => {
      const next = [...prev.slice(-99), entry];
      next.sort((a, b) => a.tsSortKey - b.tsSortKey);
      return next;
    });
  }

  function startTyping(entry: TermLine) {
    if (typingRef.current) {
      clearInterval(typingRef.current);
      typingRef.current = null;
    }

    const fullLen = entry.text.length;
    if (fullLen === 0) { flushEntry(entry); return; }

    let pos = 0;
    setTypingState({ entry, pos });

    typingRef.current = setInterval(() => {
      pos += 3; // 3 chars per tick at 18ms = fast typewriter
      if (pos >= fullLen) {
        clearInterval(typingRef.current!);
        typingRef.current = null;
        setTypingState(null);
        flushEntry(entry);
        // Process next queued entry
        const next = typingQueueRef.current.shift();
        if (next) startTyping(next);
      } else {
        setTypingState({ entry, pos });
      }
    }, 18);
  }

  function enqueueTyping(entry: TermLine) {
    if (typingRef.current !== null) {
      typingQueueRef.current.push(entry);
    } else {
      startTyping(entry);
    }
  }

  // Cleanup typing on unmount
  useEffect(() => {
    return () => { if (typingRef.current) clearInterval(typingRef.current); };
  }, []);

  // Supabase realtime + 10s poll fallback
  useEffect(() => {
    const supabase = createClient();
    const seenIds = new Set(lines.map(l => l.id));

    const channel = (supabase as any)
      .channel(`income_terminal_feed_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "income_activity_log",
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const entry = payload.new as ActivityEntry;
          if (seenIds.has(entry.id)) return;
          seenIds.add(entry.id);
          if (entry.action === "discovery_run" || entry.action === "scan_start") {
            setLastScanTs(new Date(entry.created_at).getTime());
          }
          enqueueTyping(toTermLine(entry));
        }
      )
      .subscribe((status: string) => setConnected(status === "SUBSCRIBED"));

    // Poll every 10s so scans always surface even if Realtime misses them
    async function poll() {
      const { data } = await (supabase as any)
        .from("income_activity_log")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!data) return;
      const fresh = (data as ActivityEntry[]).filter(e => !seenIds.has(e.id));
      if (!fresh.length) return;
      fresh.forEach(e => seenIds.add(e.id));
      const latestScan = fresh.find(e => e.action === "discovery_run" || e.action === "scan_start");
      if (latestScan) setLastScanTs(new Date(latestScan.created_at).getTime());
      setLines(prev => {
        const next = [...prev, ...fresh.map(toTermLine)];
        next.sort((a, b) => a.tsSortKey - b.tsSortKey);
        return next.slice(-100);
      });
    }

    const pollTimer = setInterval(poll, 10_000);
    return () => { supabase.removeChannel(channel); clearInterval(pollTimer); };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always count to next UTC cron slot (:00/:15/:30/:45)
  function nextSlot(ts: number) {
    const d = new Date(ts);
    const m = d.getUTCMinutes();
    const next = m < 15 ? 15 : m < 30 ? 30 : m < 45 ? 45 : 60;
    if (next === 60) { d.setUTCMinutes(0, 0, 0); d.setUTCHours(d.getUTCHours() + 1); }
    else { d.setUTCMinutes(next, 0, 0); }
    d.setUTCSeconds(0, 0);
    return d.getTime();
  }
  let nextMs = nextSlot(now);
  while (nextMs <= now) nextMs += 15 * 60 * 1000;
  const remaining = nextMs - now;
  const remM = Math.floor(remaining / 60000);
  const remS = Math.floor((remaining % 60000) / 1000);

  const missedMs = lastScanTs ? now - lastScanTs : null;
  const isOverdue = missedMs !== null && missedMs > 20 * 60 * 1000;
  const overdueMin = missedMs ? Math.floor(missedMs / 60000) : 0;

  const countdownLabel = isOverdue
    ? `OVERDUE ${overdueMin}m`
    : `NEXT: ${String(remM).padStart(2,"0")}:${String(remS).padStart(2,"0")}`;

  const lastScanLabel = (() => {
    if (!lastScanTs) return "LAST: —";
    const ago = Math.floor((now - lastScanTs) / 60000);
    return ago < 1 ? "LAST: <1m ago" : ago < 60 ? `LAST: ${ago}m ago` : `LAST: ${Math.floor(ago / 60)}h ago`;
  })();

  const isTyping = typingState !== null;

  return (
    <div className="flex flex-col h-full bg-black border border-[#00ff41]/20 font-mono overflow-hidden">
      {/* Header row 1 */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#00ff41]/10 bg-[#030603] shrink-0">
        <span className="text-[9px] text-[#007a1f] uppercase tracking-[0.2em]">SYS::ACTIVITY_FEED</span>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? "bg-[#00ff41]" : "bg-[#ff0040]"}`} />
          <span className={`text-[9px] uppercase tracking-widest ${connected ? "text-[#00ff41]" : "text-[#ff0040]"}`}>
            {connected ? "LIVE" : "CONN..."}
          </span>
        </div>
      </div>

      {/* Header row 2 */}
      <div className="px-3 py-1.5 border-b border-[#00ff41]/20 bg-[#030603] shrink-0 flex items-center justify-between">
        <span className="text-[9px] text-[#004d14] uppercase tracking-widest">{lastScanLabel}</span>
        <span className={`text-[11px] font-bold tabular-nums tracking-widest ${
          isOverdue ? "text-[#ff0040] animate-pulse" : "text-[#00ff41]"
        }`}>
          {countdownLabel}
        </span>
      </div>

      {/* Feed body */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-px min-h-0">
        {lines.length === 0 && !isTyping && (
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

      {/* Prompt / typewriter area */}
      <div className="px-3 py-1 border-t border-[#00ff41]/20 bg-[#030603] shrink-0 min-h-[22px]">
        {isTyping && typingState ? (
          <div className="flex gap-2 text-[10px] leading-[1.6]">
            <span className="text-[#2a4d2a] shrink-0 tabular-nums w-[52px]">{typingState.entry.ts}</span>
            <span className={`shrink-0 font-semibold ${typingState.entry.color}`}>{typingState.entry.prefix}</span>
            <span className="text-[#008f21]">
              {typingState.entry.text.slice(0, typingState.pos)}
              <span className="text-[#00ff41]">█</span>
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-[#00ff41]">&gt;_{blink ? "█" : " "}</span>
        )}
      </div>
    </div>
  );
}

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
  agent_pr_opened:       "PR_OPENED ",
  agent_error:           "AGENT_ERR ",
  agent_no_changes:      "NO_CHANGE ",
  agent_skip:            "SKIP______",
  opportunity_queued:    "QUEUED____",
  opportunity_dismissed: "DISMISSED ",
  active_mode:           "ACTIVE_MOD",
  approval_approved:     "APPROVED_ ",
  earning_logged:        "EARN_LOG_ ",
  pr_merged:             "██ MERGED ",
  pr_closed:             "PR_CLOSED ",
  pr_check_run:          "PR_CHECK  ",
  // Superteam
  submit_ok:             "ST_SUBMIT ",
  submit_error:          "ST_ERR____",
  // Frantic
  frantic_signup:        "FR_SIGNUP ",
  frantic_payout:        "FR_PAYOUT ",
  frantic_delivered:     "██ FR_PAID",
  frantic_delivery_error:"FR_ERR____",
  // Scan summary (replaces all scan_start + scan_source lines)
  discovery_run:         "SCAN_DONE ",
};

// Actions that are suppressed — they're collapsed into the discovery_run summary
const SUPPRESSED_ACTIONS = new Set(["scan_start", "scan_source"]);

function parseScanTotal(entry: ActivityEntry): number {
  const m = entry.detail?.match(/Found (\d+) bounties/);
  return m ? parseInt(m[1], 10) : 0;
}

function scanSummaryDetail(entry: ActivityEntry): string {
  const sources: { source: string; count: number; error?: string }[] =
    (entry.metadata as any)?.log ?? [];
  const totalMatch = entry.detail?.match(/Found (\d+) bounties/);
  const newMatch   = entry.detail?.match(/(\d+) new/);
  const total      = totalMatch?.[1] ?? "?";
  const newCount   = newMatch?.[1] ?? "0";
  const srcParts   = sources
    .filter(s => !s.error && s.count > 0)
    .map(s => `${s.source}:${s.count}`)
    .join("  ");
  return `${total} total · ${newCount} new${srcParts ? `  [${srcParts}]` : ""}`;
}

// Action → color. No red (#ff0040), no green (#00ff41 / #00cc33).
const ACTION_COLORS: Record<string, string> = {
  // Gold — high-value outcomes
  pr_merged:             "text-[#ffd54f]",
  frantic_delivered:     "text-[#ffd54f]",
  submit_ok:             "text-[#ffd54f]",
  earning_logged:        "text-[#ffd54f]",
  approval_approved:     "text-[#ffd54f]",
  // Sky blue — PR / agent action
  agent_pr_opened:       "text-[#4fc3f7]",
  pr_check_run:          "text-[#4fc3f7]",
  // Purple — scan / discovery
  discovery_run:         "text-[#ce93d8]",
  // Cyan — queue events
  opportunity_queued:    "text-[#00e5ff]",
  // Lavender — pipeline control
  active_mode:           "text-[#b39ddb]",
  // Teal — frantic identity / payout events
  frantic_signup:        "text-[#80cbc4]",
  frantic_payout:        "text-[#80cbc4]",
  // Pink — superteam events
  submit_error:          "text-[#f48fb1]",
  frantic_delivery_error:"text-[#f48fb1]",
  // Orange — skips / dismissals / agent issues
  opportunity_dismissed: "text-[#ff9800]",
  agent_skip:            "text-[#ff9800]",
  agent_no_changes:      "text-[#ff9800]",
  agent_error:           "text-[#ff9800]",
  pr_closed:             "text-[#ff9800]",
};

function toTermLine(entry: ActivityEntry): TermLine {
  const ts = new Date(entry.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const engine = (entry.engine ?? "SYS").toUpperCase().slice(0, 6).padEnd(6);

  // Look up explicit action color first; fall back to status-based, then default steel-blue
  let color = ACTION_COLORS[entry.action];
  if (!color) {
    if (entry.status === "error")   color = "text-[#ff9800]";   // orange, not red
    else if (entry.status === "warning") color = "text-[#ffb800]"; // amber
    else color = "text-[#78909c]"; // default: steel-blue-grey
  }

  const actionLabel = ACTION_LABELS[entry.action] ?? entry.action.toUpperCase().slice(0, 10).padEnd(10);
  const text = entry.action === "discovery_run"
    ? scanSummaryDetail(entry)
    : (entry.detail ?? entry.action ?? "");

  return { id: entry.id, ts, tsSortKey: new Date(entry.created_at).getTime(), prefix: `[${engine}] ${actionLabel}`, text, color };
}

// Subtle scan blip — short descending tone, nothing celebratory
function playScanBlip() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(360, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.14);
    setTimeout(() => ctx.close(), 300);
  } catch {}
}

// Animate an integer counter from `from` to `to` over ~700ms (ease-out)
function animateCount(from: number, to: number, setter: (n: number) => void) {
  if (from === to) return;
  const duration = 700;
  const start = performance.now();
  const diff = to - from;
  function tick(now: number) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
    setter(Math.round(from + diff * eased));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

interface Props {
  initialEntries: ActivityEntry[];
  lastDiscoveryRun: string | null;
  userId: string;
}

export function IncomeTerminalFeed({ initialEntries, lastDiscoveryRun, userId }: Props) {
  const [lines, setLines] = useState<TermLine[]>(() => {
    const seen = new Set<string>();
    const deduped: ActivityEntry[] = [];
    for (const e of initialEntries) {
      if (!seen.has(e.id) && !SUPPRESSED_ACTIONS.has(e.action)) {
        seen.add(e.id); deduped.push(e);
      }
    }
    return deduped.slice(0, 80).reverse().map(toTermLine);
  });

  // Animated scan counter — seeded from most recent discovery_run
  const [scanTotal, setScanTotal] = useState<number>(() => {
    const run = initialEntries.find(e => e.action === "discovery_run");
    return run ? parseScanTotal(run) : 0;
  });
  const [displayTotal, setDisplayTotal] = useState<number>(scanTotal);
  const prevTotalRef = useRef<number>(scanTotal);

  const [connected, setConnected]   = useState(false);
  const [blink, setBlink]           = useState(true);
  const [now, setNow]               = useState(() => Date.now());

  // Typewriter state
  const [typingState, setTypingState] = useState<{ entry: TermLine; pos: number } | null>(null);
  const typingRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingQueueRef = useRef<TermLine[]>([]);
  const bottomRef      = useRef<HTMLDivElement>(null);

  const [lastScanTs, setLastScanTs] = useState<number | null>(() => {
    if (lastDiscoveryRun) return new Date(lastDiscoveryRun).getTime();
    const e = initialEntries.find(e => e.action === "discovery_run" || e.action === "scan_start");
    return e ? new Date(e.created_at).getTime() : null;
  });

  // Scroll to bottom
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines, typingState]);

  // 1s clock tick
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Cursor blink
  useEffect(() => { const t = setInterval(() => setBlink(b => !b), 530); return () => clearInterval(t); }, []);

  // Animate counter whenever scanTotal changes
  useEffect(() => {
    animateCount(prevTotalRef.current, scanTotal, setDisplayTotal);
    prevTotalRef.current = scanTotal;
  }, [scanTotal]);

  // Typewriter engine
  function flushEntry(entry: TermLine) {
    setLines(prev => {
      const next = [...prev.slice(-99), entry];
      next.sort((a, b) => a.tsSortKey - b.tsSortKey);
      return next;
    });
  }

  function startTyping(entry: TermLine) {
    if (typingRef.current) { clearInterval(typingRef.current); typingRef.current = null; }
    const fullLen = entry.text.length;
    if (fullLen === 0) { flushEntry(entry); return; }
    let pos = 0;
    setTypingState({ entry, pos });
    typingRef.current = setInterval(() => {
      pos += 3;
      if (pos >= fullLen) {
        clearInterval(typingRef.current!); typingRef.current = null;
        setTypingState(null); flushEntry(entry);
        const next = typingQueueRef.current.shift();
        if (next) startTyping(next);
      } else { setTypingState({ entry, pos }); }
    }, 18);
  }

  function enqueueTyping(entry: TermLine) {
    if (typingRef.current !== null) typingQueueRef.current.push(entry);
    else startTyping(entry);
  }

  useEffect(() => { return () => { if (typingRef.current) clearInterval(typingRef.current); }; }, []);

  // Realtime + 10s poll
  useEffect(() => {
    const supabase = createClient();
    const seenIds = new Set(lines.map(l => l.id));

    const channel = (supabase as any)
      .channel(`income_terminal_feed_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "income_activity_log", filter: `user_id=eq.${userId}` },
        (payload: any) => {
          const entry = payload.new as ActivityEntry;
          if (seenIds.has(entry.id)) return;
          seenIds.add(entry.id);

          if (entry.action === "discovery_run" || entry.action === "scan_start") {
            setLastScanTs(new Date(entry.created_at).getTime());
          }
          if (entry.action === "discovery_run") {
            const total = parseScanTotal(entry);
            if (total > 0) setScanTotal(total);
            playScanBlip();
          }
          // Suppress noisy scan sub-messages
          if (SUPPRESSED_ACTIONS.has(entry.action)) return;
          enqueueTyping(toTermLine(entry));
        }
      )
      .subscribe((status: string) => setConnected(status === "SUBSCRIBED"));

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
      const latestRun = fresh.find(e => e.action === "discovery_run");
      if (latestRun) {
        setLastScanTs(new Date(latestRun.created_at).getTime());
        const total = parseScanTotal(latestRun);
        if (total > 0) setScanTotal(total);
      }
      const visible = fresh.filter(e => !SUPPRESSED_ACTIONS.has(e.action));
      if (!visible.length) return;
      setLines(prev => {
        const next = [...prev, ...visible.map(toTermLine)];
        next.sort((a, b) => a.tsSortKey - b.tsSortKey);
        return next.slice(-100);
      });
    }

    const pollTimer = setInterval(poll, 10_000);
    return () => { supabase.removeChannel(channel); clearInterval(pollTimer); };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Next cron slot countdown
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

  const missedMs  = lastScanTs ? now - lastScanTs : null;
  const isOverdue = missedMs !== null && missedMs > 20 * 60 * 1000;
  const overdueMin = missedMs ? Math.floor(missedMs / 60000) : 0;

  const countdownLabel = isOverdue
    ? `OVERDUE ${overdueMin}m`
    : `NEXT: ${String(remM).padStart(2, "0")}:${String(remS).padStart(2, "0")}`;

  const lastScanLabel = (() => {
    if (!lastScanTs) return "LAST: —";
    const ago = Math.floor((now - lastScanTs) / 60000);
    return ago < 1 ? "LAST: <1m ago" : ago < 60 ? `LAST: ${ago}m ago` : `LAST: ${Math.floor(ago / 60)}h ago`;
  })();

  const isTyping = typingState !== null;

  return (
    <div className="flex flex-col h-full bg-black border border-[#4fc3f7]/20 font-mono overflow-hidden">
      {/* Header row 1 — title + connection status */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#4fc3f7]/10 bg-[#030508] shrink-0">
        <span className="text-[9px] text-[#37474f] uppercase tracking-[0.2em]">SYS::ACTIVITY_FEED</span>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? "bg-[#00e5ff]" : "bg-[#ff9800]"}`} />
          <span className={`text-[9px] uppercase tracking-widest ${connected ? "text-[#00e5ff]" : "text-[#ff9800]"}`}>
            {connected ? "LIVE" : "CONN..."}
          </span>
        </div>
      </div>

      {/* Header row 2 — scan counter + timing */}
      <div className="px-3 py-1.5 border-b border-[#4fc3f7]/15 bg-[#030508] shrink-0 flex items-center justify-between gap-2">
        <span className="text-[9px] text-[#37474f] uppercase tracking-widest shrink-0">{lastScanLabel}</span>

        {/* Animated scan counter */}
        <div className="flex items-baseline gap-1 min-w-0">
          <span className="text-[9px] text-[#37474f] uppercase tracking-widest shrink-0">SCANNED</span>
          <span className="text-[13px] font-bold tabular-nums text-[#ce93d8] tracking-tight">
            {displayTotal.toLocaleString()}
          </span>
        </div>

        <span className={`text-[11px] font-bold tabular-nums tracking-widest shrink-0 ${
          isOverdue ? "text-[#ff9800] animate-pulse" : "text-[#00e5ff]"
        }`}>
          {countdownLabel}
        </span>
      </div>

      {/* Feed body */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-px min-h-0">
        {lines.length === 0 && !isTyping && (
          <div className="text-[#37474f] text-[11px] py-4">&gt; Awaiting system events…</div>
        )}
        {lines.map(line => (
          <div key={line.id} className="flex gap-2 text-[10px] leading-[1.6]">
            <span className="text-[#2d3f4d] shrink-0 tabular-nums w-[52px]">{line.ts}</span>
            <span className={`shrink-0 font-semibold ${line.color}`}>{line.prefix}</span>
            <span className="text-[#546e7a] truncate">{line.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Prompt / typewriter area */}
      <div className="px-3 py-1 border-t border-[#4fc3f7]/15 bg-[#030508] shrink-0 min-h-[22px]">
        {isTyping && typingState ? (
          <div className="flex gap-2 text-[10px] leading-[1.6]">
            <span className="text-[#2d3f4d] shrink-0 tabular-nums w-[52px]">{typingState.entry.ts}</span>
            <span className={`shrink-0 font-semibold ${typingState.entry.color}`}>{typingState.entry.prefix}</span>
            <span className="text-[#546e7a]">
              {typingState.entry.text.slice(0, typingState.pos)}
              <span className="text-[#00e5ff]">█</span>
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-[#00e5ff]">&gt;_{blink ? "█" : " "}</span>
        )}
      </div>
    </div>
  );
}

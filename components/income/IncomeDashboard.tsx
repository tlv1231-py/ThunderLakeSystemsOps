"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  dismissOpportunity, markOpportunityInProgress,
  approveAction, rejectAction, markBountyPaid,
} from "@/app/(admin)/income/actions";
import type { IncomeSummary, Opportunity, Asset, Earning, Approval, ActivityEntry } from "@/lib/income/types";
import { IncomeTerminalFeed } from "@/components/income/IncomeTerminalFeed";

type Tab = "scan" | "ledger" | "assets" | "approvals" | "log";

interface Props {
  summary: IncomeSummary;
  allEarnings: Earning[];
  allAssets: Asset[];
  userId: string;
  pipelineItems: any[];
}

const CSS = `
@keyframes textGlow {
  0%,100%{text-shadow:0 0 6px rgba(255,255,255,0.5)}
  50%{text-shadow:0 0 16px rgba(255,255,255,1),0 0 28px rgba(255,255,255,0.4)}
}
@keyframes greenGlow {
  0%,100%{text-shadow:0 0 6px rgba(74,222,128,0.5)}
  50%{text-shadow:0 0 14px rgba(74,222,128,1),0 0 24px rgba(74,222,128,0.3)}
}
@keyframes borderLive {
  0%,100%{box-shadow:2px 0 12px rgba(255,255,255,0.15)}
  50%{box-shadow:2px 0 24px rgba(255,255,255,0.5)}
}

@keyframes fadeUp {
  from{opacity:0;transform:translateY(8px)}
  to{opacity:1;transform:translateY(0)}
}
@keyframes blink {
  0%,49%{opacity:1}50%,100%{opacity:0}
}
@keyframes idlePulse {
  0%,100%{border-color:rgba(255,255,255,0.15);box-shadow:none}
  50%{border-color:rgba(255,255,255,0.55);box-shadow:0 0 10px rgba(255,255,255,0.12)}
}
@keyframes scanProg {
  from{transform:scaleX(0)}to{transform:scaleX(1)}
}
@keyframes slowFade {
  0%,100%{opacity:1}50%{opacity:.4}
}

.text-glow   { animation: textGlow 3s ease-in-out infinite }
.green-glow  { animation: greenGlow 3s ease-in-out infinite }
.border-live { animation: borderLive 2.5s ease-in-out infinite }
.cursor      { animation: blink 1s step-end infinite }
.idle-pulse  { animation: idlePulse 3s ease-in-out infinite }
.fade-up     { animation: fadeUp .35s ease-out both }
.slow-fade   { animation: slowFade 2.5s ease-in-out infinite }
.scan-prog   { transform-origin:left; animation: scanProg 55s linear forwards }
`;

// ── helpers ──────────────────────────────────────────────────────────────────

function usd(n: number) {
  return n === 0 ? "$0" : n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

function countdown(ms: number) {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m ${s % 60}s`;
}

function nextHour(now: number) {
  const d = new Date(now); d.setUTCMinutes(0, 0, 0); d.setUTCHours(d.getUTCHours() + 1);
  return d.getTime();
}

function extractScore(note?: string | null): number | null {
  const m = note?.match(/score (\d+)/); return m ? +m[1] : null;
}

function ElapsedTimer({ since }: { since: string | null }) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    if (!since) return;
    function tick() {
      const ms = Date.now() - new Date(since!).getTime();
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      const d = Math.floor(h / 24);
      if (d > 0)      setElapsed(`${d}d ${h % 24}h`);
      else if (h > 0) setElapsed(`${h}h ${m % 60}m`);
      else if (m > 0) setElapsed(`${m}m ${s % 60}s`);
      else            setElapsed(`${s}s`);
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!elapsed) return null;
  return <span className="text-xs text-sky-400 tabular-nums font-mono">{elapsed}</span>;
}

function scoreColor(s: number) {
  if (s >= 80) return "text-emerald-400";
  if (s >= 60) return "text-amber-400";
  return "text-zinc-600";
}

// ── status config (color where it communicates meaning) ──────────────────────

const S_LABEL: Record<string, string> = {
  pending: "waiting", in_progress: "working", review: "review",
  submitted: "submitted", done: "merged", failed: "failed", cancelled: "—",
};

const S_LABEL_CLS: Record<string, string> = {
  pending:     "text-zinc-500",
  in_progress: "text-teal-400 slow-fade",
  review:      "text-amber-400",
  submitted:   "text-sky-400",
  done:        "text-emerald-400 green-glow",
  failed:      "text-zinc-700",
  cancelled:   "text-zinc-800",
};

const S_TITLE_CLS: Record<string, string> = {
  pending:     "text-zinc-300",
  in_progress: "text-white text-glow",
  review:      "text-white",
  submitted:   "text-white",
  done:        "text-emerald-300",
  failed:      "text-zinc-600",
  cancelled:   "text-zinc-800",
};

const S_BORDER_CLS: Record<string, string> = {
  pending:     "border-l-zinc-700",
  in_progress: "border-l-white border-live",
  review:      "border-l-amber-500",
  submitted:   "border-l-sky-500",
  done:        "border-l-emerald-400",
  failed:      "border-l-zinc-900",
  cancelled:   "border-l-zinc-900",
};

const S_BAR_CLS: Record<string, string> = {
  pending:     "bg-zinc-600",
  in_progress: "bg-white",
  review:      "bg-amber-400",
  submitted:   "bg-sky-400",
  done:        "bg-emerald-400",
  failed:      "bg-zinc-800",
  cancelled:   "bg-zinc-900",
};

// ── mission card ──────────────────────────────────────────────────────────────

function MissionCard({ item, fresh }: { item: any; fresh: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 80); return () => clearTimeout(t); }, []);
  if (gone) return null;

  const st: string = item.status ?? "pending";
  const pct = item.progress_pct ?? 0;
  const score: number | null = item.income_opportunities?.score ?? extractScore(item.progress_note);

  return (
    <div className={`border-l-2 ${S_BORDER_CLS[st] ?? "border-l-zinc-800"} pl-4 py-3 group transition-all duration-200 hover:bg-zinc-950 ${fresh ? "fade-up" : ""}`}>
      <div className="flex items-start gap-4">
        <span className={`text-xs uppercase tracking-widest shrink-0 w-16 mt-0.5 ${S_LABEL_CLS[st] ?? "text-zinc-700"}`}>
          {S_LABEL[st] ?? st}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug ${S_TITLE_CLS[st] ?? "text-white"}`}>{item.title}</p>

          {["in_progress", "review"].includes(st) && (
            <div className="mt-2">
              <div className="relative h-px bg-zinc-800 w-full overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-1000 ${S_BAR_CLS[st]}`}
                  style={{ width: mounted ? `${pct}%` : "0%" }}
                />
              </div>
              <span className="text-xs text-zinc-500 mt-0.5 block">{pct}%{item.progress_note ? `  ${item.progress_note}` : ""}</span>
            </div>
          )}

          {item.pr_url && (
            <div className="flex items-center gap-3 mt-1">
              <a href={item.pr_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-zinc-600 hover:text-sky-400 transition-colors truncate">
                ↗ {item.pr_url.replace("https://github.com/", "github.com/")}
              </a>
              {st === "submitted" && <ElapsedTimer since={item.completed_at ?? item.updated_at ?? null} />}
            </div>
          )}

          {st === "done" && (
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-zinc-600">awaiting payment</span>
              <button
                disabled={pending}
                onClick={() => start(async () => { await markBountyPaid(item.id); setGone(true); router.refresh(); })}
                className="text-xs border border-emerald-900 text-emerald-400 hover:border-emerald-400 hover:text-emerald-300 px-2 py-0.5 transition-colors disabled:opacity-30 slow-fade">
                mark paid
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {item.expected_usd > 0 && (
            <span className="text-sm font-medium tabular-nums text-emerald-400">
              {usd(item.expected_usd)}
            </span>
          )}
          {score != null && (
            <span className={`text-xs font-mono tabular-nums ${scoreColor(score)}`}>{score}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 8-bit new-bounty chime ────────────────────────────────────────────────────

function playBountyChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  } catch {}
}

// ── realtime missions ─────────────────────────────────────────────────────────

function Missions({ items, fresh }: { items: any[]; fresh: Set<string> }) {
  const active = items.filter(i => ["pending","in_progress","review","submitted","done"].includes(i.status));
  if (!active.length) {
    return (
      <p className="text-sm text-zinc-700 py-4">
        No active bounties. Run a scan then queue something.<span className="cursor ml-0.5">_</span>
      </p>
    );
  }
  return <div className="divide-y divide-zinc-900">{active.map(i => <MissionCard key={i.id} item={i} fresh={fresh.has(i.id)} />)}</div>;
}

// ── queue list ────────────────────────────────────────────────────────────────

function QueueList({ items }: { items: any[] }) {
  if (!items.length) return null;
  return (
    <div className="divide-y divide-zinc-900">
      {items.slice(0, 15).map((item, i) => {
        const score = extractScore(item.progress_note);
        return (
          <div key={item.id} className="py-2.5 flex items-center gap-4 hover:bg-zinc-950 transition-colors">
            <span className="text-sm text-zinc-700 tabular-nums w-5 text-right shrink-0">{i + 1}</span>
            {score != null && <span className={`text-xs tabular-nums w-6 shrink-0 font-mono ${scoreColor(score)}`}>{score}</span>}
            <span className="text-sm text-white flex-1 truncate">{item.title}</span>
            {item.expected_usd > 0 && <span className="text-sm text-emerald-400 tabular-nums shrink-0 font-medium">{usd(item.expected_usd)}</span>}
          </div>
        );
      })}
      {items.length > 15 && <p className="text-xs text-zinc-700 pt-2">+{items.length - 15} more</p>}
    </div>
  );
}

// ── header stats ──────────────────────────────────────────────────────────────

function Dot() { return <span className="text-zinc-800 text-lg select-none">·</span>; }

function HeaderStats({ summary, winRate, allTimeUsd, openPRs, totalSubmissions }: {
  summary: IncomeSummary; winRate: number; allTimeUsd: number; openPRs: number; totalSubmissions: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const remaining = nextHour(now) - now;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-2">
      <div>
        <span className="text-lg font-semibold text-white tabular-nums text-glow">{usd(summary.collectedThisWeek)}</span>
      </div>
      <Dot />
      <div>
        <span className="text-lg font-semibold text-white tabular-nums">{totalSubmissions}</span>
        <span className="text-sm text-zinc-500 ml-1">total submissions</span>
      </div>
      <Dot />
      <div>
        <span className={`text-lg font-semibold tabular-nums ${openPRs > 0 ? "text-sky-400" : "text-zinc-500"}`}>{openPRs}</span>
        <span className="text-sm text-zinc-500 ml-1">pending</span>
      </div>
      <Dot />
      <div>
        <span className={`text-lg font-semibold tabular-nums ${winRate > 0 ? "text-emerald-400 green-glow" : "text-zinc-500"}`}>{winRate}%</span>
        <span className="text-sm text-zinc-500 ml-1">win rate</span>
      </div>
      <Dot />
      <div>
        <span className="text-sm text-zinc-500">{usd(allTimeUsd)}</span>
        <span className="text-sm text-zinc-700 ml-1">total</span>
      </div>
      <Dot />
      <div>
        <span className="text-sm text-zinc-500">scan in </span>
        <span className={`text-sm tabular-nums font-mono ${remaining < 300000 ? "text-amber-400" : "text-zinc-400"}`}>
          {countdown(remaining)}
        </span>
      </div>
    </div>
  );
}

// ── detail tabs ───────────────────────────────────────────────────────────────

function ScanContent({ opps, onDismiss }: {
  opps: Opportunity[];
  onDismiss(id: string): void;
}) {
  const [filter, setFilter] = useState<"all" | "discovered" | "queued">("all");
  const list = filter === "all" ? opps : opps.filter(o => o.status === filter);
  return (
    <div>
      <div className="flex gap-4 mb-4">
        {(["all", "discovered", "queued"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-sm transition-colors ${filter === f ? "text-white" : "text-zinc-600 hover:text-zinc-400"}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="divide-y divide-zinc-900">
        {list.slice(0, 80).map(o => (
          <div key={o.id} className="py-2.5 flex items-center gap-4 group hover:bg-zinc-950 transition-colors">
            <span className={`text-sm tabular-nums font-mono w-6 text-right shrink-0 ${scoreColor(o.score)}`}>{o.score}</span>
            <span className="text-xs text-zinc-700 w-14 shrink-0">{o.source}</span>
            <span className="text-sm text-white flex-1 truncate">{o.title}</span>
            {o.reward_usd && o.reward_usd > 0 && (
              <span className="text-sm text-emerald-400 tabular-nums shrink-0 font-medium">{usd(o.reward_usd)}</span>
            )}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button onClick={() => onDismiss(o.id)}
                className="text-xs text-zinc-700 hover:text-zinc-400 transition-colors px-1">✕</button>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <p className="text-sm text-zinc-700 py-6">
            No opportunities yet. Click <span className="text-white">scan</span> to discover.<span className="cursor">_</span>
          </p>
        )}
      </div>
    </div>
  );
}

function LedgerContent({ earnings }: { earnings: Earning[] }) {
  if (!earnings.length) return <p className="text-sm text-zinc-700 py-6">No earnings yet.</p>;
  return (
    <div className="divide-y divide-zinc-900">
      {earnings.slice(0, 80).map(e => (
        <div key={e.id} className="py-2.5 flex items-center gap-4 hover:bg-zinc-950 transition-colors">
          <span className="text-sm text-zinc-500 tabular-nums w-24 shrink-0">{e.earned_date}</span>
          <span className="text-sm text-white flex-1 truncate">{e.description}</span>
          <span className="text-xs text-zinc-600 shrink-0">{e.engine}</span>
          <span className={`text-sm tabular-nums shrink-0 font-medium ${e.status === "collected" ? "text-emerald-400" : "text-zinc-500"}`}>
            {usd(e.amount_usd)}
          </span>
        </div>
      ))}
    </div>
  );
}

function AssetsContent({ assets }: { assets: Asset[] }) {
  if (!assets.length) return <p className="text-sm text-zinc-700 py-6">No assets yet.</p>;
  return (
    <div className="divide-y divide-zinc-900">
      {assets.map(a => (
        <div key={a.id} className="py-2.5 flex items-center gap-4 hover:bg-zinc-950 transition-colors">
          <span className="text-sm text-white flex-1 truncate">{a.name}</span>
          <span className="text-sm text-zinc-500 shrink-0">{a.marketplace ?? "—"}</span>
          <span className="text-xs text-zinc-600 shrink-0">{a.status}</span>
          {a.total_revenue > 0 && <span className="text-sm text-emerald-400 tabular-nums shrink-0 font-medium">{usd(a.total_revenue)}</span>}
        </div>
      ))}
    </div>
  );
}

function ApprovalsContent({ approvals, onApprove, onReject }: {
  approvals: Approval[];
  onApprove(id: string): void;
  onReject(id: string): void;
}) {
  if (!approvals.length) return <p className="text-sm text-zinc-700 py-6">No pending approvals.</p>;
  return (
    <div className="space-y-3">
      {approvals.map(a => (
        <div key={a.id} className="border border-zinc-800 hover:border-zinc-600 transition-colors p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-white">{a.title}</p>
              {a.description && <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{a.description}</p>}
              {a.action_url && (
                <a href={a.action_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-zinc-600 hover:text-sky-400 transition-colors mt-1 block truncate">
                  ↗ {a.action_url.replace("https://github.com/", "github.com/")}
                </a>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => onApprove(a.id)}
                className="text-sm border border-emerald-800 text-emerald-400 hover:border-emerald-400 hover:text-emerald-300 px-3 py-1 transition-colors">approve</button>
              <button onClick={() => onReject(a.id)}
                className="text-sm border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white px-3 py-1 transition-colors">reject</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── agent CTA ─────────────────────────────────────────────────────────────────

const DEFAULT_AGENT_SERVER = "http://localhost:3002";

function getAgentServer() {
  if (typeof window === "undefined") return DEFAULT_AGENT_SERVER;
  return localStorage.getItem("tls_agent_server") || DEFAULT_AGENT_SERVER;
}

function AgentCTA({ count, projected }: { count: number; projected: number }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "copied">("idle");
  const [serverAddr, setServerAddr] = useState(DEFAULT_AGENT_SERVER);

  useEffect(() => { setServerAddr(getAgentServer()); }, []);

  function configureServer() {
    const cur = getAgentServer();
    const next = window.prompt("Agent server address (laptop's LAN IP:port):", cur);
    if (next && next.trim()) {
      const addr = next.trim().startsWith("http") ? next.trim() : `http://${next.trim()}`;
      localStorage.setItem("tls_agent_server", addr);
      setServerAddr(addr);
    }
  }

  async function run() {
    if (state === "running") return;
    setState("running");
    try {
      const r = await fetch(`${serverAddr}/run`, {
        method: "POST",
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) throw new Error("server error");
      setState("done");
      setTimeout(() => setState("idle"), 3000);
    } catch {
      // Server not running — fall back to clipboard
      await navigator.clipboard.writeText("node scripts/income-agent.mjs");
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  const label =
    state === "running" ? "running…" :
    state === "done"    ? "✓ started" :
    state === "copied"  ? "copied (start agent-server.mjs)" :
    `run pipeline`;

  const cls =
    state === "running" ? "text-teal-400 border-teal-800" :
    state === "done"    ? "text-emerald-400 border-emerald-900" :
    state === "copied"  ? "text-amber-400 border-amber-900" :
    "text-white border-zinc-700 hover:border-white";

  return (
    <div className="border border-zinc-800 bg-zinc-950 px-4 py-3 mb-6 flex items-center justify-between gap-4">
      <p className="text-sm text-zinc-300">
        <span className="text-emerald-400 font-medium">{count}</span>{" "}
        {count === 1 ? "bounty" : "bounties"} staged
        {projected > 0 && <span className="text-zinc-600 ml-2">{usd(projected)} projected</span>}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={run}
          disabled={state === "running"}
          className={`text-sm border px-4 py-1.5 transition-all disabled:opacity-60 whitespace-nowrap ${cls}`}>
          {label}
        </button>
        <button
          onClick={configureServer}
          title={`Agent server: ${serverAddr}`}
          className="text-zinc-700 hover:text-zinc-400 transition-colors text-xs px-1">
          ⚙
        </button>
      </div>
    </div>
  );
}

// ── section header with blinking cursor ──────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-xs text-zinc-500 uppercase tracking-widest">
        {label}<span className="cursor ml-0.5">_</span>
      </h2>
      {count !== undefined && <span className="text-xs text-zinc-700">{count}</span>}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export function IncomeDashboard({ summary, allEarnings, allAssets, userId, pipelineItems }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("scan");
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<string | null>(null);
  const [stagedCollapsed, setStagedCollapsed] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, startT] = useTransition();

  // Live pipeline items — realtime subscription keeps these current
  const [liveItems, setLiveItems] = useState<any[]>(pipelineItems);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    const sb = createClient();
    const ch = (sb as any).channel(`m_${userId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "income_work_queue", filter: `user_id=eq.${userId}`,
      }, (p: any) => {
        if (p.eventType === "INSERT") {
          setLiveItems(prev => [p.new, ...prev]);
          setFresh(prev => new Set([...prev, p.new.id]));
          setTimeout(() => setFresh(prev => { const n = new Set(prev); n.delete(p.new.id); return n; }), 1500);
          if (p.new.status === "pending") playBountyChime();
        } else if (p.eventType === "UPDATE") {
          setLiveItems(prev => prev.map(i => i.id === p.new.id ? { ...i, ...p.new } : i));
        } else if (p.eventType === "DELETE") {
          setLiveItems(prev => prev.filter(i => i.id !== p.old.id));
        }
      }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId]);

  const pendingQueue    = liveItems.filter(w => w.status === "pending");
  const submittedCount  = liveItems.filter(w => w.status === "submitted").length;
  const doneCount       = liveItems.filter(w => w.status === "done").length;
  const paidCount       = allEarnings.filter(e => e.status === "collected").length;
  const allTimeUsd      = allEarnings.filter(e => e.status === "collected").reduce((s, e) => s + e.amount_usd, 0);
  const totalAttempted  = submittedCount + doneCount + paidCount;
  const winRate         = totalAttempted > 0 ? Math.round(((doneCount + paidCount) / totalAttempted) * 100) : 0;
  const activeMissions  = liveItems.filter(w => !["done","failed","cancelled"].includes(w.status)).length;
  const openPRs         = submittedCount;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "scan",      label: "scan",      count: summary.activeOpportunities || undefined },
    { id: "ledger",    label: "ledger",    count: allEarnings.length || undefined },
    { id: "assets",    label: "assets",    count: allAssets.length || undefined },
    { id: "approvals", label: "approvals", count: summary.pendingApprovals || undefined },
    { id: "log",       label: "log" },
  ];

  async function handleDiscover() {
    setDiscovering(true); setDiscoverResult(null);
    try {
      const r = await fetch("/api/income/discover");
      const d = await r.json();
      setDiscoverResult(d.ok ? `+${d.new} found` : "error");
      if (d.ok) router.refresh();
    } catch { setDiscoverResult("error"); }
    finally { setDiscovering(false); }
  }

  return (
    <div className="bg-black text-white font-mono -mx-4 -mt-6 -mb-6 min-h-screen relative">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="max-w-[960px] mx-auto px-6 py-6 relative z-10">

        {/* Scan progress bar */}
        {discovering && (
          <div className="h-px bg-zinc-900 mb-6 overflow-hidden">
            <div className="h-full bg-white scan-prog" />
          </div>
        )}

        {/* ── header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-base font-semibold text-white tracking-wide">
              Bounty Engine<span className="cursor ml-0.5 text-zinc-600">_</span>
            </h1>
            <HeaderStats summary={summary} winRate={winRate} allTimeUsd={allTimeUsd} openPRs={openPRs} totalSubmissions={totalAttempted} />
          </div>
          <div className="flex items-center gap-3 shrink-0 mt-1">
            {discoverResult && (
              <span className={`text-sm ${discoverResult.startsWith("+") ? "text-emerald-400" : "text-zinc-500"}`}>
                {discoverResult}
              </span>
            )}
            <button onClick={() => router.refresh()}
              className="text-sm text-zinc-600 hover:text-zinc-300 transition-colors px-1" title="Refresh">
              ↺
            </button>
            <button
              onClick={handleDiscover}
              disabled={discovering}
              className={`text-sm border px-3 py-1 transition-all disabled:opacity-30
                ${discovering ? "border-zinc-700 text-zinc-500" : "idle-pulse text-white hover:border-white"}`}>
              {discovering ? "scanning…" : "scan"}
            </button>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className={`text-sm border px-2.5 py-1 transition-colors ${menuOpen ? "border-zinc-500 text-zinc-300" : "border-zinc-800 text-zinc-600 hover:border-zinc-500 hover:text-zinc-300"}`}
              title="Scan · Ledger · Log">
              ☰
            </button>
          </div>
        </div>

        {/* ── agent CTA ───────────────────────────────────────────────── */}
        {pendingQueue.length > 0 && (
          <AgentCTA count={pendingQueue.length} projected={summary.queueProjectedUsd} />
        )}

        {/* ── active bounties ─────────────────────────────────────────── */}
        <section className="mb-8">
          <SectionHeader label="Active" count={activeMissions} />
          <Missions items={liveItems} fresh={fresh} />
        </section>

        {/* ── staged ──────────────────────────────────────────────────── */}
        {pendingQueue.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setStagedCollapsed(c => !c)}
                className="flex items-center gap-2 text-xs text-zinc-500 uppercase tracking-widest hover:text-zinc-400 transition-colors"
              >
                staged
                <span className="text-zinc-600 font-normal normal-case tracking-normal">[{pendingQueue.length}]</span>
                <span className="text-zinc-700 text-[10px]">{stagedCollapsed ? "▸" : "▾"}</span>
              </button>
            </div>
            {!stagedCollapsed && <QueueList items={pendingQueue} />}
          </section>
        )}

        {/* ── detail tabs (behind hamburger) ──────────────────────────── */}
        {menuOpen && <div className="border-t border-zinc-900 pt-6">
          <div className="flex gap-5 mb-6 sticky top-0 bg-black py-2 z-20">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`text-sm transition-colors ${tab === t.id ? "text-white" : "text-zinc-600 hover:text-zinc-300"}`}>
                {t.label}
                {t.count
                  ? <span className={`ml-1 ${tab === t.id ? "text-zinc-400" : "text-zinc-700"}`}>({t.count})</span>
                  : null}
                {t.id === "approvals" && summary.pendingApprovals > 0 && (
                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 slow-fade align-middle" />
                )}
              </button>
            ))}
          </div>

          {tab === "scan" && (
            <ScanContent
              opps={summary.topOpportunities as Opportunity[]}
              onDismiss={id => startT(() => dismissOpportunity(id).then(() => router.refresh()))}
            />
          )}
          {tab === "ledger"    && <LedgerContent earnings={allEarnings} />}
          {tab === "assets"    && <AssetsContent assets={allAssets} />}
          {tab === "approvals" && (
            <ApprovalsContent
              approvals={summary.approvals as Approval[]}
              onApprove={id => startT(() => approveAction(id).then(() => router.refresh()))}
              onReject={id  => startT(() => rejectAction(id).then(() => router.refresh()))}
            />
          )}
          {/* Terminal feed — always mounted to keep realtime subscription alive */}
          <div className={tab === "log" ? "h-[600px]" : "h-0 overflow-hidden pointer-events-none"}>
            <IncomeTerminalFeed
              initialEntries={summary.recentActivity}
              lastDiscoveryRun={summary.lastDiscoveryRun}
            />
          </div>
        </div>}

      </div>
    </div>
  );
}

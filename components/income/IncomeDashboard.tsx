"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  dismissOpportunity, markOpportunityInProgress,
  approveAction, rejectAction,
  markBountyPaid,
} from "@/app/(admin)/income/actions";
import type { IncomeSummary, Opportunity, Asset, Earning, Approval, ActivityEntry } from "@/lib/income/types";
import { IncomeTerminalFeed } from "@/components/income/IncomeTerminalFeed";

type DetailTab = "scan" | "ledger" | "assets" | "approvals" | "log";

interface Props {
  summary: IncomeSummary;
  allEarnings: Earning[];
  allAssets: Asset[];
  userId: string;
  pipelineItems: any[];
}

// ── Minimal animation CSS ─────────────────────────────────────────────────────

const CSS = `
@keyframes tIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
@keyframes tBlink { 0%,100%{opacity:1;} 50%{opacity:0;} }
@keyframes tPulse { 0%,100%{opacity:0.5;} 50%{opacity:1;} }
@keyframes scanLine { from{width:0;} to{width:100%;} }
.t-in     { animation: tIn 0.3s ease-out; }
.t-blink  { animation: tBlink 1s step-end infinite; }
.t-pulse  { animation: tPulse 1.4s ease-in-out infinite; }
.scan-bar { animation: scanLine 55s linear forwards; }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function usd(n: number) { return n === 0 ? "$0" : `$${n % 1 === 0 ? n : n.toFixed(2)}`; }

function countdown(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h > 0
    ? `${h}:${String(m % 60).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`
    : `${m}:${String(s % 60).padStart(2,"0")}`;
}

function nextHourlySlot(now: number) {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d.getTime();
}

function extractScore(note?: string | null): number | null {
  const m = note?.match(/score (\d+)/);
  return m ? parseInt(m[1]) : null;
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string,string>  = {
  pending:"waiting", in_progress:"working", review:"review",
  submitted:"pr open", done:"merged", failed:"failed", cancelled:"cancelled",
};
const STATUS_LEFT: Record<string,string> = {
  pending:     "border-l-[#007a1f]",
  in_progress: "border-l-[#f59e0b]",
  review:      "border-l-[#67e8f9]",
  submitted:   "border-l-[#4ade80]",
  done:        "border-l-[#00ff41]",
  failed:      "border-l-[#f87171]",
  cancelled:   "border-l-[#374151]",
};
const STATUS_TEXT: Record<string,string> = {
  pending:"text-[#007a1f]", in_progress:"text-[#f59e0b]",
  review:"text-[#67e8f9]", submitted:"text-[#4ade80]",
  done:"text-[#00ff41]", failed:"text-[#f87171]", cancelled:"text-[#374151]",
};
const STATUS_DOT: Record<string,string> = {
  pending:"bg-[#007a1f]", in_progress:"bg-[#f59e0b]",
  review:"bg-[#67e8f9]", submitted:"bg-[#4ade80]",
  done:"bg-[#00ff41]", failed:"bg-[#f87171]", cancelled:"bg-[#374151]",
};

// ── Mission card ──────────────────────────────────────────────────────────────

function MissionCard({ item, fresh }: { item: any; fresh: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const st     = item.status as string;
  const label  = STATUS_LABEL[st] ?? st;
  const lBorder = STATUS_LEFT[st]  ?? "border-l-[#003d10]";
  const dotCls  = STATUS_DOT[st]   ?? "bg-[#003d10]";
  const txtCls  = STATUS_TEXT[st]  ?? "text-[#007a1f]";
  const isWork  = st === "in_progress";
  const isDone  = st === "done";

  return (
    <div className={`
      border-l-2 ${lBorder} border-t border-r border-b border-white/[0.06]
      bg-white/[0.02] hover:bg-white/[0.04] transition-colors mb-1.5 pl-3 pr-3 pt-2 pb-2
      ${fresh ? "t-in" : ""}
    `}>
      {/* row 1: dot + status + reward */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${dotCls} ${isWork ? "t-pulse" : ""}`} />
          <span className={`text-[9px] font-semibold uppercase tracking-widest ${txtCls}`}>{label}</span>
        </div>
        {item.expected_usd > 0 && (
          <span className="text-[#00ff41] text-sm font-bold tabular-nums">{usd(item.expected_usd)}</span>
        )}
      </div>
      {/* title */}
      <p className="text-[11px] text-[#009922] leading-snug line-clamp-2 mb-1">{item.title}</p>
      {/* progress */}
      {isWork && (
        <div className="mt-1.5 mb-1">
          <div className="relative h-[2px] bg-[#002208] w-full rounded-full">
            <div className="absolute inset-y-0 left-0 bg-[#f59e0b] rounded-full transition-all duration-700"
              style={{ width: `${item.progress_pct ?? 0}%` }} />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px] text-[#005a16]">{item.progress_pct ?? 0}%</span>
            {item.progress_note && (
              <span className="text-[9px] text-[#004d14] truncate max-w-[200px]">{item.progress_note}</span>
            )}
          </div>
        </div>
      )}
      {/* PR link */}
      {item.pr_url && !isDone && (
        <a href={item.pr_url} target="_blank" rel="noopener noreferrer"
          className="block text-[9px] text-[#67e8f9]/50 hover:text-[#67e8f9] truncate mt-0.5">
          ↗ {item.pr_url.replace("https://github.com/","gh/")}
        </a>
      )}
      {/* Mark paid */}
      {isDone && (
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[9px] text-[#005a16]">awaiting payment</span>
          <button disabled={pending}
            onClick={() => start(async () => { await markBountyPaid(item.id); setGone(true); router.refresh(); })}
            className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 border border-[#f59e0b]/40 text-[#f59e0b] hover:bg-[#f59e0b]/10 disabled:opacity-30 transition-colors t-pulse">
            mark paid
          </button>
        </div>
      )}
      {/* progress note for non-working */}
      {!isWork && !isDone && item.progress_note && (
        <p className="text-[9px] text-[#004d14] truncate mt-0.5">{item.progress_note}</p>
      )}
    </div>
  );
}

// ── Active missions (realtime) ────────────────────────────────────────────────

function Missions({ initialItems, userId }: { initialItems: any[]; userId: string }) {
  const [items, setItems] = useState<any[]>(initialItems);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    const sb = createClient();
    const ch = (sb as any).channel(`missions_${userId}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"income_work_queue", filter:`user_id=eq.${userId}` },
        (p: any) => {
          if (p.eventType === "INSERT") {
            setItems(prev => [p.new, ...prev]);
            setFresh(prev => new Set([...prev, p.new.id]));
            setTimeout(() => setFresh(prev => { const n = new Set(prev); n.delete(p.new.id); return n; }), 1500);
          } else if (p.eventType === "UPDATE") {
            setItems(prev => prev.map(i => i.id === p.new.id ? { ...i, ...p.new } : i));
          } else if (p.eventType === "DELETE") {
            setItems(prev => prev.filter(i => i.id !== p.old.id));
          }
        }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId]);

  const active = items.filter(i => ["pending","in_progress","review","submitted","done"].includes(i.status));

  if (!active.length) {
    return (
      <div className="border border-white/[0.04] bg-white/[0.01] px-4 py-8 text-center">
        <div className="text-[9px] text-[#003d10] uppercase tracking-widest">no active missions</div>
      </div>
    );
  }

  return (
    <div>
      {active.map(item => <MissionCard key={item.id} item={item} fresh={fresh.has(item.id)} />)}
    </div>
  );
}

// ── Queue ─────────────────────────────────────────────────────────────────────

function Queue({ items }: { items: any[] }) {
  if (!items.length) return null;
  return (
    <div className="border border-white/[0.06]">
      <div className="px-3 py-1.5 border-b border-white/[0.05] flex items-center justify-between">
        <span className="text-[9px] text-[#007a1f] uppercase tracking-widest">queue</span>
        <span className="text-[9px] text-[#004d14]">{items.length}</span>
      </div>
      {items.slice(0, 12).map((item, i) => {
        const score = extractScore(item.progress_note);
        return (
          <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors">
            <span className="text-[9px] text-[#003d10] w-4 text-right tabular-nums shrink-0">{i+1}</span>
            {score != null && (
              <span className="text-[8px] px-1 py-px bg-green-950/60 text-[#007a1f] border border-[#007a1f]/30 shrink-0 tabular-nums">{score}</span>
            )}
            <span className="flex-1 text-[11px] text-[#00aa28] truncate min-w-0">{item.title}</span>
            {item.expected_usd > 0 && (
              <span className="text-[11px] text-[#00ff41] tabular-nums shrink-0">{usd(item.expected_usd)}</span>
            )}
          </div>
        );
      })}
      {items.length > 12 && (
        <div className="px-3 py-1 text-[9px] text-[#003d10]">+{items.length - 12} more</div>
      )}
    </div>
  );
}

// ── Stat row ──────────────────────────────────────────────────────────────────

function StatRow({
  summary, activeMissions, pendingCount, paidCount, winRate, allTimeUsd,
}: {
  summary: IncomeSummary; activeMissions: number; pendingCount: number; paidCount: number; winRate: number; allTimeUsd: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const scanMs = nextHourlySlot(now) - now;
  const pct    = Math.round(summary.weeklyProgress * 100);

  const tiles = [
    { label: "this week",  value: usd(summary.collectedThisWeek), sub: `${pct}% of $600`, bar: pct },
    { label: "queue",      value: String(pendingCount),            sub: pendingCount > 0 ? `${usd(summary.queueProjectedUsd)} projected` : "empty" },
    { label: "pipeline",   value: String(activeMissions),          sub: `${summary.activeOpportunities} discovered` },
    { label: "win rate",   value: `${winRate}%`,                   sub: `${paidCount} paid · ${usd(allTimeUsd)} all-time` },
    { label: "scan in",    value: countdown(scanMs),               sub: scanMs < 300_000 ? "soon" : "hourly" },
  ];

  return (
    <div className="grid grid-cols-5 gap-px border border-white/[0.06] mb-4">
      {tiles.map(t => (
        <div key={t.label} className="px-3 py-2.5 bg-white/[0.02] border-r border-white/[0.05] last:border-0">
          <div className="text-[8px] text-[#005a16] uppercase tracking-widest mb-1">{t.label}</div>
          <div className="text-base font-bold text-[#00ff41] tabular-nums leading-none mb-1">{t.value}</div>
          {t.bar != null ? (
            <div className="relative h-[2px] bg-[#002208] w-full rounded-full mt-1.5">
              <div className="absolute inset-y-0 left-0 bg-[#22c55e] rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, t.bar)}%` }} />
            </div>
          ) : (
            <div className="text-[9px] text-[#007a1f]">{t.sub}</div>
          )}
          {t.bar != null && <div className="text-[9px] text-[#007a1f] mt-0.5">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Detail tabs content ───────────────────────────────────────────────────────

function ScanContent({ opps, onDismiss, onQueue }: { opps: Opportunity[]; onDismiss:(id:string)=>void; onQueue:(id:string)=>void; }) {
  const [filter, setFilter] = useState<"all"|"discovered"|"queued">("all");
  const list = filter === "all" ? opps : opps.filter(o => o.status === filter);
  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        {(["all","discovered","queued"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-[9px] uppercase tracking-widest px-2 py-0.5 border transition-colors ${filter===f ? "border-[#00ff41]/30 text-[#00ff41]" : "border-white/[0.06] text-[#007a1f] hover:text-[#00aa28]"}`}>
            {f}
          </button>
        ))}
      </div>
      <div>
        {list.slice(0,80).map(o => (
          <div key={o.id} className="flex items-center gap-2 py-1.5 px-2 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors last:border-0 group">
            <span className="text-[9px] text-[#007a1f] w-5 text-right tabular-nums shrink-0">{o.score}</span>
            <span className="text-[9px] text-[#007a1f] w-16 shrink-0">{o.source}</span>
            <span className="flex-1 text-[11px] text-[#00aa28] truncate">{o.title}</span>
            {o.reward_usd && o.reward_usd > 0 && <span className="text-[11px] text-[#00ff41] tabular-nums shrink-0">{usd(o.reward_usd)}</span>}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {o.status === "discovered" && (
                <button onClick={() => onQueue(o.id)} className="text-[9px] text-[#007a1f] hover:text-[#00ff41] border border-white/[0.08] hover:border-[#00ff41]/30 px-1.5 py-px transition-colors">+q</button>
              )}
              <button onClick={() => onDismiss(o.id)} className="text-[9px] text-[#004d14] hover:text-[#f87171] border border-white/[0.05] hover:border-[#f87171]/30 px-1.5 py-px transition-colors">✕</button>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="text-[9px] text-[#003d10] py-6 text-center uppercase tracking-widest">no opportunities</div>}
      </div>
    </div>
  );
}

function LedgerContent({ earnings }: { earnings: Earning[] }) {
  return (
    <div>
      {earnings.length === 0 && <div className="text-[9px] text-[#003d10] py-6 text-center uppercase tracking-widest">no earnings yet</div>}
      {earnings.slice(0,80).map(e => (
        <div key={e.id} className="flex items-center gap-3 py-1.5 px-2 border-b border-white/[0.04] last:border-0">
          <span className="text-[9px] text-[#004d14] tabular-nums w-20 shrink-0">{e.earned_date}</span>
          <span className="text-[11px] text-[#00aa28] flex-1 truncate">{e.description}</span>
          <span className="text-[9px] text-[#007a1f] shrink-0">{e.engine}</span>
          <span className={`text-[11px] tabular-nums shrink-0 ${e.status==="collected" ? "text-[#00ff41]" : "text-[#f59e0b]"}`}>{usd(e.amount_usd)}</span>
        </div>
      ))}
    </div>
  );
}

function AssetsContent({ assets }: { assets: Asset[] }) {
  return (
    <div>
      {assets.length === 0 && <div className="text-[9px] text-[#003d10] py-6 text-center uppercase tracking-widest">no assets yet</div>}
      {assets.map(a => (
        <div key={a.id} className="flex items-center gap-3 py-1.5 px-2 border-b border-white/[0.04] last:border-0">
          <span className="text-[11px] text-[#00aa28] flex-1 truncate">{a.name}</span>
          <span className="text-[9px] text-[#004d14]">{a.marketplace ?? "—"}</span>
          <span className="text-[9px] text-[#007a1f]">{a.status}</span>
          {a.total_revenue > 0 && <span className="text-[11px] text-[#00ff41] tabular-nums">{usd(a.total_revenue)}</span>}
        </div>
      ))}
    </div>
  );
}

function ApprovalsContent({ approvals, onApprove, onReject }: { approvals: Approval[]; onApprove:(id:string)=>void; onReject:(id:string)=>void; }) {
  return (
    <div className="space-y-2">
      {approvals.length === 0 && <div className="text-[9px] text-[#003d10] py-6 text-center uppercase tracking-widest">no pending approvals</div>}
      {approvals.map(a => (
        <div key={a.id} className="border border-[#f59e0b]/15 bg-[#f59e0b]/[0.02] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-[#f59e0b]">{a.title}</p>
              {a.description && <p className="text-[9px] text-[#007a1f] mt-0.5 line-clamp-2">{a.description}</p>}
              {a.action_url && (
                <a href={a.action_url} target="_blank" rel="noopener noreferrer"
                  className="text-[9px] text-[#67e8f9]/50 hover:text-[#67e8f9] mt-0.5 block truncate">
                  ↗ {a.action_url.replace("https://github.com/","gh/")}
                </a>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => onApprove(a.id)} className="text-[9px] font-semibold border border-[#00ff41]/30 text-[#00ff41] hover:bg-[#00ff41]/10 px-2 py-0.5 transition-colors uppercase tracking-wider">ok</button>
              <button onClick={() => onReject(a.id)} className="text-[9px] border border-[#f87171]/20 text-[#f87171]/60 hover:text-[#f87171] hover:bg-[#f87171]/10 px-2 py-0.5 transition-colors uppercase tracking-wider">✕</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LogContent({ activity }: { activity: ActivityEntry[] }) {
  return (
    <div>
      {activity.slice(0,100).map(a => {
        const ts = new Date(a.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
        const col = a.status === "ok" ? "text-[#00aa28]" : a.status === "warning" ? "text-[#f59e0b]" : "text-[#f87171]";
        return (
          <div key={a.id} className="flex items-baseline gap-2 py-0.5 px-1 border-b border-white/[0.03] last:border-0">
            <span className="text-[9px] text-[#003d10] tabular-nums w-10 shrink-0">{ts}</span>
            <span className={`text-[10px] ${col} leading-relaxed`}>{a.detail ?? a.action}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function IncomeDashboard({ summary, allEarnings, allAssets, userId, pipelineItems }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<DetailTab>("scan");
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<string|null>(null);
  const [, start] = useTransition();

  // Derived
  const activeMissions  = pipelineItems.filter(w => !["done","failed","cancelled"].includes(w.status)).length;
  const pendingQueue    = summary.workQueue.filter(w => w.status === "pending");
  const submittedCount  = pipelineItems.filter(w => w.status === "submitted").length;
  const doneCount       = pipelineItems.filter(w => w.status === "done").length;
  const paidCount       = allEarnings.filter(e => e.status === "collected").length;
  const allTimeUsd      = allEarnings.filter(e => e.status === "collected").reduce((s,e) => s + e.amount_usd, 0);
  const totalAttempted  = submittedCount + doneCount + paidCount;
  const winRate         = totalAttempted > 0 ? Math.round(((doneCount + paidCount) / totalAttempted) * 100) : 0;

  const detailTabs: { id: DetailTab; label: string; count?: number }[] = [
    { id:"scan",      label:"scan",      count: summary.activeOpportunities || undefined },
    { id:"ledger",    label:"ledger",    count: allEarnings.length || undefined },
    { id:"assets",    label:"assets",    count: allAssets.length || undefined },
    { id:"approvals", label:"approvals", count: summary.pendingApprovals || undefined },
    { id:"log",       label:"log" },
  ];

  async function handleDiscover() {
    setDiscovering(true); setDiscoverResult(null);
    try {
      const r = await fetch("/api/income/discover");
      const d = await r.json();
      setDiscoverResult(d.ok ? `+${d.new}` : "err");
      if (d.ok) router.refresh();
    } catch { setDiscoverResult("err"); }
    finally  { setDiscovering(false); }
  }

  return (
    <div className="bg-black font-mono text-[#009922] -mx-4 -mt-6 -mb-6 min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="max-w-[1700px] mx-auto px-5 pt-4 pb-10">

        {/* Scan progress line */}
        {discovering && (
          <div className="h-px bg-[#001a08] mb-0 relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 h-full bg-[#00ff41]/60 scan-bar" />
          </div>
        )}

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-[#00ff41] text-sm font-semibold tracking-[0.12em] uppercase">bounty engine</span>
              {discovering && (
                <span className="text-[8px] text-[#67e8f9] border border-[#67e8f9]/30 px-1.5 py-0.5 uppercase tracking-widest t-blink">scanning</span>
              )}
              {discoverResult && !discovering && (
                <span className="text-[9px] text-[#4ade80]">{discoverResult} new</span>
              )}
            </div>
            <p className="text-[9px] text-[#004d14] mt-0.5 tracking-wider">automated bounty discovery · semi-passive income pipeline</p>
          </div>
          <button onClick={handleDiscover} disabled={discovering}
            className="text-[9px] font-semibold uppercase tracking-widest px-3 py-1.5 border border-[#007a1f]/50 text-[#00cc33] hover:bg-[#007a1f]/15 hover:border-[#00cc33]/50 disabled:opacity-30 transition-all shrink-0">
            {discovering ? "scanning..." : "scan now"}
          </button>
        </div>

        {/* ── Stat row ──────────────────────────────────────────────────── */}
        <StatRow
          summary={summary} activeMissions={activeMissions} pendingCount={pendingQueue.length}
          paidCount={paidCount} winRate={winRate} allTimeUsd={allTimeUsd}
        />

        {/* ── Agent CTA ─────────────────────────────────────────────────── */}
        {pendingQueue.length > 0 && (
          <AgentCTA count={pendingQueue.length} projected={summary.queueProjectedUsd} />
        )}

        {/* ── Main two-panel ─────────────────────────────────────────────── */}
        <div className="flex gap-4 items-start">

          {/* Left: missions + queue */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[8px] text-[#007a1f] uppercase tracking-widest">active missions</span>
              <span className="text-[8px] text-[#004d14]">{activeMissions}</span>
            </div>
            <Missions userId={userId} initialItems={pipelineItems} />

            {pendingQueue.length > 0 && (
              <div className="mt-4">
                <Queue items={pendingQueue} />
              </div>
            )}
          </div>

          {/* Right: terminal feed — explicit height required for h-full inside */}
          <div className="w-[380px] xl:w-[420px] shrink-0" style={{ height: 620 }}>
            <IncomeTerminalFeed
              initialEntries={summary.recentActivity}
              lastDiscoveryRun={summary.lastDiscoveryRun}
            />
          </div>
        </div>

        {/* ── Detail section ──────────────────────────────────────────────── */}
        <div className="mt-6 pt-4 border-t border-white/[0.05]">
          <div className="flex border-b border-white/[0.05] mb-4">
            {detailTabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-[9px] uppercase tracking-widest transition-colors ${
                  tab === t.id
                    ? "text-[#00ff41] border-b border-[#00ff41]"
                    : "text-[#007a1f] hover:text-[#00aa28]"
                }`}>
                {t.label}{t.count ? ` (${t.count})` : ""}
              </button>
            ))}
          </div>
          {tab === "scan" && (
            <ScanContent
              opps={summary.topOpportunities as Opportunity[]}
              onDismiss={id => start(() => dismissOpportunity(id).then(() => router.refresh()))}
              onQueue={id => start(() => markOpportunityInProgress(id).then(() => router.refresh()))}
            />
          )}
          {tab === "ledger"    && <LedgerContent earnings={allEarnings} />}
          {tab === "assets"    && <AssetsContent assets={allAssets} />}
          {tab === "approvals" && (
            <ApprovalsContent
              approvals={summary.approvals as Approval[]}
              onApprove={id => start(() => approveAction(id).then(() => router.refresh()))}
              onReject={id  => start(() => rejectAction(id).then(() => router.refresh()))}
            />
          )}
          {tab === "log" && <LogContent activity={summary.recentActivity} />}
        </div>

      </div>
    </div>
  );
}

// ── Agent CTA (outside main to keep it clean) ─────────────────────────────────

function AgentCTA({ count, projected }: { count: number; projected: number }) {
  const [copied, setCopied] = useState(false);
  const cmd = "node scripts/income-agent.mjs";
  function copy() { navigator.clipboard.writeText(cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }
  return (
    <div className="border border-[#007a1f]/30 bg-[#007a1f]/[0.06] mb-4 px-4 py-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="text-[#00ff41] text-[10px] font-semibold uppercase tracking-wider t-pulse">
          {count} bounties ready
        </span>
        {projected > 0 && <span className="text-[9px] text-[#007a1f]">{`${projected > 0 ? usd(projected) : ""} projected`}</span>}
      </div>
      <button onClick={copy}
        className="text-[9px] font-mono text-[#004d14] hover:text-[#00aa28] border border-[#003d10] hover:border-[#007a1f] px-2 py-0.5 transition-colors whitespace-nowrap">
        {copied ? "✓ copied" : cmd}
      </button>
    </div>
  );
}

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
@keyframes fadeDown { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:translateY(0) } }
@keyframes slowPulse { 0%,100%{opacity:1} 50%{opacity:.35} }
@keyframes scanProg { from{transform:scaleX(0)} to{transform:scaleX(1)} }
.fade-down  { animation: fadeDown .3s ease-out }
.slow-pulse { animation: slowPulse 2s ease-in-out infinite }
.scan-prog  { transform-origin:left; animation: scanProg 55s linear forwards }
`;

// ── helpers ─────────────────────────────────────────────────────────────────

function usd(n: number) { return n === 0 ? "$0" : n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`; }

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

// ── status config ─────────────────────────────────────────────────────────────

const S_LABEL: Record<string, string> = {
  pending: "waiting", in_progress: "working", review: "review",
  submitted: "pr open", done: "merged", failed: "failed", cancelled: "—",
};
const S_TEXT: Record<string, string> = {
  pending: "text-zinc-600", in_progress: "text-white", review: "text-zinc-400",
  submitted: "text-zinc-400", done: "text-white", failed: "text-zinc-700", cancelled: "text-zinc-800",
};
const S_BORDER: Record<string, string> = {
  pending: "border-l-zinc-800", in_progress: "border-l-white", review: "border-l-zinc-500",
  submitted: "border-l-zinc-500", done: "border-l-zinc-300", failed: "border-l-zinc-900", cancelled: "border-l-zinc-900",
};

// ── mission card ──────────────────────────────────────────────────────────────

function MissionCard({ item, fresh }: { item: any; fresh: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const st = item.status as string;
  return (
    <div className={`border-l-2 ${S_BORDER[st] ?? "border-l-zinc-900"} pl-4 py-3 ${fresh ? "fade-down" : ""}`}>
      <div className="flex items-start gap-4">
        {/* status */}
        <span className={`text-xs uppercase tracking-widest shrink-0 w-16 mt-0.5 ${S_TEXT[st] ?? "text-zinc-700"} ${st === "in_progress" ? "slow-pulse" : ""}`}>
          {S_LABEL[st] ?? st}
        </span>
        {/* body */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white leading-snug">{item.title}</p>
          {/* progress */}
          {st === "in_progress" && (
            <div className="mt-2">
              <div className="relative h-px bg-zinc-800 w-full">
                <div className="absolute inset-y-0 left-0 bg-white transition-all duration-700" style={{ width: `${item.progress_pct ?? 0}%` }} />
              </div>
              <span className="text-xs text-zinc-600 mt-0.5 block">{item.progress_pct ?? 0}%  {item.progress_note ?? ""}</span>
            </div>
          )}
          {/* PR link */}
          {item.pr_url && st !== "done" && (
            <a href={item.pr_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors mt-1 block truncate">
              ↗ {item.pr_url.replace("https://github.com/", "github.com/")}
            </a>
          )}
          {/* mark paid */}
          {st === "done" && (
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-zinc-700">awaiting payment</span>
              <button disabled={pending} onClick={() => start(async () => { await markBountyPaid(item.id); setGone(true); router.refresh(); })}
                className="text-xs border border-zinc-700 text-zinc-400 hover:border-zinc-400 hover:text-white px-2 py-0.5 transition-colors disabled:opacity-30 slow-pulse">
                mark paid
              </button>
            </div>
          )}
        </div>
        {/* reward */}
        {item.expected_usd > 0 && (
          <span className="text-sm font-medium text-white tabular-nums shrink-0">{usd(item.expected_usd)}</span>
        )}
      </div>
    </div>
  );
}

// ── realtime missions ─────────────────────────────────────────────────────────

function Missions({ initialItems, userId }: { initialItems: any[]; userId: string }) {
  const [items, setItems] = useState<any[]>(initialItems);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    const sb = createClient();
    const ch = (sb as any).channel(`m_${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "income_work_queue", filter: `user_id=eq.${userId}` },
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

  const active = items.filter(i => ["pending", "in_progress", "review", "submitted", "done"].includes(i.status));
  if (!active.length) return <p className="text-sm text-zinc-700 py-4">No active missions.</p>;
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
          <div key={item.id} className="py-2.5 flex items-center gap-4">
            <span className="text-sm text-zinc-700 tabular-nums w-5 text-right shrink-0">{i + 1}</span>
            {score != null && <span className="text-xs text-zinc-600 w-6 tabular-nums shrink-0">{score}</span>}
            <span className="text-sm text-zinc-400 flex-1 truncate">{item.title}</span>
            {item.expected_usd > 0 && <span className="text-sm text-white tabular-nums shrink-0">{usd(item.expected_usd)}</span>}
          </div>
        );
      })}
      {items.length > 15 && <p className="text-xs text-zinc-700 pt-2">+{items.length - 15} more</p>}
    </div>
  );
}

// ── header stats ──────────────────────────────────────────────────────────────

function HeaderStats({ summary, paidCount, winRate, allTimeUsd }: {
  summary: IncomeSummary; paidCount: number; winRate: number; allTimeUsd: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const pct = Math.round(summary.weeklyProgress * 100);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-2">
      {/* Weekly progress */}
      <div>
        <span className="text-lg font-semibold text-white tabular-nums">{usd(summary.collectedThisWeek)}</span>
        <span className="text-sm text-zinc-600 ml-1">/ $600</span>
        <div className="mt-1 relative h-px bg-zinc-800 w-24">
          <div className="absolute inset-y-0 left-0 bg-white transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="text-zinc-800 text-lg select-none">·</div>
      <div>
        <span className="text-lg font-semibold text-white tabular-nums">{summary.workQueue.filter(w => w.status === "pending").length}</span>
        <span className="text-sm text-zinc-600 ml-1">waiting</span>
      </div>
      <div className="text-zinc-800 text-lg select-none">·</div>
      <div>
        <span className="text-lg font-semibold text-white tabular-nums">{winRate}%</span>
        <span className="text-sm text-zinc-600 ml-1">win rate</span>
      </div>
      <div className="text-zinc-800 text-lg select-none">·</div>
      <div>
        <span className="text-sm text-zinc-600">{usd(allTimeUsd)} all-time</span>
      </div>
      <div className="text-zinc-800 text-lg select-none">·</div>
      <div>
        <span className="text-sm text-zinc-600">scan in </span>
        <span className="text-sm text-zinc-400 tabular-nums">{countdown(nextHour(now) - now)}</span>
      </div>
    </div>
  );
}

// ── detail tab content ────────────────────────────────────────────────────────

function ScanContent({ opps, onDismiss, onQueue }: { opps: Opportunity[]; onDismiss(id: string): void; onQueue(id: string): void; }) {
  const [filter, setFilter] = useState<"all" | "discovered" | "queued">("all");
  const list = filter === "all" ? opps : opps.filter(o => o.status === filter);
  return (
    <div>
      <div className="flex gap-3 mb-4">
        {(["all", "discovered", "queued"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-sm transition-colors ${filter === f ? "text-white" : "text-zinc-600 hover:text-zinc-400"}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="divide-y divide-zinc-900">
        {list.slice(0, 80).map(o => (
          <div key={o.id} className="py-2.5 flex items-center gap-4 group">
            <span className="text-sm text-zinc-700 tabular-nums w-6 text-right shrink-0">{o.score}</span>
            <span className="text-xs text-zinc-700 w-14 shrink-0">{o.source}</span>
            <span className="text-sm text-zinc-300 flex-1 truncate">{o.title}</span>
            {o.reward_usd && o.reward_usd > 0 && <span className="text-sm text-white tabular-nums shrink-0">{usd(o.reward_usd)}</span>}
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {o.status === "discovered" && (
                <button onClick={() => onQueue(o.id)} className="text-xs text-zinc-500 hover:text-white transition-colors border border-zinc-800 hover:border-zinc-500 px-2 py-0.5">queue</button>
              )}
              <button onClick={() => onDismiss(o.id)} className="text-xs text-zinc-700 hover:text-zinc-400 transition-colors px-1">✕</button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-zinc-700 py-6">No opportunities. Run a scan.</p>}
      </div>
    </div>
  );
}

function LedgerContent({ earnings }: { earnings: Earning[] }) {
  if (!earnings.length) return <p className="text-sm text-zinc-700 py-6">No earnings yet.</p>;
  return (
    <div className="divide-y divide-zinc-900">
      {earnings.slice(0, 80).map(e => (
        <div key={e.id} className="py-2.5 flex items-center gap-4">
          <span className="text-sm text-zinc-600 tabular-nums w-24 shrink-0">{e.earned_date}</span>
          <span className="text-sm text-zinc-300 flex-1 truncate">{e.description}</span>
          <span className="text-xs text-zinc-600 shrink-0">{e.engine}</span>
          <span className={`text-sm tabular-nums shrink-0 ${e.status === "collected" ? "text-white" : "text-zinc-500"}`}>{usd(e.amount_usd)}</span>
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
        <div key={a.id} className="py-2.5 flex items-center gap-4">
          <span className="text-sm text-zinc-300 flex-1 truncate">{a.name}</span>
          <span className="text-sm text-zinc-600 shrink-0">{a.marketplace ?? "—"}</span>
          <span className="text-xs text-zinc-600 shrink-0">{a.status}</span>
          {a.total_revenue > 0 && <span className="text-sm text-white tabular-nums shrink-0">{usd(a.total_revenue)}</span>}
        </div>
      ))}
    </div>
  );
}

function ApprovalsContent({ approvals, onApprove, onReject }: { approvals: Approval[]; onApprove(id: string): void; onReject(id: string): void; }) {
  if (!approvals.length) return <p className="text-sm text-zinc-700 py-6">No pending approvals.</p>;
  return (
    <div className="space-y-3">
      {approvals.map(a => (
        <div key={a.id} className="border border-zinc-800 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-white">{a.title}</p>
              {a.description && <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{a.description}</p>}
              {a.action_url && (
                <a href={a.action_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-zinc-600 hover:text-zinc-400 mt-1 block truncate">
                  ↗ {a.action_url.replace("https://github.com/", "github.com/")}
                </a>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => onApprove(a.id)} className="text-sm border border-zinc-700 text-zinc-300 hover:border-white hover:text-white px-3 py-1 transition-colors">approve</button>
              <button onClick={() => onReject(a.id)} className="text-sm text-zinc-700 hover:text-zinc-400 px-2 py-1 transition-colors">reject</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export function IncomeDashboard({ summary, allEarnings, allAssets, userId, pipelineItems }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("scan");
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<string | null>(null);
  const [, startT] = useTransition();

  const pendingQueue   = summary.workQueue.filter(w => w.status === "pending");
  const submittedCount = pipelineItems.filter(w => w.status === "submitted").length;
  const doneCount      = pipelineItems.filter(w => w.status === "done").length;
  const paidCount      = allEarnings.filter(e => e.status === "collected").length;
  const allTimeUsd     = allEarnings.filter(e => e.status === "collected").reduce((s, e) => s + e.amount_usd, 0);
  const totalAttempted = submittedCount + doneCount + paidCount;
  const winRate        = totalAttempted > 0 ? Math.round(((doneCount + paidCount) / totalAttempted) * 100) : 0;

  const activeMissions = pipelineItems.filter(w => !["done","failed","cancelled"].includes(w.status)).length;

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
      setDiscoverResult(d.ok ? `+${d.new} new` : "error");
      if (d.ok) router.refresh();
    } catch { setDiscoverResult("error"); }
    finally { setDiscovering(false); }
  }

  return (
    <div className="bg-black text-white font-mono -mx-4 -mt-6 -mb-6 min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="max-w-[960px] mx-auto px-6 py-6">

        {/* scan progress line */}
        {discovering && (
          <div className="h-px bg-zinc-900 mb-6 overflow-hidden">
            <div className="h-full bg-white scan-prog" />
          </div>
        )}

        {/* ── header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-base font-semibold text-white tracking-wide">Bounty Engine</h1>
            <HeaderStats summary={summary} paidCount={paidCount} winRate={winRate} allTimeUsd={allTimeUsd} />
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-1">
            {discoverResult && <span className="text-sm text-zinc-500">{discoverResult}</span>}
            <button onClick={handleDiscover} disabled={discovering}
              className="text-sm border border-zinc-700 text-zinc-400 hover:border-zinc-400 hover:text-white px-3 py-1 transition-colors disabled:opacity-30">
              {discovering ? "scanning…" : "scan"}
            </button>
          </div>
        </div>

        {/* ── agent CTA ───────────────────────────────────────────────── */}
        {pendingQueue.length > 0 && (
          <AgentCTA count={pendingQueue.length} projected={summary.queueProjectedUsd} />
        )}

        {/* ── active missions ──────────────────────────────────────────── */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs text-zinc-500 uppercase tracking-widest">Missions</h2>
            <span className="text-xs text-zinc-700">{activeMissions} active</span>
          </div>
          <Missions userId={userId} initialItems={pipelineItems} />
        </section>

        {/* ── queue ───────────────────────────────────────────────────── */}
        {pendingQueue.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs text-zinc-500 uppercase tracking-widest">Queue</h2>
              <span className="text-xs text-zinc-700">{pendingQueue.length} waiting</span>
            </div>
            <QueueList items={pendingQueue} />
          </section>
        )}

        {/* ── detail tabs ─────────────────────────────────────────────── */}
        <div className="border-t border-zinc-900 pt-6">
          <div className="flex gap-5 mb-6">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`text-sm transition-colors ${tab === t.id ? "text-white" : "text-zinc-600 hover:text-zinc-400"}`}>
                {t.label}{t.count ? ` (${t.count})` : ""}
              </button>
            ))}
          </div>

          {tab === "scan" && (
            <ScanContent
              opps={summary.topOpportunities as Opportunity[]}
              onDismiss={id => startT(() => dismissOpportunity(id).then(() => router.refresh()))}
              onQueue={id => startT(() => markOpportunityInProgress(id).then(() => router.refresh()))}
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
        </div>

      </div>
    </div>
  );
}

// ── agent CTA ─────────────────────────────────────────────────────────────────

function AgentCTA({ count, projected }: { count: number; projected: number }) {
  const [copied, setCopied] = useState(false);
  const cmd = "node scripts/income-agent.mjs";
  function copy() { navigator.clipboard.writeText(cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }
  return (
    <div className="border border-zinc-800 bg-zinc-950 px-4 py-3 mb-6 flex items-center justify-between gap-4">
      <p className="text-sm text-zinc-300 slow-pulse">
        {count} {count === 1 ? "bounty" : "bounties"} ready to work
        {projected > 0 && <span className="text-zinc-600 ml-2 font-normal">{usd(projected)} projected</span>}
      </p>
      <button onClick={copy}
        className="text-sm font-mono text-zinc-600 hover:text-white transition-colors whitespace-nowrap border border-zinc-800 hover:border-zinc-600 px-3 py-1">
        {copied ? "✓ copied" : cmd}
      </button>
    </div>
  );
}

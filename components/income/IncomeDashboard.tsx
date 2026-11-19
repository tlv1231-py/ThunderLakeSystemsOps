"use client";

import { useState, useTransition, useOptimistic } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  dismissOpportunity, queueOpportunity, markOpportunityInProgress,
  approveAction, rejectAction, logEarning, markEarningCollected,
  createAsset, triggerDiscovery,
} from "@/app/(admin)/income/actions";
import type { IncomeSummary, Opportunity, Asset, Earning, WorkItem, Approval, ActivityEntry } from "@/lib/income/types";

type Tab = "overview" | "opportunities" | "queue" | "assets" | "ledger" | "approvals" | "log";

interface Props {
  summary: IncomeSummary;
  allEarnings: Earning[];
  allAssets: Asset[];
}

// ── Color helpers ─────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  algora:    "text-emerald-400 bg-emerald-900/30",
  issuehunt: "text-sky-400 bg-sky-900/30",
  github:    "text-purple-400 bg-purple-900/30",
  manual:    "text-zinc-400 bg-zinc-800",
};

const STATUS_COLORS: Record<string, string> = {
  discovered:  "text-zinc-400 bg-zinc-800",
  analyzing:   "text-sky-400 bg-sky-900/30",
  queued:      "text-blue-400 bg-blue-900/30",
  in_progress: "text-amber-400 bg-amber-900/30",
  submitted:   "text-orange-400 bg-orange-900/30",
  accepted:    "text-emerald-400 bg-emerald-900/30",
  rejected:    "text-red-400 bg-red-900/30",
  paid:        "text-emerald-300 bg-emerald-800/40",
  dismissed:   "text-zinc-700 bg-zinc-900",
  pending:     "text-amber-400 bg-amber-900/30",
  collected:   "text-emerald-400 bg-emerald-900/30",
  draft:       "text-zinc-500 bg-zinc-800",
  ready:       "text-blue-400 bg-blue-900/30",
  published:   "text-emerald-400 bg-emerald-900/30",
  done:        "text-emerald-400 bg-emerald-900/30",
  failed:      "text-red-400 bg-red-900/30",
};

const DIFF_COLORS: Record<string, string> = {
  easy:   "text-emerald-400",
  medium: "text-amber-400",
  hard:   "text-red-400",
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${className}`}>
      {label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : score >= 30 ? "bg-orange-500" : "bg-zinc-600";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-zinc-500">{score}</span>
    </div>
  );
}

function ProgressRing({ value, target, label }: { value: number; target: number; label: string }) {
  const pct = Math.min(1, value / target);
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  const color = pct >= 1 ? "#10b981" : pct >= 0.6 ? "#f59e0b" : pct >= 0.3 ? "#fb923c" : "#71717a";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle cx="46" cy="46" r={r} fill="none" stroke="#27272a" strokeWidth="6" />
        <circle
          cx="46" cy="46" r={r}
          fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 46 46)"
        />
        <text x="46" y="42" textAnchor="middle" dominantBaseline="middle"
          fill="#f4f4f5" fontSize="13" fontWeight="600" fontFamily="ui-monospace">
          {formatCurrency(value)}
        </text>
        <text x="46" y="57" textAnchor="middle" dominantBaseline="middle"
          fill="#71717a" fontSize="9">
          of {formatCurrency(target)}
        </text>
      </svg>
      <span className="text-[11px] text-zinc-500">{label}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function IncomeDashboard({ summary, allEarnings, allAssets }: Props) {
  const [tab, setTab]   = useState<Tab>("overview");
  const [pending, startTransition] = useTransition();
  const [discovering, setDiscovering] = useState(false);
  const [showLogEarning, setShowLogEarning] = useState(false);
  const [oppFilter, setOppFilter] = useState<string>("all");

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview",      label: "Overview" },
    { id: "opportunities", label: "Opportunities", count: summary.activeOpportunities },
    { id: "queue",         label: "Work Queue",    count: summary.workQueue.filter(w => w.status !== "done").length },
    { id: "assets",        label: "Assets",        count: allAssets.length },
    { id: "ledger",        label: "Ledger",        count: allEarnings.length },
    { id: "approvals",     label: "Approvals",     count: summary.pendingApprovals || undefined },
    { id: "log",           label: "Activity" },
  ];

  async function handleDiscover() {
    setDiscovering(true);
    try { await triggerDiscovery(); } finally {
      setTimeout(() => setDiscovering(false), 3000);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Income Operations</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {summary.lastDiscoveryRun
              ? `Last discovery: ${new Date(summary.lastDiscoveryRun).toLocaleString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}`
              : "Discovery not yet run"}
            {" · "}{summary.activeOpportunities} active opportunities
          </p>
        </div>
        <button
          onClick={handleDiscover}
          disabled={discovering}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          {discovering ? "Scanning…" : "⟳ Run Discovery"}
        </button>
      </div>

      {/* ── Approval banner ─────────────────────────────────────────────── */}
      {summary.pendingApprovals > 0 && (
        <div
          className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-amber-800/60 bg-amber-950/30 cursor-pointer"
          onClick={() => setTab("approvals")}
        >
          <span className="text-sm text-amber-400 font-medium">
            ⚠ {summary.pendingApprovals} action{summary.pendingApprovals > 1 ? "s" : ""} require your approval
          </span>
          <span className="text-xs text-amber-700">View →</span>
        </div>
      )}

      {/* ── KPI tiles ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="This Week" value={formatCurrency(summary.collectedThisWeek)}
          sub={`Target: ${formatCurrency(summary.weeklyTarget)}`}
          accent={summary.weeklyProgress >= 1 ? "emerald" : "default"} />
        <KpiCard label="30-Day Collected" value={formatCurrency(summary.collectedLast30Days)}
          sub={summary.daysSinceLastPayment != null ? `${summary.daysSinceLastPayment}d since last payment` : "No payments yet"} />
        <KpiCard label="Pending Payouts" value={formatCurrency(summary.pendingTotal)}
          sub={`${allEarnings.filter(e => e.status === "pending").length} items`}
          accent={summary.pendingTotal > 0 ? "amber" : "default"} />
        <KpiCard label="Effective Rate"
          value={summary.effectiveHourly ? `${formatCurrency(summary.effectiveHourly)}/hr` : "—"}
          sub={`${summary.hoursInvested.toFixed(1)} hrs invested`} />
      </div>

      {/* ── Target progress ring ────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <ProgressRing
            value={summary.collectedThisWeek}
            target={summary.weeklyTarget}
            label="Weekly target"
          />
          <div className="flex flex-wrap gap-6">
            {(["bounty", "asset", "product", "content"] as const).map(eng => (
              <div key={eng} className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">{eng}</p>
                <p className="text-base font-semibold tabular-nums text-zinc-100">
                  {formatCurrency(summary.byEngine[eng]?.collected ?? 0)}
                </p>
                {(summary.byEngine[eng]?.pending ?? 0) > 0 && (
                  <p className="text-[11px] text-amber-600 tabular-nums">
                    +{formatCurrency(summary.byEngine[eng].pending)} pending
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-600">Gap to target</p>
            <p className="text-xl font-semibold text-zinc-100 tabular-nums">
              {formatCurrency(Math.max(0, summary.weeklyTarget - summary.collectedThisWeek))}
            </p>
            <p className="text-[11px] text-zinc-600 mt-0.5">needed this week</p>
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-800">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-amber-500 text-zinc-100 font-medium"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                  t.id === "approvals" ? "bg-amber-800 text-amber-300" : "bg-zinc-800 text-zinc-400"
                }`}>{t.count}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      {tab === "overview"      && <OverviewTab summary={summary} onTabChange={setTab} />}
      {tab === "opportunities" && <OpportunitiesTab opps={summary.topOpportunities} filter={oppFilter} onFilterChange={setOppFilter} />}
      {tab === "queue"         && <WorkQueueTab queue={summary.workQueue} />}
      {tab === "assets"        && <AssetsTab assets={allAssets} />}
      {tab === "ledger"        && <LedgerTab earnings={allEarnings} />}
      {tab === "approvals"     && <ApprovalsTab approvals={summary.approvals} />}
      {tab === "log"           && <ActivityTab entries={summary.recentActivity} />}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ summary, onTabChange }: { summary: IncomeSummary; onTabChange: (t: Tab) => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top opportunities */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-300">Top Opportunities</h3>
          <button onClick={() => onTabChange("opportunities")} className="text-xs text-zinc-600 hover:text-zinc-400">View all →</button>
        </div>
        <div className="space-y-2">
          {summary.topOpportunities.slice(0, 6).map(opp => (
            <OppRow key={opp.id} opp={opp} compact />
          ))}
          {summary.topOpportunities.length === 0 && (
            <p className="text-xs text-zinc-700 py-2">No opportunities yet — run Discovery to find bounties</p>
          )}
        </div>
      </div>

      {/* Work queue */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-300">Active Work</h3>
          <button onClick={() => onTabChange("queue")} className="text-xs text-zinc-600 hover:text-zinc-400">View all →</button>
        </div>
        <div className="space-y-2">
          {summary.workQueue.filter(w => w.status !== "done" && w.status !== "cancelled").slice(0, 5).map(w => (
            <div key={w.id} className="flex items-center justify-between gap-3 py-1.5 border-t border-zinc-800/80 first:border-0">
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-300 truncate">{w.title}</p>
                <p className="text-[10px] text-zinc-600 capitalize">{w.engine} · {w.hours_invested.toFixed(1)}h invested</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge label={w.status} className={STATUS_COLORS[w.status] ?? "text-zinc-500 bg-zinc-800"} />
                {w.expected_usd && <span className="text-xs tabular-nums text-emerald-500">{formatCurrency(w.expected_usd)}</span>}
              </div>
            </div>
          ))}
          {summary.workQueue.length === 0 && (
            <p className="text-xs text-zinc-700 py-2">No active work — queue an opportunity to begin</p>
          )}
        </div>
      </div>

      {/* Recent earnings */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-300">Recent Earnings</h3>
          <button onClick={() => onTabChange("ledger")} className="text-xs text-zinc-600 hover:text-zinc-400">Full ledger →</button>
        </div>
        <div className="space-y-1">
          {summary.recentEarnings.slice(0, 6).map(e => (
            <div key={e.id} className="flex items-center justify-between py-1.5 border-t border-zinc-800/80 first:border-0">
              <div>
                <p className="text-xs text-zinc-300">{e.description}</p>
                <p className="text-[10px] text-zinc-600">{e.source} · {e.earned_date}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge label={e.status} className={STATUS_COLORS[e.status] ?? ""} />
                <span className={`text-sm font-semibold tabular-nums ${e.status === "collected" ? "text-emerald-400" : "text-amber-400"}`}>
                  {formatCurrency(e.amount_usd)}
                </span>
              </div>
            </div>
          ))}
          {summary.recentEarnings.length === 0 && (
            <p className="text-xs text-zinc-700 py-2">No earnings logged yet</p>
          )}
        </div>
      </div>

      {/* Activity log preview */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-300">System Activity</h3>
          <button onClick={() => onTabChange("log")} className="text-xs text-zinc-600 hover:text-zinc-400">Full log →</button>
        </div>
        <div className="space-y-1 font-mono">
          {summary.recentActivity.slice(0, 8).map(a => (
            <div key={a.id} className="flex items-baseline gap-2 py-0.5">
              <span className="text-[10px] text-zinc-700 shrink-0 tabular-nums">
                {new Date(a.created_at).toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", hour12:false })}
              </span>
              <span className={`text-[10px] font-semibold uppercase shrink-0 ${
                a.status === "error" ? "text-red-500" : a.status === "warning" ? "text-amber-500" : "text-zinc-600"
              }`}>{a.engine ?? "SYS"}</span>
              <span className="text-[11px] text-zinc-400 truncate">{a.detail ?? a.action}</span>
            </div>
          ))}
          {summary.recentActivity.length === 0 && (
            <p className="text-xs text-zinc-700 py-2">No activity yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Opportunities tab ─────────────────────────────────────────────────────────

function OpportunitiesTab({
  opps, filter, onFilterChange,
}: {
  opps: Opportunity[];
  filter: string;
  onFilterChange: (f: string) => void;
}) {
  const [pending, startTransition] = useTransition();

  const filtered = opps.filter(o => {
    if (filter === "all")    return true;
    if (filter === "high")   return o.score >= 65;
    if (filter === "cash")   return (o.reward_usd ?? 0) > 0;
    if (filter === "easy")   return o.difficulty === "easy";
    if (filter === "queued") return o.status === "queued";
    return o.source === filter;
  });

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {["all", "high", "cash", "easy", "algora", "issuehunt", "github", "queued"].map(f => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
              filter === f
                ? "border-amber-700 bg-amber-900/30 text-amber-300"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {f === "high" ? "High Score" : f === "cash" ? "Has Reward" : f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "all" && <span className="ml-1 text-zinc-700">({opps.length})</span>}
          </button>
        ))}
      </div>

      {/* Opportunity list */}
      <div className="space-y-2">
        {filtered.map(opp => <OppRow key={opp.id} opp={opp} />)}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-8 text-center">
            <p className="text-sm text-zinc-500">No opportunities match this filter</p>
            <p className="text-xs text-zinc-700 mt-1">Try running discovery to find new bounties</p>
          </div>
        )}
      </div>
    </div>
  );
}

function OppRow({ opp, compact = false }: { opp: Opportunity; compact?: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/80 ${compact ? "p-3" : "p-4"} transition-colors hover:border-zinc-700`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge label={opp.source} className={SOURCE_COLORS[opp.source] ?? "text-zinc-400 bg-zinc-800"} />
            {opp.language && (
              <span className="text-[10px] text-zinc-600 font-mono">{opp.language}</span>
            )}
            {opp.difficulty && (
              <span className={`text-[10px] font-semibold uppercase ${DIFF_COLORS[opp.difficulty] ?? "text-zinc-500"}`}>
                {opp.difficulty}
              </span>
            )}
            {opp.status !== "discovered" && (
              <Badge label={opp.status} className={STATUS_COLORS[opp.status] ?? "text-zinc-500 bg-zinc-800"} />
            )}
          </div>
          <a
            href={opp.url} target="_blank" rel="noopener noreferrer"
            className="mt-1 block text-sm font-medium text-zinc-200 hover:text-amber-400 transition-colors line-clamp-2"
          >
            {opp.title}
          </a>
          {!compact && opp.description && (
            <p className="mt-1 text-xs text-zinc-600 line-clamp-2">{opp.description}</p>
          )}
          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
            <ScoreBar score={opp.score} />
            {opp.estimated_hours != null && (
              <span className="text-[11px] text-zinc-600">~{opp.estimated_hours}h</span>
            )}
            {opp.hourly_rate_est != null && (
              <span className="text-[11px] text-emerald-600 font-semibold tabular-nums">
                {formatCurrency(opp.hourly_rate_est)}/hr
              </span>
            )}
            {opp.open_prs > 0 && (
              <span className="text-[11px] text-orange-700">{opp.open_prs} PR{opp.open_prs > 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {opp.reward_usd != null && (
            <span className="text-lg font-bold tabular-nums text-emerald-400">
              {formatCurrency(opp.reward_usd)}
            </span>
          )}
          {!compact && (
            <div className="flex gap-1.5">
              {opp.status === "discovered" && (
                <>
                  <button
                    onClick={() => startTransition(() => queueOpportunity(opp.id))}
                    disabled={pending}
                    className="px-2 py-1 text-[11px] font-medium rounded bg-amber-800/50 text-amber-300 hover:bg-amber-800 transition-colors disabled:opacity-50"
                  >
                    Queue
                  </button>
                  <button
                    onClick={() => startTransition(() => dismissOpportunity(opp.id))}
                    disabled={pending}
                    className="px-2 py-1 text-[11px] rounded text-zinc-700 hover:text-zinc-500 transition-colors"
                  >
                    Dismiss
                  </button>
                </>
              )}
              {opp.status === "queued" && (
                <button
                  onClick={() => startTransition(() => markOpportunityInProgress(opp.id))}
                  disabled={pending}
                  className="px-2 py-1 text-[11px] font-medium rounded bg-blue-800/50 text-blue-300 hover:bg-blue-800 transition-colors"
                >
                  Start Work
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Work queue tab ────────────────────────────────────────────────────────────

function WorkQueueTab({ queue }: { queue: WorkItem[] }) {
  const active  = queue.filter(w => !["done","cancelled","failed"].includes(w.status));
  const done    = queue.filter(w => ["done","cancelled","failed"].includes(w.status));

  return (
    <div className="space-y-4">
      {active.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-8 text-center">
          <p className="text-sm text-zinc-500">No active work items</p>
          <p className="text-xs text-zinc-700 mt-1">Queue an opportunity from the Opportunities tab to begin</p>
        </div>
      )}
      {active.map(w => (
        <div key={w.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge label={w.engine} className="text-zinc-500 bg-zinc-800" />
                <Badge label={w.status} className={STATUS_COLORS[w.status] ?? "text-zinc-500 bg-zinc-800"} />
                <span className="text-[11px] text-zinc-600">P{w.priority}</span>
              </div>
              <p className="text-sm font-medium text-zinc-200">{w.title}</p>
              {w.description && <p className="text-xs text-zinc-600 mt-0.5 line-clamp-2">{w.description}</p>}
              <div className="mt-2 flex items-center gap-4 text-[11px] text-zinc-600">
                <span>{w.hours_invested.toFixed(1)}h invested{w.estimated_hours ? ` / ${w.estimated_hours}h est` : ""}</span>
                {w.result && <span className="text-zinc-500 truncate max-w-xs">{w.result}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              {w.expected_usd != null && (
                <span className="text-base font-semibold tabular-nums text-emerald-400">{formatCurrency(w.expected_usd)}</span>
              )}
              {w.requires_approval && (
                <div className="text-right">
                  <p className="text-[10px] text-amber-500 font-semibold">APPROVAL NEEDED</p>
                  <p className="text-[10px] text-zinc-600 max-w-[180px] text-right">{w.approval_action}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
      {done.length > 0 && (
        <details className="text-xs text-zinc-700">
          <summary className="cursor-pointer hover:text-zinc-500 select-none">
            {done.length} completed / cancelled items
          </summary>
          <div className="mt-2 space-y-1">
            {done.map(w => (
              <div key={w.id} className="flex items-center gap-2 py-1 border-t border-zinc-900">
                <Badge label={w.status} className={STATUS_COLORS[w.status] ?? ""} />
                <span className="text-zinc-600 truncate">{w.title}</span>
                {w.expected_usd && <span className="text-zinc-700 tabular-nums ml-auto">{formatCurrency(w.expected_usd)}</span>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Assets tab ────────────────────────────────────────────────────────────────

function AssetsTab({ assets }: { assets: Asset[] }) {
  const engines = ["asset", "product", "content"] as const;

  return (
    <div className="space-y-6">
      {engines.map(eng => {
        const list = assets.filter(a => a.engine === eng);
        if (list.length === 0 && eng !== "asset") return null;
        return (
          <div key={eng}>
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Engine {eng === "asset" ? "B — Digital Assets" : eng === "product" ? "C — Software Products" : "D — Content"}
            </h3>
            {list.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4 text-xs text-zinc-700">
                {eng === "asset" && "Build Tailwind kits, icon packs, templates — package and list on Gumroad or Itch.io"}
                {eng === "product" && "Build VS Code extensions, npm utilities, CLI tools — distribute free-tier marketplaces"}
                {eng === "content" && "Educational videos, data explainers — YouTube AdSense + affiliate"}
              </div>
            ) : (
              <div className="space-y-2">
                {list.map(a => (
                  <div key={a.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge label={a.status} className={STATUS_COLORS[a.status] ?? ""} />
                          {a.marketplace && <span className="text-[10px] text-zinc-600">{a.marketplace}</span>}
                          {a.category && <span className="text-[10px] text-zinc-700">{a.category}</span>}
                        </div>
                        <p className="text-sm font-medium text-zinc-200">{a.name}</p>
                        {a.description && <p className="text-xs text-zinc-600 mt-0.5">{a.description}</p>}
                        {a.listing_url && (
                          <a href={a.listing_url} target="_blank" rel="noopener noreferrer"
                            className="text-[11px] text-sky-500 hover:underline mt-1 block truncate max-w-xs">
                            {a.listing_url}
                          </a>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums text-emerald-400">{formatCurrency(a.total_revenue)}</p>
                        <p className="text-[11px] text-zinc-600">{a.total_sales} sales</p>
                        {a.quality_score && <p className="text-[11px] text-zinc-700">Q{a.quality_score}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Ledger tab ────────────────────────────────────────────────────────────────

function LedgerTab({ earnings }: { earnings: Earning[] }) {
  const [pending, startTransition] = useTransition();
  const collected = earnings.filter(e => e.status === "collected");
  const pendingList = earnings.filter(e => e.status === "pending");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Total Collected</p>
          <p className="text-xl font-semibold text-emerald-400 tabular-nums mt-1">
            {formatCurrency(collected.reduce((s, e) => s + e.amount_usd, 0))}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Pending</p>
          <p className="text-xl font-semibold text-amber-400 tabular-nums mt-1">
            {formatCurrency(pendingList.reduce((s, e) => s + e.amount_usd, 0))}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Total Records</p>
          <p className="text-xl font-semibold text-zinc-100 tabular-nums mt-1">{earnings.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Collected Records</p>
          <p className="text-xl font-semibold text-zinc-100 tabular-nums mt-1">{collected.length}</p>
        </div>
      </div>

      {earnings.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-8 text-center">
          <p className="text-sm text-zinc-500">No earnings logged yet</p>
          <p className="text-xs text-zinc-700 mt-1">Log your first earning when you receive payment</p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] text-zinc-600 uppercase tracking-wide font-medium">Date</th>
                <th className="px-4 py-2.5 text-left text-[10px] text-zinc-600 uppercase tracking-wide font-medium">Description</th>
                <th className="px-4 py-2.5 text-left text-[10px] text-zinc-600 uppercase tracking-wide font-medium">Source</th>
                <th className="px-4 py-2.5 text-left text-[10px] text-zinc-600 uppercase tracking-wide font-medium">Status</th>
                <th className="px-4 py-2.5 text-right text-[10px] text-zinc-600 uppercase tracking-wide font-medium">Amount</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {earnings.map(e => (
                <tr key={e.id} className="bg-zinc-950 hover:bg-zinc-900/60">
                  <td className="px-4 py-2.5 text-xs text-zinc-500 tabular-nums whitespace-nowrap">{e.earned_date}</td>
                  <td className="px-4 py-2.5 text-xs text-zinc-300">{e.description}</td>
                  <td className="px-4 py-2.5 text-xs text-zinc-600">{e.source}</td>
                  <td className="px-4 py-2.5">
                    <Badge label={e.status} className={STATUS_COLORS[e.status] ?? ""} />
                  </td>
                  <td className={`px-4 py-2.5 text-sm font-semibold tabular-nums text-right ${
                    e.status === "collected" ? "text-emerald-400" : "text-amber-400"
                  }`}>
                    {formatCurrency(e.amount_usd)}
                  </td>
                  <td className="px-2 py-2.5">
                    {e.status === "pending" && (
                      <button
                        onClick={() => startTransition(() => markEarningCollected(e.id))}
                        disabled={pending}
                        className="text-[10px] text-emerald-700 hover:text-emerald-500 transition-colors"
                        title="Mark collected"
                      >
                        ✓ Collected
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Approvals tab ─────────────────────────────────────────────────────────────

function ApprovalsTab({ approvals }: { approvals: Approval[] }) {
  const [pending, startTransition] = useTransition();

  if (approvals.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-8 text-center">
        <p className="text-sm text-zinc-500">No pending approvals</p>
        <p className="text-xs text-zinc-700 mt-1">When the system prepares a submission, it will appear here for your review</p>
      </div>
    );
  }

  const ACTION_TYPE_LABELS: Record<string, string> = {
    register_account: "Create Account",
    submit_pr:        "Submit PR",
    publish_asset:    "Publish Asset",
    claim_bounty:     "Claim Bounty",
    verify_identity:  "Verify Identity",
  };

  return (
    <div className="space-y-3">
      {approvals.map(a => (
        <div key={a.id} className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge label={ACTION_TYPE_LABELS[a.action_type] ?? a.action_type} className="text-amber-400 bg-amber-900/40" />
                <span className="text-[11px] text-zinc-600">P{a.priority}</span>
              </div>
              <p className="text-sm font-medium text-zinc-200">{a.title}</p>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed whitespace-pre-wrap">{a.description}</p>
              {a.action_url && (
                <a href={a.action_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-sky-500 hover:underline mt-1.5 block">
                  {a.action_url}
                </a>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={() => startTransition(() => approveAction(a.id))}
                disabled={pending}
                className="px-3 py-1 text-xs font-medium rounded-lg bg-emerald-800/50 text-emerald-300 hover:bg-emerald-800 transition-colors disabled:opacity-50"
              >
                ✓ Done
              </button>
              <button
                onClick={() => startTransition(() => rejectAction(a.id))}
                disabled={pending}
                className="px-3 py-1 text-xs rounded-lg text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Activity log tab ──────────────────────────────────────────────────────────

function ActivityTab({ entries }: { entries: ActivityEntry[] }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {entries.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-zinc-500">No activity logged yet</p>
        </div>
      ) : (
        <table className="w-full text-xs font-mono">
          <tbody className="divide-y divide-zinc-800/60">
            {entries.map(a => (
              <tr key={a.id} className="hover:bg-zinc-800/30">
                <td className="px-4 py-2 text-zinc-700 whitespace-nowrap tabular-nums w-[7rem]">
                  {new Date(a.created_at).toLocaleString("en-US", {
                    month:"numeric", day:"numeric",
                    hour:"2-digit", minute:"2-digit", hour12:false,
                  })}
                </td>
                <td className={`px-3 py-2 w-[6rem] font-semibold uppercase ${
                  a.status === "error" ? "text-red-500" : a.status === "warning" ? "text-amber-500" : "text-zinc-600"
                }`}>
                  {a.engine ?? "SYS"}
                </td>
                <td className="px-3 py-2 text-zinc-500">{a.action}</td>
                <td className="px-3 py-2 text-zinc-400">{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent = "default",
}: {
  label: string; value: string; sub?: string; accent?: "default" | "emerald" | "amber";
}) {
  const valueColor = accent === "emerald" ? "text-emerald-400" : accent === "amber" ? "text-amber-400" : "text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-zinc-600">{sub}</p>}
    </div>
  );
}

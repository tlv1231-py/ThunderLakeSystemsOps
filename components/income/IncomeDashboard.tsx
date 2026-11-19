"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import {
  dismissOpportunity, queueOpportunity, markOpportunityInProgress,
  approveAction, rejectAction, logEarning, markEarningCollected,
  createAsset, setActiveMode,
} from "@/app/(admin)/income/actions";
import type { IncomeSummary, Opportunity, Asset, Earning, WorkItem, Approval, ActivityEntry } from "@/lib/income/types";
import { IncomePipeline } from "@/components/income/IncomePipeline";
import { IncomeTerminalFeed } from "@/components/income/IncomeTerminalFeed";

type Tab = "overview" | "opportunities" | "pipeline" | "queue" | "assets" | "ledger" | "approvals" | "log";

interface Props {
  summary: IncomeSummary;
  allEarnings: Earning[];
  allAssets: Asset[];
  userId: string;
  pipelineItems: any[];
}

// ── Color maps (cyberpunk palette) ────────────────────────────────────────────

const SOURCE_CYBER: Record<string, string> = {
  algora:    "text-[#00e5ff] border-[#00e5ff]/40",
  issuehunt: "text-[#00ff41] border-[#00ff41]/40",
  github:    "text-[#aa77ff] border-[#aa77ff]/40",
  manual:    "text-[#007a1f] border-[#007a1f]/40",
};

const STATUS_CYBER: Record<string, string> = {
  discovered:  "text-[#007a1f]  border-[#007a1f]/40",
  analyzing:   "text-[#00e5ff] border-[#00e5ff]/40",
  queued:      "text-[#00e5ff] border-[#00e5ff]/40",
  in_progress: "text-[#ffb800] border-[#ffb800]/40",
  submitted:   "text-[#ff8c00] border-[#ff8c00]/40",
  accepted:    "text-[#00ff41] border-[#00ff41]/40",
  rejected:    "text-[#ff0040] border-[#ff0040]/40",
  paid:        "text-[#00ff41] border-[#00ff41]/40",
  dismissed:   "text-[#1a3d1a] border-[#1a3d1a]/40",
  pending:     "text-[#ffb800] border-[#ffb800]/40",
  collected:   "text-[#00ff41] border-[#00ff41]/40",
  draft:       "text-[#004d14] border-[#004d14]/40",
  ready:       "text-[#00e5ff] border-[#00e5ff]/40",
  published:   "text-[#00ff41] border-[#00ff41]/40",
  done:        "text-[#00ff41] border-[#00ff41]/40",
  failed:      "text-[#ff0040] border-[#ff0040]/40",
  review:      "text-[#ffb800] border-[#ffb800]/40",
};

const DIFF_CYBER: Record<string, string> = {
  easy:   "text-[#00ff41]",
  medium: "text-[#ffb800]",
  hard:   "text-[#ff0040]",
};

function CyberBadge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-px border text-[9px] font-bold uppercase tracking-[0.12em] ${className}`}>
      {label}
    </span>
  );
}

function CyberBar({ value, max, color = "#00ff41" }: { value: number; max: number; color?: string }) {
  const pct = Math.min(1, max > 0 ? value / max : 0);
  const filled = Math.round(pct * 20);
  const empty  = 20 - filled;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] tabular-nums" style={{ color }}>
        {"▓".repeat(filled)}{"░".repeat(empty)}
      </span>
      <span className="text-[10px] text-[#004d14] tabular-nums">{Math.round(pct * 100)}%</span>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "#00ff41" : score >= 50 ? "#ffb800" : score >= 30 ? "#ff8c00" : "#1a4d1a";
  const filled = Math.round((score / 100) * 12);
  const empty  = 12 - filled;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] tabular-nums" style={{ color }}>
        {"▓".repeat(filled)}{"░".repeat(empty)}
      </span>
      <span className="text-[10px] text-[#004d14] tabular-nums">{score}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function IncomeDashboard({ summary, allEarnings, allAssets, userId, pipelineItems }: Props) {
  const router = useRouter();
  const [tab, setTab]   = useState<Tab>("overview");
  const [pending, startTransition] = useTransition();
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<string | null>(null);
  const [activeMode, setActiveModeState] = useState(false);
  const [showLogEarning, setShowLogEarning] = useState(false);
  const [oppFilter, setOppFilter] = useState<string>("all");

  const activePipeline = pipelineItems.filter((w: any) => !["done","failed","cancelled"].includes(w.status)).length;
  const pendingQueue   = summary.workQueue.filter(w => w.status === "pending").length;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview",      label: "OVERVIEW" },
    { id: "opportunities", label: "SCAN",     count: summary.activeOpportunities },
    { id: "pipeline",      label: "PIPELINE", count: activePipeline || undefined },
    { id: "queue",         label: "QUEUE",    count: pendingQueue || undefined },
    { id: "assets",        label: "ASSETS",   count: allAssets.length },
    { id: "ledger",        label: "LEDGER",   count: allEarnings.length },
    { id: "approvals",     label: "APPROVE",  count: summary.pendingApprovals || undefined },
    { id: "log",           label: "LOG" },
  ];

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverResult(null);
    try {
      const res = await fetch("/api/income/discover");
      const data = await res.json();
      if (data.ok) {
        setDiscoverResult(`+${data.new} new from ${data.sources?.map((s: any) => `${s.source}(${s.count})`).join(", ")}`);
        router.refresh();
      } else {
        setDiscoverResult("ERR: " + (data.error ?? "unknown"));
      }
    } catch (e) {
      setDiscoverResult("NET_ERROR");
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div className="relative bg-black text-[#00cc33] font-mono min-h-[calc(100vh-0px)] -mx-4 -mt-6 -mb-6 px-4 pt-6 pb-6">
      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.03]"
        style={{ background: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.5) 2px,rgba(0,0,0,0.5) 4px)" }}
      />

      {/* CRT glow */}
      <div
        className="pointer-events-none fixed inset-0 z-40 opacity-10"
        style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(0,255,65,0.08) 0%, transparent 65%)" }}
      />

      <div className="relative z-10 max-w-[1600px] mx-auto">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="border border-[#00ff41]/30 bg-[#030603] px-4 py-3 mb-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-[#00ff41] text-sm font-bold tracking-[0.15em] uppercase">⚡ TLS//INCOME_OPS</span>
                <span className="text-[9px] text-[#007a1f] border border-[#007a1f]/50 px-1.5 py-0.5 tracking-widest select-all">
                  BUILD[{process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev"}]
                </span>
                <span className={`text-[9px] border px-1.5 py-0.5 tracking-widest uppercase ${
                  activeMode ? "text-[#00ff41] border-[#00ff41]/50 animate-pulse" : "text-[#007a1f] border-[#007a1f]/30"
                }`}>
                  {activeMode ? "STATUS:ACTIVE" : "STATUS:IDLE"}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-[#007a1f] tracking-wider">
                {summary.lastDiscoveryRun
                  ? `LAST_SCAN: ${new Date(summary.lastDiscoveryRun).toLocaleString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}`
                  : "LAST_SCAN: never"}
                {"  ·  "}
                {summary.activeOpportunities} OPPORTUNITIES_ACTIVE
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {discoverResult && (
                <span className={`text-[10px] font-mono border px-2 py-1 ${
                  discoverResult.startsWith("ERR") || discoverResult.startsWith("NET")
                    ? "text-[#ff0040] border-[#ff0040]/40"
                    : "text-[#00ff41] border-[#00ff41]/40"
                }`}>
                  {discoverResult}
                </span>
              )}
              <button
                onClick={async () => {
                  const next = !activeMode;
                  setActiveModeState(next);
                  await setActiveMode(next);
                }}
                className={`px-3 py-1.5 text-[10px] font-bold border tracking-widest uppercase transition-all flex items-center gap-1.5 ${
                  activeMode
                    ? "border-[#00ff41] text-[#00ff41] bg-[#00ff41]/10 shadow-[0_0_12px_rgba(0,255,65,0.3)]"
                    : "border-[#007a1f] text-[#007a1f] hover:border-[#00ff41] hover:text-[#00ff41]"
                }`}
              >
                {activeMode && <span className="w-1.5 h-1.5 rounded-full bg-[#00ff41] animate-pulse" />}
                ⚡ {activeMode ? "ACTIVE" : "ACTIVE_MODE"}
              </button>
              <a
                href="/income/select"
                className="px-3 py-1.5 text-[10px] font-bold border border-[#ffb800]/60 text-[#ffb800] hover:bg-[#ffb800]/10 hover:shadow-[0_0_8px_rgba(255,184,0,0.2)] transition-all tracking-widest uppercase"
              >
                ▶ SELECT_BOUNTIES
              </a>
              <button
                onClick={handleDiscover}
                disabled={discovering}
                className="px-3 py-1.5 text-[10px] border border-[#007a1f] text-[#007a1f] hover:border-[#00ff41] hover:text-[#00ff41] transition-all tracking-widest uppercase disabled:opacity-40"
              >
                {discovering ? "SCANNING…" : "⟳ RUN_SCAN"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Agent queue alert ───────────────────────────────────────────── */}
        {pendingQueue > 0 && (
          <div
            className="mb-3 flex items-center justify-between px-4 py-3 border border-[#00ff41]/60 bg-[#00ff41]/5 cursor-pointer hover:bg-[#00ff41]/10 transition-colors"
            onClick={() => setTab("queue")}
          >
            <div className="flex items-center gap-3">
              <span className="text-[#00ff41] text-lg font-bold tabular-nums animate-pulse">{pendingQueue}</span>
              <span className="text-[11px] text-[#00ff41] font-bold uppercase tracking-widest">
                BOUNTIES_QUEUED — run agent to process
              </span>
            </div>
            <code className="text-[10px] text-[#007a1f] border border-[#007a1f]/40 px-2 py-1 select-all">
              node scripts/income-agent.mjs
            </code>
          </div>
        )}

        {/* ── Approval banner ─────────────────────────────────────────────── */}
        {summary.pendingApprovals > 0 && (
          <div
            className="mb-4 flex items-center justify-between px-4 py-2.5 border border-[#ffb800]/50 bg-[#ffb800]/5 cursor-pointer hover:bg-[#ffb800]/10 transition-colors"
            onClick={() => setTab("approvals")}
          >
            <span className="text-[11px] text-[#ffb800] tracking-wider uppercase">
              ⚠ ATTENTION_REQUIRED: {summary.pendingApprovals} action{summary.pendingApprovals > 1 ? "s" : ""} pending human approval
            </span>
            <span className="text-[10px] text-[#ffb800]/60 uppercase tracking-widest">[REVIEW_NOW →]</span>
          </div>
        )}

        {/* ── KPI tiles ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-4">
          <CyberKpi
            label="THIS_WEEK"
            value={formatCurrency(summary.collectedThisWeek)}
            sub={`Target: ${formatCurrency(summary.weeklyTarget)}`}
            progress={summary.weeklyProgress}
            accent={summary.weeklyProgress >= 1 ? "green" : "default"}
          />
          <CyberKpi
            label="30D_COLLECTED"
            value={formatCurrency(summary.collectedLast30Days)}
            sub={summary.daysSinceLastPayment != null ? `${summary.daysSinceLastPayment}d since last pmt` : "No payments yet"}
          />
          <CyberKpi
            label="PENDING_PAYOUTS"
            value={formatCurrency(summary.pendingTotal)}
            sub={`${allEarnings.filter(e => e.status === "pending").length} items`}
            accent={summary.pendingTotal > 0 ? "amber" : "default"}
          />
          <CyberKpi
            label="HOURLY_RATE_EFF"
            value={summary.effectiveHourly ? `${formatCurrency(summary.effectiveHourly)}/hr` : "——"}
            sub={`${summary.hoursInvested.toFixed(1)}h invested`}
          />
        </div>

        {/* ── Target progress ──────────────────────────────────────────────── */}
        <div className="border border-[#00ff41]/20 bg-[#030603] px-5 py-4 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-6">
            <div>
              <p className="text-[9px] text-[#007a1f] uppercase tracking-[0.2em] mb-2">WEEKLY_TARGET_PROGRESS</p>
              <CyberBar value={summary.collectedThisWeek} max={summary.weeklyTarget} />
              <p className="text-[10px] text-[#004d14] mt-1">
                {formatCurrency(summary.collectedThisWeek)} / {formatCurrency(summary.weeklyTarget)}
              </p>
            </div>
            <div className="flex flex-wrap gap-6">
              {(["bounty", "asset", "product", "content"] as const).map(eng => (
                <div key={eng}>
                  <p className="text-[9px] text-[#004d14] uppercase tracking-[0.15em] mb-1">ENG_{eng.toUpperCase()}</p>
                  <p className="text-sm font-bold tabular-nums text-[#00ff41]">
                    {formatCurrency(summary.byEngine[eng]?.collected ?? 0)}
                  </p>
                  {(summary.byEngine[eng]?.pending ?? 0) > 0 && (
                    <p className="text-[10px] text-[#ffb800] tabular-nums">
                      +{formatCurrency(summary.byEngine[eng].pending)} pend
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div>
              <p className="text-[9px] text-[#007a1f] uppercase tracking-[0.2em] mb-1">GAP_TO_TARGET</p>
              <p className="text-2xl font-bold text-[#00ff41] tabular-nums">
                {formatCurrency(Math.max(0, summary.weeklyTarget - summary.collectedThisWeek))}
              </p>
              <p className="text-[9px] text-[#004d14] mt-0.5 uppercase tracking-widest">needed this week</p>
            </div>
          </div>
        </div>

        {/* ── Two-panel layout ─────────────────────────────────────────────── */}
        <div className="flex gap-4">
          {/* Left: main tabs + content */}
          <div className="flex-1 min-w-0">
            {/* Tab bar */}
            <div className="flex gap-0 border-b border-[#00ff41]/20 mb-4 overflow-x-auto">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold border-b-2 transition-colors whitespace-nowrap tracking-[0.12em] uppercase ${
                    tab === t.id
                      ? "border-[#00ff41] text-[#00ff41] bg-[#00ff41]/5"
                      : "border-transparent text-[#007a1f] hover:text-[#00cc33]"
                  }`}
                >
                  [{t.label}
                  {t.count != null && t.count > 0 && (
                    <span className={`font-bold ${
                      t.id === "approvals" ? "text-[#ffb800]" : "text-[#00cc33]"
                    }`}>{t.count}</span>
                  )}
                  ]
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === "overview"      && <OverviewTab summary={summary} onTabChange={setTab} />}
            {tab === "opportunities" && <OpportunitiesTab opps={summary.topOpportunities} filter={oppFilter} onFilterChange={setOppFilter} />}
            {tab === "pipeline"      && <IncomePipeline initialItems={pipelineItems} userId={userId} />}
            {tab === "queue"         && <WorkQueueTab queue={summary.workQueue} />}
            {tab === "assets"        && <AssetsTab assets={allAssets} />}
            {tab === "ledger"        && <LedgerTab earnings={allEarnings} />}
            {tab === "approvals"     && <ApprovalsTab approvals={summary.approvals} />}
            {tab === "log"           && <ActivityTab entries={summary.recentActivity} />}
          </div>

          {/* Right: live terminal feed */}
          <div className="w-[340px] xl:w-[400px] shrink-0 h-[calc(100vh-280px)] sticky top-4">
            <IncomeTerminalFeed initialEntries={summary.recentActivity} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cyber KPI card ────────────────────────────────────────────────────────────

function CyberKpi({
  label, value, sub, progress, accent = "default",
}: {
  label: string; value: string; sub?: string; progress?: number; accent?: "default" | "green" | "amber";
}) {
  const valueColor = accent === "green" ? "text-[#00ff41]" : accent === "amber" ? "text-[#ffb800]" : "text-[#00cc33]";
  return (
    <div className="border border-[#00ff41]/20 bg-[#030603] px-4 py-3">
      <p className="text-[9px] text-[#007a1f] uppercase tracking-[0.2em] mb-2">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      {progress != null && (
        <div className="mt-1.5">
          <CyberBar value={progress} max={1} color={accent === "green" ? "#00ff41" : accent === "amber" ? "#ffb800" : "#00cc33"} />
        </div>
      )}
      {sub && <p className="mt-1 text-[10px] text-[#004d14]">{sub}</p>}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ summary, onTabChange }: { summary: IncomeSummary; onTabChange: (t: Tab) => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Top opportunities */}
      <div className="border border-[#00ff41]/20 bg-[#030603]">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#00ff41]/20">
          <span className="text-[9px] text-[#007a1f] uppercase tracking-[0.2em]">TOP_OPPORTUNITIES</span>
          <button onClick={() => onTabChange("opportunities")} className="text-[9px] text-[#007a1f] hover:text-[#00ff41] uppercase tracking-widest">[VIEW_ALL →]</button>
        </div>
        <div className="divide-y divide-[#00ff41]/10">
          {summary.topOpportunities.slice(0, 6).map(opp => (
            <OppRow key={opp.id} opp={opp} compact />
          ))}
          {summary.topOpportunities.length === 0 && (
            <p className="text-[10px] text-[#004d14] px-4 py-4">&gt; No opportunities — run scan to find bounties</p>
          )}
        </div>
      </div>

      {/* Work queue */}
      <div className="border border-[#00ff41]/20 bg-[#030603]">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#00ff41]/20">
          <span className="text-[9px] text-[#007a1f] uppercase tracking-[0.2em]">ACTIVE_WORK</span>
          <button onClick={() => onTabChange("queue")} className="text-[9px] text-[#007a1f] hover:text-[#00ff41] uppercase tracking-widest">[VIEW_ALL →]</button>
        </div>
        <div className="divide-y divide-[#00ff41]/10">
          {summary.workQueue.filter(w => w.status !== "done" && w.status !== "cancelled").slice(0, 5).map(w => (
            <div key={w.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-[11px] text-[#00cc33] truncate">{w.title}</p>
                <p className="text-[9px] text-[#004d14] uppercase tracking-wider">{w.engine} · {w.hours_invested.toFixed(1)}h</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CyberBadge label={w.status} className={STATUS_CYBER[w.status] ?? "text-[#004d14] border-[#004d14]/40"} />
                {w.expected_usd && <span className="text-[11px] tabular-nums text-[#00ff41]">{formatCurrency(w.expected_usd)}</span>}
              </div>
            </div>
          ))}
          {summary.workQueue.length === 0 && (
            <p className="text-[10px] text-[#004d14] px-4 py-4">&gt; Queue empty — select an opportunity to begin</p>
          )}
        </div>
      </div>

      {/* Recent earnings */}
      <div className="border border-[#00ff41]/20 bg-[#030603]">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#00ff41]/20">
          <span className="text-[9px] text-[#007a1f] uppercase tracking-[0.2em]">RECENT_EARNINGS</span>
          <button onClick={() => onTabChange("ledger")} className="text-[9px] text-[#007a1f] hover:text-[#00ff41] uppercase tracking-widest">[LEDGER →]</button>
        </div>
        <div className="divide-y divide-[#00ff41]/10">
          {summary.recentEarnings.slice(0, 6).map(e => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div>
                <p className="text-[11px] text-[#00cc33]">{e.description}</p>
                <p className="text-[9px] text-[#004d14] uppercase tracking-wider">{e.source} · {e.earned_date}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CyberBadge label={e.status} className={STATUS_CYBER[e.status] ?? ""} />
                <span className={`text-sm font-bold tabular-nums ${e.status === "collected" ? "text-[#00ff41]" : "text-[#ffb800]"}`}>
                  {formatCurrency(e.amount_usd)}
                </span>
              </div>
            </div>
          ))}
          {summary.recentEarnings.length === 0 && (
            <p className="text-[10px] text-[#004d14] px-4 py-4">&gt; No earnings logged yet</p>
          )}
        </div>
      </div>

      {/* Activity preview */}
      <div className="border border-[#00ff41]/20 bg-[#030603]">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#00ff41]/20">
          <span className="text-[9px] text-[#007a1f] uppercase tracking-[0.2em]">SYS_ACTIVITY</span>
          <button onClick={() => onTabChange("log")} className="text-[9px] text-[#007a1f] hover:text-[#00ff41] uppercase tracking-widest">[FULL_LOG →]</button>
        </div>
        <div className="px-4 py-2 space-y-px">
          {summary.recentActivity.slice(0, 8).map(a => (
            <div key={a.id} className="flex items-baseline gap-2 py-0.5 text-[10px]">
              <span className="text-[#2a4d2a] shrink-0 tabular-nums w-[44px]">
                {new Date(a.created_at).toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", hour12:false })}
              </span>
              <span className={`font-bold uppercase shrink-0 w-[52px] ${
                a.status === "error" ? "text-[#ff0040]" : a.status === "warning" ? "text-[#ffb800]" : "text-[#004d14]"
              }`}>{(a.engine ?? "SYS").slice(0,6)}</span>
              <span className="text-[#008f21] truncate">{a.detail ?? a.action}</span>
            </div>
          ))}
          {summary.recentActivity.length === 0 && (
            <p className="text-[10px] text-[#004d14] py-3">&gt; No activity yet</p>
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
  const filtered = opps.filter(o => {
    if (filter === "all")    return true;
    if (filter === "high")   return o.score >= 65;
    if (filter === "cash")   return (o.reward_usd ?? 0) > 0;
    if (filter === "easy")   return o.difficulty === "easy";
    if (filter === "queued") return o.status === "queued";
    return o.source === filter;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {["all", "high", "cash", "easy", "algora", "issuehunt", "github", "queued"].map(f => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={`px-3 py-1 text-[10px] border transition-colors tracking-wider uppercase ${
              filter === f
                ? "border-[#00ff41] text-[#00ff41] bg-[#00ff41]/10"
                : "border-[#007a1f]/50 text-[#007a1f] hover:border-[#00cc33] hover:text-[#00cc33]"
            }`}
          >
            [{f === "high" ? "HIGH_SCORE" : f === "cash" ? "HAS_REWARD" : f.toUpperCase()}
            {f === "all" && <span className="text-[#004d14]">:{opps.length}</span>}]
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(opp => <OppRow key={opp.id} opp={opp} />)}
        {filtered.length === 0 && (
          <div className="border border-[#007a1f]/30 bg-[#030603] px-6 py-8 text-center">
            <p className="text-[11px] text-[#007a1f]">&gt; No opportunities match filter — run discovery scan</p>
          </div>
        )}
      </div>
    </div>
  );
}

function OppRow({ opp, compact = false }: { opp: Opportunity; compact?: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className={`border border-[#00ff41]/15 bg-[#030603] hover:border-[#00ff41]/35 transition-colors ${compact ? "px-4 py-2.5" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <CyberBadge label={opp.source} className={SOURCE_CYBER[opp.source] ?? "text-[#004d14] border-[#004d14]/40"} />
            {opp.language && (
              <span className="text-[9px] text-[#004d14]">{opp.language}</span>
            )}
            {opp.difficulty && (
              <span className={`text-[9px] font-bold uppercase tracking-widest ${DIFF_CYBER[opp.difficulty] ?? "text-[#004d14]"}`}>
                {opp.difficulty}
              </span>
            )}
            {opp.status !== "discovered" && (
              <CyberBadge label={opp.status} className={STATUS_CYBER[opp.status] ?? "text-[#004d14] border-[#004d14]/40"} />
            )}
          </div>
          <a
            href={opp.url} target="_blank" rel="noopener noreferrer"
            className="block text-[11px] text-[#00cc33] hover:text-[#00ff41] transition-colors line-clamp-2 leading-relaxed"
          >
            {opp.title}
          </a>
          {!compact && opp.description && (
            <p className="mt-1 text-[10px] text-[#004d14] line-clamp-2">{opp.description}</p>
          )}
          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
            <ScoreBar score={opp.score} />
            {opp.estimated_hours != null && (
              <span className="text-[9px] text-[#004d14]">~{opp.estimated_hours}h</span>
            )}
            {opp.hourly_rate_est != null && (
              <span className="text-[9px] text-[#00cc33] tabular-nums font-bold">
                {formatCurrency(opp.hourly_rate_est)}/hr
              </span>
            )}
            {opp.open_prs > 0 && (
              <span className="text-[9px] text-[#ff8c00]">{opp.open_prs} PR{opp.open_prs > 1 ? "s" : ""} open</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {opp.reward_usd != null && (
            <span className="text-lg font-bold tabular-nums text-[#00ff41] shadow-[0_0_8px_rgba(0,255,65,0.3)]">
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
                    className="px-2.5 py-1 text-[9px] font-bold border border-[#ffb800]/60 text-[#ffb800] hover:bg-[#ffb800]/10 uppercase tracking-widest transition-colors disabled:opacity-40"
                  >
                    [QUEUE]
                  </button>
                  <button
                    onClick={() => startTransition(() => dismissOpportunity(opp.id))}
                    disabled={pending}
                    className="px-2.5 py-1 text-[9px] border border-[#007a1f]/30 text-[#007a1f] hover:text-[#00cc33] uppercase tracking-widest transition-colors"
                  >
                    [DISMISS]
                  </button>
                </>
              )}
              {opp.status === "queued" && (
                <button
                  onClick={() => startTransition(() => markOpportunityInProgress(opp.id))}
                  disabled={pending}
                  className="px-2.5 py-1 text-[9px] font-bold border border-[#00e5ff]/60 text-[#00e5ff] hover:bg-[#00e5ff]/10 uppercase tracking-widest transition-colors"
                >
                  [START_WORK]
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
  const active = queue.filter(w => !["done","cancelled","failed"].includes(w.status));
  const done   = queue.filter(w =>  ["done","cancelled","failed"].includes(w.status));

  return (
    <div className="space-y-3">
      {active.length === 0 && (
        <div className="border border-[#007a1f]/30 bg-[#030603] px-6 py-8 text-center">
          <p className="text-[11px] text-[#007a1f]">&gt; Queue empty — select an opportunity to begin</p>
        </div>
      )}
      {active.map(w => (
        <div key={w.id} className="border border-[#00ff41]/20 bg-[#030603] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <CyberBadge label={w.engine} className="text-[#007a1f] border-[#007a1f]/40" />
                <CyberBadge label={w.status} className={STATUS_CYBER[w.status] ?? "text-[#004d14] border-[#004d14]/40"} />
                <span className="text-[9px] text-[#004d14]">P{w.priority}</span>
              </div>
              <p className="text-[11px] text-[#00cc33]">{w.title}</p>
              {w.description && <p className="text-[10px] text-[#004d14] mt-0.5 line-clamp-2">{w.description}</p>}
              <div className="mt-2 flex items-center gap-4 text-[9px] text-[#004d14] flex-wrap">
                <span>{w.hours_invested.toFixed(1)}h invested{w.estimated_hours ? ` / ${w.estimated_hours}h est` : ""}</span>
                {(w as any).progress_pct > 0 && (
                  <div className="flex items-center gap-1">
                    <CyberBar value={(w as any).progress_pct} max={100} />
                  </div>
                )}
                {(w as any).progress_note && (
                  <span className="text-[#007a1f] truncate max-w-[240px]">{(w as any).progress_note}</span>
                )}
              </div>
              {(w as any).pr_url && (
                <a
                  href={(w as any).pr_url} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] text-[#00e5ff] hover:underline mt-1 block truncate max-w-sm"
                >
                  PR → {(w as any).pr_url}
                </a>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              {w.expected_usd != null && (
                <span className="text-base font-bold tabular-nums text-[#00ff41]">{formatCurrency(w.expected_usd)}</span>
              )}
              {w.requires_approval && (
                <div className="text-right">
                  <p className="text-[9px] text-[#ffb800] font-bold uppercase tracking-wider">APPROVAL_REQ</p>
                  <p className="text-[9px] text-[#007a1f] max-w-[160px] text-right">{w.approval_action}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
      {done.length > 0 && (
        <details className="text-[10px] text-[#004d14]">
          <summary className="cursor-pointer hover:text-[#007a1f] select-none uppercase tracking-widest">
            [{done.length} completed/failed items]
          </summary>
          <div className="mt-2 space-y-1 pl-2 border-l border-[#007a1f]/20">
            {done.map(w => (
              <div key={w.id} className="flex items-center gap-2 py-0.5">
                <CyberBadge label={w.status} className={STATUS_CYBER[w.status] ?? ""} />
                <span className="text-[#004d14] truncate">{w.title}</span>
                {w.expected_usd && <span className="text-[#004d14] tabular-nums ml-auto">{formatCurrency(w.expected_usd)}</span>}
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
            <p className="text-[9px] text-[#007a1f] uppercase tracking-[0.2em] mb-3">
              ENGINE_{eng.toUpperCase()} :: {eng === "asset" ? "DIGITAL_ASSETS" : eng === "product" ? "SOFTWARE_PRODUCTS" : "CONTENT"}
            </p>
            {list.length === 0 ? (
              <div className="border border-[#007a1f]/20 bg-[#030603] px-5 py-4 text-[10px] text-[#004d14]">
                {eng === "asset"   && "&gt; Build Tailwind kits, icon packs, templates — list on Gumroad/Itch.io"}
                {eng === "product" && "&gt; Build VS Code extensions, npm utilities, CLI tools — distribute free-tier marketplaces"}
                {eng === "content" && "&gt; Educational videos, data explainers — YouTube AdSense + affiliate"}
              </div>
            ) : (
              <div className="space-y-2">
                {list.map(a => (
                  <div key={a.id} className="border border-[#00ff41]/15 bg-[#030603] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <CyberBadge label={a.status} className={STATUS_CYBER[a.status] ?? ""} />
                          {a.marketplace && <span className="text-[9px] text-[#004d14]">{a.marketplace}</span>}
                          {a.category && <span className="text-[9px] text-[#004d14]">{a.category}</span>}
                        </div>
                        <p className="text-[11px] text-[#00cc33]">{a.name}</p>
                        {a.description && <p className="text-[10px] text-[#004d14] mt-0.5">{a.description}</p>}
                        {a.listing_url && (
                          <a href={a.listing_url} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-[#00e5ff] hover:underline mt-1 block truncate max-w-xs">
                            {a.listing_url}
                          </a>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums text-[#00ff41]">{formatCurrency(a.total_revenue)}</p>
                        <p className="text-[10px] text-[#004d14]">{a.total_sales} sales</p>
                        {a.quality_score && <p className="text-[10px] text-[#004d14]">Q{a.quality_score}</p>}
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
  const collected  = earnings.filter(e => e.status === "collected");
  const pendingList = earnings.filter(e => e.status === "pending");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "TOTAL_COLLECTED", value: formatCurrency(collected.reduce((s, e) => s + e.amount_usd, 0)), color: "text-[#00ff41]" },
          { label: "PENDING",         value: formatCurrency(pendingList.reduce((s, e) => s + e.amount_usd, 0)), color: "text-[#ffb800]" },
          { label: "TOTAL_RECORDS",   value: String(earnings.length), color: "text-[#00cc33]" },
          { label: "COLLECTED_CNT",   value: String(collected.length), color: "text-[#00cc33]" },
        ].map(item => (
          <div key={item.label} className="border border-[#00ff41]/15 bg-[#030603] px-4 py-3">
            <p className="text-[9px] text-[#007a1f] uppercase tracking-[0.2em] mb-1">{item.label}</p>
            <p className={`text-xl font-bold tabular-nums ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {earnings.length === 0 ? (
        <div className="border border-[#007a1f]/30 bg-[#030603] px-6 py-8 text-center">
          <p className="text-[11px] text-[#007a1f]">&gt; No earnings logged yet</p>
        </div>
      ) : (
        <div className="border border-[#00ff41]/20 overflow-hidden">
          <table className="w-full text-[10px] font-mono">
            <thead className="bg-[#030603] border-b border-[#00ff41]/20">
              <tr>
                {["DATE", "DESCRIPTION", "SOURCE", "STATUS", "AMOUNT", ""].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-[9px] text-[#007a1f] uppercase tracking-[0.15em] font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#00ff41]/10">
              {earnings.map(e => (
                <tr key={e.id} className="bg-black hover:bg-[#030603] transition-colors">
                  <td className="px-4 py-2 text-[#004d14] tabular-nums whitespace-nowrap">{e.earned_date}</td>
                  <td className="px-4 py-2 text-[#00cc33]">{e.description}</td>
                  <td className="px-4 py-2 text-[#004d14]">{e.source}</td>
                  <td className="px-4 py-2">
                    <CyberBadge label={e.status} className={STATUS_CYBER[e.status] ?? ""} />
                  </td>
                  <td className={`px-4 py-2 text-sm font-bold tabular-nums text-right ${
                    e.status === "collected" ? "text-[#00ff41]" : "text-[#ffb800]"
                  }`}>
                    {formatCurrency(e.amount_usd)}
                  </td>
                  <td className="px-2 py-2">
                    {e.status === "pending" && (
                      <button
                        onClick={() => startTransition(() => markEarningCollected(e.id))}
                        disabled={pending}
                        className="text-[9px] border border-[#00ff41]/40 text-[#00ff41] hover:bg-[#00ff41]/10 px-1.5 py-0.5 uppercase tracking-wider transition-colors"
                      >
                        [✓COLLECTED]
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
      <div className="border border-[#007a1f]/30 bg-[#030603] px-6 py-8 text-center">
        <p className="text-[11px] text-[#007a1f]">&gt; No pending approvals — system will request action when needed</p>
      </div>
    );
  }

  const ACTION_LABELS: Record<string, string> = {
    register_account: "CREATE_ACCT",
    submit_pr:        "SUBMIT_PR",
    publish_asset:    "PUBLISH",
    claim_bounty:     "CLAIM_BOUNTY",
    verify_identity:  "VERIFY_ID",
  };

  return (
    <div className="space-y-3">
      {approvals.map(a => (
        <div key={a.id} className="border border-[#ffb800]/40 bg-[#1a0f00]/30 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <CyberBadge label={ACTION_LABELS[a.action_type] ?? a.action_type} className="text-[#ffb800] border-[#ffb800]/50" />
                <span className="text-[9px] text-[#007a1f]">P{a.priority}</span>
              </div>
              <p className="text-[11px] text-[#00cc33]">{a.title}</p>
              <p className="text-[10px] text-[#007a1f] mt-1 leading-relaxed whitespace-pre-wrap">{a.description}</p>
              {a.action_url && (
                <a href={a.action_url} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] text-[#00e5ff] hover:underline mt-1.5 block">
                  {a.action_url}
                </a>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={() => startTransition(() => approveAction(a.id))}
                disabled={pending}
                className="px-3 py-1.5 text-[9px] font-bold border border-[#00ff41]/60 text-[#00ff41] hover:bg-[#00ff41]/10 uppercase tracking-wider transition-colors disabled:opacity-40"
              >
                [✓ DONE]
              </button>
              <button
                onClick={() => startTransition(() => rejectAction(a.id))}
                disabled={pending}
                className="px-3 py-1.5 text-[9px] border border-[#007a1f]/30 text-[#007a1f] hover:text-[#00cc33] uppercase tracking-wider transition-colors"
              >
                [DISMISS]
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
    <div className="border border-[#00ff41]/20 bg-black overflow-hidden">
      {entries.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-[11px] text-[#007a1f]">&gt; No activity logged yet</p>
        </div>
      ) : (
        <table className="w-full text-[10px] font-mono">
          <tbody className="divide-y divide-[#00ff41]/10">
            {entries.map(a => (
              <tr key={a.id} className="hover:bg-[#030603] transition-colors">
                <td className="px-4 py-2 text-[#2a4d2a] whitespace-nowrap tabular-nums w-[7rem]">
                  {new Date(a.created_at).toLocaleString("en-US", {
                    month:"numeric", day:"numeric",
                    hour:"2-digit", minute:"2-digit", hour12:false,
                  })}
                </td>
                <td className={`px-3 py-2 w-[5rem] font-bold uppercase tracking-wider ${
                  a.status === "error" ? "text-[#ff0040]" : a.status === "warning" ? "text-[#ffb800]" : "text-[#004d14]"
                }`}>
                  {(a.engine ?? "SYS").slice(0, 6)}
                </td>
                <td className="px-3 py-2 text-[#007a1f] w-[9rem]">{a.action}</td>
                <td className="px-3 py-2 text-[#00cc33]">{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

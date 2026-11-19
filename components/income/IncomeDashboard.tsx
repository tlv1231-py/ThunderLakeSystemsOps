"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import {
  dismissOpportunity, markOpportunityInProgress,
  approveAction, rejectAction, markEarningCollected,
  setActiveMode,
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

// ── Status colors: minimal — only carry meaning ───────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  discovered:  "text-zinc-600",
  analyzing:   "text-zinc-400",
  queued:      "text-zinc-300",
  in_progress: "text-amber-400",
  submitted:   "text-zinc-300",
  accepted:    "text-green-400",
  rejected:    "text-red-400",
  paid:        "text-green-400",
  dismissed:   "text-zinc-700",
  pending:     "text-amber-400",
  collected:   "text-green-400",
  draft:       "text-zinc-600",
  ready:       "text-zinc-300",
  published:   "text-green-400",
  done:        "text-green-400",
  failed:      "text-red-400",
  review:      "text-amber-400",
  cancelled:   "text-zinc-700",
};

const DIFF_COLOR: Record<string, string> = {
  easy:   "text-green-400",
  medium: "text-amber-400",
  hard:   "text-red-400",
};

function StatusPill({ label }: { label: string }) {
  return (
    <span className={`text-[10px] font-mono ${STATUS_COLOR[label] ?? "text-zinc-500"}`}>
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function IncomeDashboard({ summary, allEarnings, allAssets, userId, pipelineItems }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<string | null>(null);
  const [activeMode, setActiveModeState] = useState(false);
  const [oppFilter, setOppFilter] = useState<string>("all");

  const activePipeline  = pipelineItems.filter((w: any) => !["done","failed","cancelled"].includes(w.status)).length;
  const pendingQueue    = summary.workQueue.filter(w => w.status === "pending").length;
  const submittedCount  = pipelineItems.filter((w: any) => w.status === "submitted").length;
  const inProgressCount = pipelineItems.filter((w: any) => w.status === "in_progress").length;
  const doneCount       = pipelineItems.filter((w: any) => w.status === "done").length;
  const paidCount       = allEarnings.filter(e => e.status === "collected").length;
  const allTimeCollected = allEarnings.filter(e => e.status === "collected").reduce((s, e) => s + e.amount_usd, 0);
  const totalAttempted  = submittedCount + doneCount + paidCount;
  const totalWon        = doneCount + paidCount;
  const winRate         = totalAttempted > 0 ? Math.round((totalWon / totalAttempted) * 100) : 0;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview",      label: "Overview" },
    { id: "opportunities", label: "Scan",     count: summary.activeOpportunities },
    { id: "pipeline",      label: "Pipeline", count: activePipeline || undefined },
    { id: "assets",        label: "Assets" },
    { id: "ledger",        label: "Ledger",   count: allEarnings.length },
    { id: "approvals",     label: "Approvals", count: summary.pendingApprovals || undefined },
    { id: "log",           label: "Log" },
  ];

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverResult(null);
    try {
      const res = await fetch("/api/income/discover");
      const data = await res.json();
      if (data.ok) {
        setDiscoverResult(`+${data.new} new`);
        router.refresh();
      } else {
        setDiscoverResult("error: " + (data.error ?? "unknown"));
      }
    } catch {
      setDiscoverResult("network error");
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div className="bg-black text-zinc-300 font-mono min-h-[calc(100vh-0px)] -mx-4 -mt-6 -mb-6 px-4 pt-5 pb-6">
      <div className="max-w-[1800px] mx-auto">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-zinc-800">
          <div>
            <span className="text-zinc-100 text-sm font-semibold tracking-wide">Bounty Engine</span>
            <div className="text-[10px] text-zinc-600 mt-0.5">
              {summary.lastDiscoveryRun
                ? `last scan ${new Date(summary.lastDiscoveryRun).toLocaleString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}`
                : "never scanned"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {discoverResult && (
              <span className={`text-[10px] font-mono ${discoverResult.startsWith("error") || discoverResult.startsWith("network") ? "text-red-400" : "text-green-400"}`}>
                {discoverResult}
              </span>
            )}
            <button
              onClick={async () => { const next = !activeMode; setActiveModeState(next); await setActiveMode(next); }}
              className={`text-[10px] px-2 py-1 border transition-colors ${
                activeMode ? "border-zinc-500 text-zinc-200" : "border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {activeMode ? "● active" : "○ idle"}
            </button>
            <button
              onClick={handleDiscover}
              disabled={discovering}
              className="text-[10px] px-2 py-1 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors disabled:opacity-30"
            >
              {discovering ? "scanning…" : "⟳ scan"}
            </button>
          </div>
        </div>

        {/* ── Agent CTA — shown when bounties are waiting ──────────────────── */}
        {pendingQueue > 0 && (
          <div
            className="mb-3 flex items-center justify-between gap-4 px-4 py-3 border border-amber-400/30 bg-amber-400/5 cursor-pointer hover:bg-amber-400/8 transition-colors"
            onClick={() => setTab("queue")}
          >
            <div>
              <span className="text-amber-400 text-[13px] font-semibold">
                {pendingQueue} {pendingQueue === 1 ? "bounty" : "bounties"} ready to work
              </span>
              {summary.queueProjectedUsd > 0 && (
                <span className="text-zinc-500 text-[10px] ml-3">{formatCurrency(summary.queueProjectedUsd)} potential</span>
              )}
            </div>
            <code className="text-[11px] text-amber-400/70 select-all shrink-0">
              node scripts/income-agent.mjs
            </code>
          </div>
        )}

        {/* ── Approvals banner ─────────────────────────────────────────────── */}
        {summary.pendingApprovals > 0 && (
          <div
            className="mb-3 flex items-center justify-between px-4 py-2 border border-amber-400/20 cursor-pointer hover:bg-amber-400/5 transition-colors"
            onClick={() => setTab("approvals")}
          >
            <span className="text-[11px] text-amber-400/80">
              {summary.pendingApprovals} action{summary.pendingApprovals > 1 ? "s" : ""} need your approval
            </span>
            <span className="text-[10px] text-zinc-600">review →</span>
          </div>
        )}

        {/* ── Scan active ───────────────────────────────────────────────────── */}
        {discovering && (
          <div className="mb-3 px-4 py-2 border border-zinc-700">
            <span className="text-[11px] text-zinc-400 animate-pulse">scanning algora · issuehunt · opire · github…</span>
          </div>
        )}

        {/* ── Stats + cooldowns row ────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 mb-3 overflow-x-auto text-[11px]">
          <div className="flex items-center gap-4 text-zinc-500 whitespace-nowrap">
            <span>
              <span className={allTimeCollected > 0 ? "text-green-400 font-semibold" : "text-zinc-300"}>
                {formatCurrency(summary.collectedThisWeek)}
              </span>
              {" "}<span className="text-zinc-700">/ {formatCurrency(summary.weeklyTarget)} this week</span>
            </span>
            <span className="text-zinc-800">·</span>
            <span>
              <span className={pendingQueue > 0 ? "text-amber-400 font-semibold" : "text-zinc-500"}>{pendingQueue}</span>
              {" "}waiting
            </span>
            <span className="text-zinc-800">·</span>
            <span>
              <span className={winRate > 0 ? "text-zinc-300" : "text-zinc-600"}>{winRate}%</span>
              {" "}win rate
            </span>
            <span className="text-zinc-800">·</span>
            <span>
              <span className={allTimeCollected > 0 ? "text-green-400" : "text-zinc-600"}>
                {formatCurrency(allTimeCollected)}
              </span>
              {" "}all-time
            </span>
          </div>
          <CooldownStrip />
        </div>

        {/* ── Pipeline stages ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 mb-3 text-[11px] text-zinc-600 overflow-x-auto whitespace-nowrap">
          {([
            { label: "opportunities", value: summary.activeOpportunities },
            { label: "waiting",       value: pendingQueue },
            { label: "working",       value: inProgressCount },
            { label: "PR open",       value: submittedCount },
            { label: "merged",        value: doneCount },
            { label: "paid",          value: paidCount },
          ] as const).map((stage, i, arr) => (
            <span key={stage.label} className="flex items-center gap-1">
              <span className={stage.value > 0 ? "text-zinc-300" : "text-zinc-700"}>
                <span className="font-semibold tabular-nums">{stage.value}</span>
                {" "}{stage.label}
              </span>
              {i < arr.length - 1 && <span className="text-zinc-800 mx-1">→</span>}
            </span>
          ))}
        </div>

        {/* ── Two-panel layout ─────────────────────────────────────────────── */}
        <div className="flex gap-4">
          {/* Left: tabs */}
          <div className="flex-1 min-w-0">
            <div className="flex gap-0 border-b border-zinc-800 mb-3 overflow-x-auto">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-[11px] border-b-2 transition-colors whitespace-nowrap ${
                    tab === t.id
                      ? "border-zinc-300 text-zinc-100"
                      : "border-transparent text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {t.label}
                  {t.count != null && t.count > 0 && (
                    <span className={`text-[10px] ${t.id === "approvals" ? "text-amber-400" : "text-zinc-500"}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {tab === "overview"      && <OverviewTab summary={summary} onTabChange={setTab} />}
            {tab === "opportunities" && <OpportunitiesTab opps={summary.topOpportunities} filter={oppFilter} onFilterChange={setOppFilter} />}
            {tab === "pipeline"      && <IncomePipeline initialItems={pipelineItems} userId={userId} />}
            {tab === "queue"         && <WorkQueueTab queue={summary.workQueue} />}
            {tab === "assets"        && <AssetsTab assets={allAssets} />}
            {tab === "ledger"        && <LedgerTab earnings={allEarnings} />}
            {tab === "approvals"     && <ApprovalsTab approvals={summary.approvals} />}
            {tab === "log"           && <ActivityTab entries={summary.recentActivity} />}
          </div>

          {/* Right: live terminal */}
          <div className="w-[380px] xl:w-[480px] 2xl:w-[560px] shrink-0 h-[calc(100vh-220px)] sticky top-4">
            <IncomeTerminalFeed initialEntries={summary.recentActivity} lastDiscoveryRun={summary.lastDiscoveryRun} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cooldown strip (plain countdown text) ────────────────────────────────────

function nextSlotMs(slots: number[], now: number): number {
  const d = new Date(now);
  const h = d.getUTCHours();
  const nextH = slots.find(s => s > h);
  const next = new Date(d);
  next.setUTCMinutes(0, 0, 0);
  if (nextH !== undefined) next.setUTCHours(nextH);
  else { next.setUTCDate(next.getUTCDate() + 1); next.setUTCHours(slots[0]); }
  return next.getTime();
}

const DISCOVER_SLOTS = Array.from({ length: 24 }, (_, i) => i);
const CHECK_PR_SLOTS = Array.from({ length: 12 }, (_, i) => i * 2 + 1);

function fmt(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return h > 0
    ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
    : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function CooldownStrip() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const scanIn   = nextSlotMs(DISCOVER_SLOTS, now) - now;
  const checkIn  = nextSlotMs(CHECK_PR_SLOTS, now) - now;
  const scanSoon = scanIn < 300_000;
  const checkSoon = checkIn < 300_000;

  return (
    <div className="flex items-center gap-3 text-[10px] text-zinc-600 whitespace-nowrap shrink-0">
      <span>
        scan in{" "}
        <span className={scanSoon ? "text-zinc-300 font-semibold" : "text-zinc-500"}>{fmt(scanIn)}</span>
      </span>
      <span className="text-zinc-800">·</span>
      <span>
        PR check in{" "}
        <span className={checkSoon ? "text-zinc-300 font-semibold" : "text-zinc-500"}>{fmt(checkIn)}</span>
      </span>
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ summary, onTabChange }: { summary: IncomeSummary; onTabChange: (t: Tab) => void }) {
  const sourceOrder = ["opire", "algora", "issuehunt", "github"];
  const allSources = [
    ...sourceOrder.filter(s => summary.winRateBySource[s]?.submitted > 0),
    ...Object.keys(summary.winRateBySource).filter(s => !sourceOrder.includes(s) && summary.winRateBySource[s]?.submitted > 0),
  ];
  const activePipelineItems = summary.workQueue.filter(w => !["done","cancelled","failed"].includes(w.status));
  const queueReady          = summary.workQueue.filter(w => w.status === "pending");

  return (
    <div className="space-y-4">
      {/* Active work */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Active work</span>
          <button onClick={() => onTabChange("pipeline")} className="text-[10px] text-zinc-700 hover:text-zinc-400">all →</button>
        </div>
        {activePipelineItems.length === 0 ? (
          <p className="text-[11px] text-zinc-700 py-3">Nothing in progress — run the agent to start working bounties.</p>
        ) : (
          <div className="divide-y divide-zinc-900">
            {activePipelineItems.slice(0, 5).map(w => (
              <div key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-zinc-200 truncate">{w.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusPill label={w.status} />
                    {(w as any).progress_note && (
                      <span className="text-[10px] text-zinc-600 truncate max-w-[200px]">{(w as any).progress_note}</span>
                    )}
                    {(w as any).pr_url && (
                      <a href={(w as any).pr_url} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 truncate max-w-[200px]">
                        {(w as any).pr_url.replace("https://github.com/","gh/")}
                      </a>
                    )}
                  </div>
                </div>
                {w.expected_usd && (
                  <span className="text-[11px] tabular-nums text-green-400 font-semibold shrink-0">{formatCurrency(w.expected_usd)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Waiting for agent */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Waiting for agent</span>
            <button onClick={() => onTabChange("queue")} className="text-[10px] text-zinc-700 hover:text-zinc-400">run →</button>
          </div>
          {queueReady.length === 0 ? (
            <p className="text-[11px] text-zinc-700 py-3">Nothing queued.</p>
          ) : (
            <div className="divide-y divide-zinc-900">
              {queueReady.slice(0, 5).map(w => (
                <div key={w.id} className="flex items-center justify-between gap-2 py-2.5">
                  <p className="text-[11px] text-zinc-300 truncate flex-1">{w.title}</p>
                  {w.expected_usd && (
                    <span className="text-[11px] tabular-nums text-zinc-400 shrink-0">{formatCurrency(w.expected_usd)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Top picks */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Top picks</span>
            <button onClick={() => onTabChange("opportunities")} className="text-[10px] text-zinc-700 hover:text-zinc-400">all →</button>
          </div>
          <div className="divide-y divide-zinc-900">
            {summary.topOpportunities.slice(0, 5).map(opp => (
              <OppRow key={opp.id} opp={opp} compact />
            ))}
            {summary.topOpportunities.length === 0 && (
              <p className="text-[11px] text-zinc-700 py-3">No opportunities — run a scan.</p>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent earnings */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Recent earnings</span>
            <button onClick={() => onTabChange("ledger")} className="text-[10px] text-zinc-700 hover:text-zinc-400">full ledger →</button>
          </div>
          {summary.recentEarnings.length === 0 ? (
            <p className="text-[11px] text-zinc-700 py-3">No earnings yet.</p>
          ) : (
            <div className="divide-y divide-zinc-900">
              {summary.recentEarnings.slice(0, 4).map(e => (
                <div key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-[11px] text-zinc-300">{e.description}</p>
                    <p className="text-[10px] text-zinc-600">{e.source} · {e.earned_date}</p>
                  </div>
                  <span className={`text-[12px] font-semibold tabular-nums ${e.status === "collected" ? "text-green-400" : "text-amber-400"}`}>
                    {formatCurrency(e.amount_usd)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Win rate by source */}
        <section>
          <div className="mb-2">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Win rate by source</span>
          </div>
          {allSources.length === 0 ? (
            <p className="text-[11px] text-zinc-700 py-3">No PR history yet.</p>
          ) : (
            <div className="divide-y divide-zinc-900">
              {allSources.map(src => {
                const s = summary.winRateBySource[src];
                const pct = Math.round(s.rate * 100);
                return (
                  <div key={src} className="flex items-center gap-3 py-2">
                    <span className="text-[10px] text-zinc-500 w-20 shrink-0">{src}</span>
                    <div className="flex-1 h-px bg-zinc-800">
                      <div
                        className={`h-px ${pct >= 50 ? "bg-green-400" : pct > 0 ? "bg-amber-400" : "bg-zinc-700"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-[10px] tabular-nums w-8 text-right ${pct >= 50 ? "text-green-400" : pct > 0 ? "text-amber-400" : "text-zinc-600"}`}>
                      {pct}%
                    </span>
                    <span className="text-[10px] text-zinc-700 w-10 text-right">{s.won}/{s.submitted}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Opportunities tab ─────────────────────────────────────────────────────────

function OpportunitiesTab({ opps, filter, onFilterChange }: {
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

  const filters = [
    { id: "all",      label: `all (${opps.length})` },
    { id: "high",     label: "high score" },
    { id: "cash",     label: "has reward" },
    { id: "easy",     label: "easy" },
    { id: "algora",   label: "algora" },
    { id: "issuehunt",label: "issuehunt" },
    { id: "opire",    label: "opire" },
    { id: "github",   label: "github" },
    { id: "queued",   label: "queued" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => onFilterChange(f.id)}
            className={`px-2.5 py-1 text-[10px] border transition-colors ${
              filter === f.id
                ? "border-zinc-400 text-zinc-200"
                : "border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="divide-y divide-zinc-900">
        {filtered.map(opp => <OppRow key={opp.id} opp={opp} />)}
        {filtered.length === 0 && (
          <p className="text-[11px] text-zinc-700 py-6 text-center">No results — try a different filter or run a scan.</p>
        )}
      </div>
    </div>
  );
}

function OppRow({ opp, compact = false }: { opp: Opportunity; compact?: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className={`hover:bg-zinc-900/50 transition-colors ${compact ? "py-2" : "py-3"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-[10px] text-zinc-600">{opp.source}</span>
            {opp.language && <span className="text-[10px] text-zinc-700">{opp.language}</span>}
            {opp.difficulty && (
              <span className={`text-[10px] ${DIFF_COLOR[opp.difficulty] ?? "text-zinc-600"}`}>{opp.difficulty}</span>
            )}
            {opp.status !== "discovered" && <StatusPill label={opp.status} />}
            <span className="text-[10px] text-zinc-700">score {opp.score}</span>
            {opp.estimated_hours != null && (
              <span className="text-[10px] text-zinc-700">~{opp.estimated_hours}h</span>
            )}
            {opp.open_prs > 0 && (
              <span className="text-[10px] text-amber-400/70">{opp.open_prs} competing PR{opp.open_prs > 1 ? "s" : ""}</span>
            )}
          </div>
          <a
            href={opp.url} target="_blank" rel="noopener noreferrer"
            className="block text-[11px] text-zinc-300 hover:text-zinc-100 transition-colors line-clamp-2 leading-relaxed"
          >
            {opp.title}
          </a>
          {!compact && opp.description && (
            <p className="mt-1 text-[10px] text-zinc-600 line-clamp-2">{opp.description}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {opp.reward_usd != null && (
            <span className={`font-semibold tabular-nums text-green-400 ${compact ? "text-sm" : "text-base"}`}>
              {formatCurrency(opp.reward_usd)}
            </span>
          )}
          {opp.hourly_rate_est != null && !compact && (
            <span className="text-[10px] text-zinc-500 tabular-nums">{formatCurrency(opp.hourly_rate_est)}/hr</span>
          )}
          {!compact && (
            <div className="flex gap-1.5">
              {opp.status === "discovered" && (
                <button
                  onClick={() => startTransition(() => dismissOpportunity(opp.id))}
                  disabled={pending}
                  className="text-[10px] text-zinc-700 hover:text-zinc-400 transition-colors"
                >
                  dismiss
                </button>
              )}
              {opp.status === "queued" && (
                <button
                  onClick={() => startTransition(() => markOpportunityInProgress(opp.id))}
                  disabled={pending}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  start work
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
    <div className="space-y-1">
      {active.length === 0 && (
        <p className="text-[11px] text-zinc-700 py-6">
          Queue empty. Opportunities are auto-queued when discovered — run the agent to begin.
        </p>
      )}
      {active.map(w => (
        <div key={w.id} className="border border-zinc-800 p-3 hover:border-zinc-700 transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <StatusPill label={w.status} />
                <span className="text-[10px] text-zinc-700">{w.engine}</span>
                <span className="text-[10px] text-zinc-700">priority {w.priority}</span>
              </div>
              <p className="text-[11px] text-zinc-200">{w.title}</p>
              <div className="mt-1 flex items-center gap-3 text-[10px] text-zinc-600 flex-wrap">
                <span>{w.hours_invested.toFixed(1)}h invested{w.estimated_hours ? ` / ${w.estimated_hours}h est` : ""}</span>
                {(w as any).progress_note && (
                  <span className="text-zinc-500 truncate max-w-[300px]">{(w as any).progress_note}</span>
                )}
              </div>
              {(w as any).pr_url && (
                <a
                  href={(w as any).pr_url} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 mt-1 block truncate max-w-sm"
                >
                  {(w as any).pr_url}
                </a>
              )}
            </div>
            <div className="shrink-0 text-right">
              {w.expected_usd != null && (
                <span className="text-sm font-semibold tabular-nums text-green-400">{formatCurrency(w.expected_usd)}</span>
              )}
              {w.requires_approval && (
                <p className="text-[10px] text-amber-400 mt-1">approval needed</p>
              )}
            </div>
          </div>
        </div>
      ))}
      {done.length > 0 && (
        <details className="text-[10px] text-zinc-700 pt-2">
          <summary className="cursor-pointer hover:text-zinc-500 select-none">
            {done.length} completed / failed
          </summary>
          <div className="mt-2 space-y-1 pl-3 border-l border-zinc-800">
            {done.map(w => (
              <div key={w.id} className="flex items-center gap-2 py-0.5">
                <StatusPill label={w.status} />
                <span className="text-zinc-600 truncate">{w.title}</span>
                {w.expected_usd && (
                  <span className="text-zinc-700 tabular-nums ml-auto">{formatCurrency(w.expected_usd)}</span>
                )}
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
  const descriptions = {
    asset:   "Tailwind kits, icon packs, templates — Gumroad/Itch.io",
    product: "VS Code extensions, npm utilities, CLI tools",
    content: "Educational videos, data explainers — YouTube/affiliate",
  };
  return (
    <div className="space-y-6">
      {engines.map(eng => {
        const list = assets.filter(a => a.engine === eng);
        if (list.length === 0 && eng !== "asset") return null;
        return (
          <section key={eng}>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">{eng}</p>
            {list.length === 0 ? (
              <p className="text-[11px] text-zinc-700">{descriptions[eng]}</p>
            ) : (
              <div className="divide-y divide-zinc-900">
                {list.map(a => (
                  <div key={a.id} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <StatusPill label={a.status} />
                        {a.marketplace && <span className="text-[10px] text-zinc-600">{a.marketplace}</span>}
                      </div>
                      <p className="text-[11px] text-zinc-200">{a.name}</p>
                      {a.description && <p className="text-[10px] text-zinc-600 mt-0.5">{a.description}</p>}
                      {a.listing_url && (
                        <a href={a.listing_url} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-zinc-500 hover:text-zinc-300 mt-1 block truncate max-w-xs">
                          {a.listing_url}
                        </a>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums text-green-400">{formatCurrency(a.total_revenue)}</p>
                      <p className="text-[10px] text-zinc-600">{a.total_sales} sales</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
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
      <div className="flex gap-6 text-[11px]">
        <span>
          <span className="text-green-400 font-semibold tabular-nums">
            {formatCurrency(collected.reduce((s, e) => s + e.amount_usd, 0))}
          </span>
          <span className="text-zinc-600 ml-1">collected</span>
        </span>
        <span>
          <span className="text-amber-400 font-semibold tabular-nums">
            {formatCurrency(pendingList.reduce((s, e) => s + e.amount_usd, 0))}
          </span>
          <span className="text-zinc-600 ml-1">pending</span>
        </span>
        <span className="text-zinc-600">{earnings.length} records</span>
      </div>

      {earnings.length === 0 ? (
        <p className="text-[11px] text-zinc-700 py-6">No earnings logged yet.</p>
      ) : (
        <table className="w-full text-[11px] font-mono">
          <thead className="border-b border-zinc-800">
            <tr className="text-[10px] text-zinc-600">
              <th className="text-left pb-2 pr-4">Date</th>
              <th className="text-left pb-2 pr-4">Description</th>
              <th className="text-left pb-2 pr-4">Source</th>
              <th className="text-left pb-2 pr-4">Status</th>
              <th className="text-right pb-2">Amount</th>
              <th className="pb-2 w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {earnings.map(e => (
              <tr key={e.id} className="hover:bg-zinc-900/50 transition-colors">
                <td className="py-2 pr-4 text-zinc-600 tabular-nums whitespace-nowrap">{e.earned_date}</td>
                <td className="py-2 pr-4 text-zinc-300">{e.description}</td>
                <td className="py-2 pr-4 text-zinc-600">{e.source}</td>
                <td className="py-2 pr-4"><StatusPill label={e.status} /></td>
                <td className={`py-2 text-right font-semibold tabular-nums ${e.status === "collected" ? "text-green-400" : "text-amber-400"}`}>
                  {formatCurrency(e.amount_usd)}
                </td>
                <td className="py-2 pl-3">
                  {e.status === "pending" && (
                    <button
                      onClick={() => startTransition(() => markEarningCollected(e.id))}
                      disabled={pending}
                      className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors"
                    >
                      ✓
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Approvals tab ─────────────────────────────────────────────────────────────

function ApprovalsTab({ approvals }: { approvals: Approval[] }) {
  const [pending, startTransition] = useTransition();

  if (approvals.length === 0) {
    return <p className="text-[11px] text-zinc-700 py-6">No pending approvals.</p>;
  }

  const ACTION_LABELS: Record<string, string> = {
    register_account: "Create account",
    submit_pr:        "Submit PR",
    publish_asset:    "Publish",
    claim_bounty:     "Claim bounty",
    verify_identity:  "Verify identity",
  };

  return (
    <div className="space-y-3">
      {approvals.map(a => (
        <div key={a.id} className="border border-amber-400/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-amber-400">{ACTION_LABELS[a.action_type] ?? a.action_type}</span>
                <span className="text-[10px] text-zinc-700">priority {a.priority}</span>
              </div>
              <p className="text-[11px] text-zinc-200">{a.title}</p>
              <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed whitespace-pre-wrap">{a.description}</p>
              {a.action_url && (
                <a href={a.action_url} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 mt-1.5 block">
                  {a.action_url}
                </a>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={() => startTransition(() => approveAction(a.id))}
                disabled={pending}
                className="px-3 py-1.5 text-[10px] border border-zinc-600 text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-30"
              >
                done
              </button>
              <button
                onClick={() => startTransition(() => rejectAction(a.id))}
                disabled={pending}
                className="px-3 py-1.5 text-[10px] text-zinc-700 hover:text-zinc-500 transition-colors"
              >
                dismiss
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
  if (entries.length === 0) {
    return <p className="text-[11px] text-zinc-700 py-6">No activity yet.</p>;
  }
  return (
    <table className="w-full text-[10px] font-mono">
      <tbody className="divide-y divide-zinc-900">
        {entries.map(a => (
          <tr key={a.id} className="hover:bg-zinc-900/50 transition-colors">
            <td className="py-2 pr-4 text-zinc-700 whitespace-nowrap tabular-nums w-28">
              {new Date(a.created_at).toLocaleString("en-US", {
                month:"numeric", day:"numeric",
                hour:"2-digit", minute:"2-digit", hour12:false,
              })}
            </td>
            <td className={`py-2 pr-3 w-20 ${
              a.status === "error" ? "text-red-400" : a.status === "warning" ? "text-amber-400" : "text-zinc-600"
            }`}>
              {(a.engine ?? "sys").slice(0, 6)}
            </td>
            <td className="py-2 pr-3 text-zinc-600 w-32">{a.action}</td>
            <td className="py-2 text-zinc-400">{a.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

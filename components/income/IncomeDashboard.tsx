"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import {
  dismissOpportunity, markOpportunityInProgress,
  approveAction, rejectAction, markEarningCollected,
  setActiveMode, markBountyPaid,
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

// ── CSS injected once at the root ─────────────────────────────────────────────

const ARCADE_CSS = `
@keyframes arcadeSlideIn {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes arcadeBlink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
@keyframes arcadePulse {
  0%, 100% { opacity: 0.5; }
  50%       { opacity: 1; }
}
@keyframes arcadeScanBeam {
  0%   { background-position: -100% 0; }
  100% { background-position: 200% 0; }
}
.arcade-slide-in { animation: arcadeSlideIn 0.35s ease-out; }
.arcade-blink    { animation: arcadeBlink 1s step-end infinite; }
.arcade-pulse    { animation: arcadePulse 1.4s ease-in-out infinite; }
.arcade-scan-beam {
  background: linear-gradient(90deg, transparent 0%, rgba(0,229,255,0.12) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: arcadeScanBeam 2.2s linear infinite;
}
`;

// ── Utility ───────────────────────────────────────────────────────────────────

function fmtUsd(n: number) {
  return n === 0 ? "$0" : `$${n % 1 === 0 ? n : n.toFixed(2)}`;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function nextCronSlot(now: number, intervalHrs: number): number {
  const d = new Date(now);
  const h = d.getUTCHours();
  const nextSlot = Math.ceil((h + 1) / intervalHrs) * intervalHrs;
  const next = new Date(d);
  next.setUTCMinutes(0, 0, 0);
  if (nextSlot >= 24) {
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(0);
  } else {
    next.setUTCHours(nextSlot);
  }
  return next.getTime();
}

// ── HUD Header ────────────────────────────────────────────────────────────────

function HUDHeader({
  summary, discovering, discoverResult, onDiscover, paidCount, winRate, allTimeUsd,
}: {
  summary: IncomeSummary;
  discovering: boolean;
  discoverResult: string | null;
  onDiscover: () => void;
  paidCount: number;
  winRate: number;
  allTimeUsd: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const scanMs  = nextCronSlot(now, 1) - now;
  const checkMs = nextCronSlot(now, 2) - now;
  const pct     = Math.round(summary.weeklyProgress * 100);
  const filled  = Math.round(summary.weeklyProgress * 24);
  const bar     = "█".repeat(filled) + "░".repeat(24 - filled);

  return (
    <div className="border-b border-[#00ff41]/20 pb-3 mb-3">
      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-[#00ff41] font-bold tracking-[0.15em] text-sm uppercase">
              ⚡ BOUNTY ENGINE
            </span>
            {discovering && (
              <span className="text-[9px] text-[#00e5ff] border border-[#00e5ff]/40 px-1.5 py-0.5 uppercase tracking-widest arcade-blink">
                SCANNING
              </span>
            )}
          </div>
          <div className="text-[10px] text-[#007a1f] mt-1 tracking-wide">
            <span className="text-[#004d14]">[</span>
            <span className="text-[#00aa28]">{bar}</span>
            <span className="text-[#004d14]">]</span>
            <span className="ml-2 text-[#00cc33]">{fmtUsd(summary.collectedThisWeek)}</span>
            <span className="text-[#004d14]"> / $600</span>
            <span className="text-[#004d14] ml-1">({pct}%)</span>
          </div>
        </div>
        <button
          onClick={onDiscover}
          disabled={discovering}
          className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 border border-[#00e5ff]/30 text-[#00e5ff] hover:bg-[#00e5ff]/10 disabled:opacity-30 transition-colors shrink-0"
        >
          {discovering ? "..." : "[scan now]"}
        </button>
      </div>

      {/* Stats + timers row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[9px] text-[#004d14] font-mono">
        <span className="text-[#00aa28]">{fmtUsd(allTimeUsd)} all‑time</span>
        <span>·</span>
        <span>{winRate}% win rate</span>
        <span>·</span>
        <span>{paidCount} paid</span>
        <span>·</span>
        <span>scan <span className={scanMs < 300_000 ? "text-[#ffb800]" : ""}>{formatCountdown(scanMs)}</span></span>
        <span>·</span>
        <span>pr‑check <span className={checkMs < 300_000 ? "text-[#ffb800]" : ""}>{formatCountdown(checkMs)}</span></span>
        {discoverResult && (
          <>
            <span>·</span>
            <span className="text-[#00ff41]">{discoverResult}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Scan banner ───────────────────────────────────────────────────────────────

const SOURCES = ["ALGORA", "ISSUEHUNT", "OPIRE", "GITHUB"];

function ScanBanner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame(f => (f + 1) % 4), 350);
    return () => clearInterval(t);
  }, []);
  const dots = ["", ".", "..", "..."][frame];

  return (
    <div className="border border-[#00e5ff]/30 mb-3 px-4 py-2 relative overflow-hidden arcade-scan-beam">
      <div className="relative">
        <span className="text-[#00e5ff] text-[10px] font-bold uppercase tracking-widest">
          ⟳ DISCOVERY SCAN{dots}
        </span>
        <div className="flex gap-5 mt-1">
          {SOURCES.map((src, i) => (
            <span
              key={src}
              className="text-[9px] uppercase tracking-widest transition-colors duration-300"
              style={{ color: frame > i ? "#00ff41" : "#003d10" }}
            >
              {src}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Agent CTA ─────────────────────────────────────────────────────────────────

function AgentCTA({ count, projected }: { count: number; projected: number }) {
  const [copied, setCopied] = useState(false);
  const cmd = "node scripts/income-agent.mjs";
  function copy() {
    navigator.clipboard.writeText(cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }
  return (
    <div className="border border-[#ffb800]/30 bg-[#ffb800]/5 mb-3 px-4 py-2 flex items-center justify-between gap-4">
      <div>
        <span className="text-[#ffb800] text-[10px] font-bold uppercase tracking-widest arcade-pulse">
          ⚡ {count} BOUNTIES READY
        </span>
        {projected > 0 && (
          <span className="text-[#007a1f] text-[9px] ml-3">{fmtUsd(projected)} projected</span>
        )}
      </div>
      <button
        onClick={copy}
        className="text-[9px] font-mono text-[#004d14] hover:text-[#00aa28] border border-[#004d14] hover:border-[#00aa28] px-2 py-0.5 transition-colors whitespace-nowrap"
      >
        {copied ? "✓ copied" : cmd}
      </button>
    </div>
  );
}

// ── Mission card ──────────────────────────────────────────────────────────────

function MissionCard({ item, isFresh }: { item: any; isFresh: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [markedPaid, setMarkedPaid] = useState(false);

  if (markedPaid) return null;

  const STATUS_ICON: Record<string, string> = {
    pending:     "○",
    in_progress: "●",
    review:      "◈",
    submitted:   "◎",
    done:        "✓",
    failed:      "✗",
    cancelled:   "–",
  };
  const STATUS_COLOR: Record<string, string> = {
    pending:     "#00aa28",
    in_progress: "#ffb800",
    review:      "#00e5ff",
    submitted:   "#00cc33",
    done:        "#00ff41",
    failed:      "#ff2244",
    cancelled:   "#003d10",
  };
  const BORDER: Record<string, string> = {
    pending:     "border-[#00cc33]/15",
    in_progress: "border-[#ffb800]/40",
    review:      "border-[#00e5ff]/30",
    submitted:   "border-[#00cc33]/30",
    done:        "border-[#00ff41]/60",
    failed:      "border-[#ff2244]/25",
    cancelled:   "border-[#002208]",
  };

  const status = item.status as string;
  const icon   = STATUS_ICON[status] ?? "?";
  const color  = STATUS_COLOR[status] ?? "#004d14";
  const border = BORDER[status] ?? "border-[#00cc33]/10";

  return (
    <div
      className={`border ${border} mb-1.5 ${isFresh ? "arcade-slide-in" : ""}`}
      style={{ background: "rgba(0,8,0,0.95)" }}
    >
      {/* Top row: status + reward */}
      <div className="flex items-center justify-between px-3 pt-2 pb-0.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-sm shrink-0 ${status === "in_progress" ? "arcade-blink" : ""}`}
            style={{ color }}
          >
            {icon}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-widest shrink-0" style={{ color }}>
            {status.replace("_", " ")}
          </span>
        </div>
        {item.expected_usd > 0 && (
          <span className="text-[#00ff41] font-bold text-sm tabular-nums shrink-0">
            {fmtUsd(item.expected_usd)}
          </span>
        )}
      </div>

      {/* Title */}
      <div className="px-3 pb-2">
        <p className="text-[11px] text-[#00cc33] leading-snug mb-1 line-clamp-2">{item.title}</p>

        {/* Progress bar */}
        {status === "in_progress" && (
          <div className="mt-1 mb-1.5">
            <div className="relative h-[2px] bg-[#002208] w-full">
              <div
                className="absolute inset-y-0 left-0 bg-[#ffb800] transition-all duration-1000"
                style={{ width: `${item.progress_pct ?? 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[9px] text-[#007a1f]">{item.progress_pct ?? 0}%</span>
              {item.progress_note && (
                <span className="text-[9px] text-[#005a16] truncate max-w-[200px] ml-2">
                  {item.progress_note}
                </span>
              )}
            </div>
          </div>
        )}

        {/* PR link */}
        {item.pr_url && (
          <a
            href={item.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] text-[#00e5ff]/60 hover:text-[#00e5ff] block truncate mt-0.5"
          >
            → {item.pr_url.replace("https://github.com/", "gh/")}
          </a>
        )}

        {/* Mark paid */}
        {status === "done" && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[9px] text-[#007a1f]">awaiting payment</span>
            <button
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await markBountyPaid(item.id);
                  setMarkedPaid(true);
                  router.refresh();
                })
              }
              className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border border-[#ffb800]/60 text-[#ffb800] hover:bg-[#ffb800]/10 disabled:opacity-30 transition-colors arcade-pulse"
            >
              [mark paid]
            </button>
          </div>
        )}

        {/* Progress note for non-in_progress */}
        {status !== "in_progress" && status !== "done" && item.progress_note && (
          <p className="text-[9px] text-[#005a16] mt-0.5 truncate">{item.progress_note}</p>
        )}
      </div>
    </div>
  );
}

// ── Active missions panel ─────────────────────────────────────────────────────

function ArcadeMissions({ initialItems, userId }: { initialItems: any[]; userId: string }) {
  const [items, setItems] = useState<any[]>(initialItems);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    const channel = (supabase as any)
      .channel(`arcade_missions_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "income_work_queue", filter: `user_id=eq.${userId}` },
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            setItems(prev => [payload.new, ...prev]);
            setFreshIds(prev => new Set([...prev, payload.new.id]));
            setTimeout(() => setFreshIds(prev => { const n = new Set(prev); n.delete(payload.new.id); return n; }), 1800);
          } else if (payload.eventType === "UPDATE") {
            setItems(prev => prev.map(i => i.id === payload.new.id ? { ...i, ...payload.new } : i));
          } else if (payload.eventType === "DELETE") {
            setItems(prev => prev.filter(i => i.id !== payload.old.id));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const active = items.filter(i =>
    ["pending", "in_progress", "review", "submitted", "done"].includes(i.status)
  );

  if (active.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-2xl text-[#003d10] mb-1">◌</div>
        <div className="text-[9px] text-[#003d10] uppercase tracking-widest">no active missions</div>
      </div>
    );
  }

  return (
    <div>
      {active.map(item => (
        <MissionCard key={item.id} item={item} isFresh={freshIds.has(item.id)} />
      ))}
    </div>
  );
}

// ── Queue panel ───────────────────────────────────────────────────────────────

function ArcadeQueue({ pending }: { pending: any[] }) {
  if (pending.length === 0) return null;
  return (
    <div className="border border-[#00ff41]/10 mt-2">
      <div className="border-b border-[#00ff41]/10 px-3 py-1.5 flex items-center gap-2">
        <span className="text-[9px] text-[#007a1f] uppercase tracking-widest">
          queue
        </span>
        <span className="text-[9px] text-[#004d14]">({pending.length})</span>
      </div>
      <div>
        {pending.slice(0, 10).map((item, i) => (
          <div
            key={item.id}
            className="px-3 py-1.5 flex items-center gap-2 border-b border-[#003d10]/50 last:border-0"
          >
            <span className="text-[9px] text-[#003d10] tabular-nums w-4 shrink-0">{i + 1}</span>
            <span className="text-[10px] text-[#00aa28] flex-1 truncate min-w-0">{item.title}</span>
            {item.expected_usd > 0 && (
              <span className="text-[10px] text-[#00ff41] tabular-nums shrink-0">{fmtUsd(item.expected_usd)}</span>
            )}
          </div>
        ))}
        {pending.length > 10 && (
          <div className="px-3 py-1 text-[9px] text-[#003d10]">+{pending.length - 10} more</div>
        )}
      </div>
    </div>
  );
}

// ── Detail tabs ───────────────────────────────────────────────────────────────

function ScanTab({
  opps, onDismiss, onQueue, onMark,
}: {
  opps: Opportunity[];
  onDismiss: (id: string) => void;
  onQueue: (id: string) => void;
  onMark: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "queued" | "discovered">("all");
  const filtered = filter === "all"
    ? opps
    : opps.filter(o => o.status === filter);

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {(["all", "discovered", "queued"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[9px] uppercase tracking-widest px-2 py-0.5 border transition-colors ${
              filter === f
                ? "border-[#00ff41]/40 text-[#00ff41]"
                : "border-[#004d14] text-[#004d14] hover:text-[#00aa28]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="space-y-px">
        {filtered.slice(0, 60).map(opp => (
          <div key={opp.id} className="flex items-start gap-2 py-1.5 px-2 border border-[#00ff41]/8 hover:border-[#00ff41]/20 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-[#00cc33] truncate max-w-[400px]">{opp.title}</span>
                {opp.reward_usd && opp.reward_usd > 0 && (
                  <span className="text-[9px] text-[#00ff41] tabular-nums">{fmtUsd(opp.reward_usd)}</span>
                )}
                <span className="text-[9px] text-[#004d14]">{opp.source}</span>
                {opp.score && <span className="text-[9px] text-[#007a1f]">s:{opp.score}</span>}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              {opp.status === "discovered" && (
                <button onClick={() => onQueue(opp.id)} className="text-[9px] text-[#007a1f] hover:text-[#00ff41] border border-[#004d14] hover:border-[#00ff41]/40 px-1.5 py-0.5 transition-colors">
                  +queue
                </button>
              )}
              <button onClick={() => onDismiss(opp.id)} className="text-[9px] text-[#004d14] hover:text-[#ff2244] border border-[#003d10] hover:border-[#ff2244]/40 px-1.5 py-0.5 transition-colors">
                ✕
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-[9px] text-[#003d10] py-6 text-center uppercase tracking-widest">
            no opportunities
          </div>
        )}
      </div>
    </div>
  );
}

function LedgerTab({ earnings }: { earnings: Earning[] }) {
  return (
    <div className="space-y-px">
      {earnings.length === 0 && (
        <div className="text-[9px] text-[#003d10] py-6 text-center uppercase tracking-widest">no earnings yet</div>
      )}
      {earnings.slice(0, 60).map(e => (
        <div key={e.id} className="flex items-center gap-3 py-1.5 px-2 border border-[#00ff41]/8">
          <span className="text-[9px] text-[#004d14] tabular-nums w-20 shrink-0">{e.earned_date}</span>
          <span className="text-[10px] text-[#00aa28] flex-1 truncate min-w-0">{e.description}</span>
          <span className="text-[9px] text-[#004d14] shrink-0">{e.engine}</span>
          <span className={`text-[9px] tabular-nums shrink-0 ${e.status === "collected" ? "text-[#00ff41]" : "text-[#ffb800]"}`}>
            {fmtUsd(e.amount_usd)}
          </span>
        </div>
      ))}
    </div>
  );
}

function AssetsTab({ assets }: { assets: Asset[] }) {
  return (
    <div className="space-y-px">
      {assets.length === 0 && (
        <div className="text-[9px] text-[#003d10] py-6 text-center uppercase tracking-widest">no assets yet</div>
      )}
      {assets.map(a => (
        <div key={a.id} className="flex items-center gap-3 py-1.5 px-2 border border-[#00ff41]/8">
          <span className="text-[10px] text-[#00aa28] flex-1 truncate">{a.name}</span>
          <span className="text-[9px] text-[#004d14]">{a.marketplace ?? "—"}</span>
          <span className="text-[9px] text-[#007a1f]">{a.status}</span>
          {a.total_revenue > 0 && (
            <span className="text-[9px] text-[#00ff41] tabular-nums">{fmtUsd(a.total_revenue)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function ApprovalsTab({
  approvals, onApprove, onReject,
}: {
  approvals: Approval[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {approvals.length === 0 && (
        <div className="text-[9px] text-[#003d10] py-6 text-center uppercase tracking-widest">no pending approvals</div>
      )}
      {approvals.map(a => (
        <div key={a.id} className="border border-[#ffb800]/20 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-[#ffb800]">{a.title}</p>
              {a.description && (
                <p className="text-[9px] text-[#007a1f] mt-1 line-clamp-2">{a.description}</p>
              )}
              {a.action_url && (
                <a href={a.action_url} target="_blank" rel="noopener noreferrer"
                  className="text-[9px] text-[#00e5ff]/60 hover:text-[#00e5ff] mt-0.5 block truncate">
                  → {a.action_url.replace("https://github.com/", "gh/")}
                </a>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => onApprove(a.id)} className="text-[9px] font-bold border border-[#00ff41]/40 text-[#00ff41] hover:bg-[#00ff41]/10 px-2 py-0.5 transition-colors uppercase tracking-widest">
                ok
              </button>
              <button onClick={() => onReject(a.id)} className="text-[9px] border border-[#ff2244]/30 text-[#ff2244]/70 hover:text-[#ff2244] hover:bg-[#ff2244]/10 px-2 py-0.5 transition-colors uppercase tracking-widest">
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LogTab({ activity }: { activity: ActivityEntry[] }) {
  return (
    <div className="space-y-px font-mono">
      {activity.slice(0, 80).map(a => {
        const ts  = new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const col = a.status === "ok" ? "text-[#00aa28]" : a.status === "warning" ? "text-[#ffb800]" : "text-[#ff2244]";
        return (
          <div key={a.id} className="flex items-baseline gap-2 py-0.5 px-1">
            <span className="text-[9px] text-[#003d10] tabular-nums w-10 shrink-0">{ts}</span>
            <span className={`text-[9px] ${col} flex-1 leading-relaxed`}>{a.detail ?? a.action}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function IncomeDashboard({ summary, allEarnings, allAssets, userId, pipelineItems }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("scan");
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // ── Derived stats ────────────────────────────────────────────────────────
  const activePipeline  = pipelineItems.filter(w => !["done", "failed", "cancelled"].includes(w.status)).length;
  const pendingQueue    = summary.workQueue.filter(w => w.status === "pending");
  const submittedCount  = pipelineItems.filter(w => w.status === "submitted").length;
  const doneCount       = pipelineItems.filter(w => w.status === "done").length;
  const paidCount       = allEarnings.filter(e => e.status === "collected").length;
  const allTimeUsd      = allEarnings.filter(e => e.status === "collected").reduce((s, e) => s + e.amount_usd, 0);
  const totalAttempted  = submittedCount + doneCount + paidCount;
  const totalWon        = doneCount + paidCount;
  const winRate         = totalAttempted > 0 ? Math.round((totalWon / totalAttempted) * 100) : 0;

  const detailTabs: { id: Tab; label: string; count?: number }[] = [
    { id: "scan",      label: "scan",      count: summary.activeOpportunities || undefined },
    { id: "ledger",    label: "ledger",    count: allEarnings.length || undefined },
    { id: "assets",    label: "assets",    count: allAssets.length || undefined },
    { id: "approvals", label: "approvals", count: summary.pendingApprovals || undefined },
    { id: "log",       label: "log" },
  ];

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverResult(null);
    try {
      const res  = await fetch("/api/income/discover");
      const data = await res.json();
      setDiscoverResult(data.ok ? `+${data.new} new` : "err");
      if (data.ok) router.refresh();
    } catch {
      setDiscoverResult("err");
    } finally {
      setDiscovering(false);
    }
  }

  // ── Funnel numbers ───────────────────────────────────────────────────────
  const funnel = [
    { label: "discovered", n: summary.activeOpportunities },
    { label: "waiting",    n: pendingQueue.length },
    { label: "working",    n: pipelineItems.filter(w => w.status === "in_progress").length },
    { label: "review",     n: pipelineItems.filter(w => w.status === "review").length },
    { label: "pr open",    n: submittedCount },
    { label: "merged",     n: doneCount },
    { label: "paid",       n: paidCount },
  ];

  return (
    <div className="bg-black text-[#00cc33] font-mono min-h-[calc(100vh)] -mx-4 -mt-6 -mb-6 px-4 pt-4 pb-8">
      <style dangerouslySetInnerHTML={{ __html: ARCADE_CSS }} />
      <div className="max-w-[1800px] mx-auto">

        {/* ── HUD header ─────────────────────────────────────────────── */}
        <HUDHeader
          summary={summary}
          discovering={discovering}
          discoverResult={discoverResult}
          onDiscover={handleDiscover}
          paidCount={paidCount}
          winRate={winRate}
          allTimeUsd={allTimeUsd}
        />

        {/* ── Scan banner ─────────────────────────────────────────────── */}
        {discovering && <ScanBanner />}

        {/* ── Funnel strip ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3 text-[9px] text-[#003d10]">
          {funnel.map((f, i) => (
            <span key={f.label} className="flex items-center gap-1">
              {i > 0 && <span className="text-[#002208]">→</span>}
              <span className={f.n > 0 ? "text-[#007a1f]" : ""}>{f.n}</span>
              <span>{f.label}</span>
            </span>
          ))}
        </div>

        {/* ── Agent CTA ──────────────────────────────────────────────────── */}
        {pendingQueue.length > 0 && (
          <AgentCTA count={pendingQueue.length} projected={summary.queueProjectedUsd} />
        )}

        {/* ── Main 2-panel ───────────────────────────────────────────────── */}
        <div className="flex gap-3">

          {/* Left: missions + queue */}
          <div className="flex-1 min-w-0">
            {/* Missions panel */}
            <div className="border border-[#00ff41]/12">
              <div className="border-b border-[#00ff41]/12 px-3 py-1.5 flex items-center justify-between">
                <span className="text-[9px] text-[#007a1f] uppercase tracking-widest">
                  active missions
                </span>
                <span className="text-[9px] text-[#004d14]">
                  {activePipeline > 0 ? activePipeline : "0"}
                </span>
              </div>
              <div className="p-2">
                <ArcadeMissions userId={userId} initialItems={pipelineItems} />
              </div>
            </div>

            {/* Queue */}
            <ArcadeQueue pending={pendingQueue} />
          </div>

          {/* Right: terminal feed */}
          <div className="w-[360px] xl:w-[420px] shrink-0 h-[calc(100vh-230px)] sticky top-4">
            <IncomeTerminalFeed
              initialEntries={summary.recentActivity}
              lastDiscoveryRun={summary.lastDiscoveryRun}
            />
          </div>
        </div>

        {/* ── Detail section ─────────────────────────────────────────────── */}
        <div className="mt-5 border-t border-[#00ff41]/10 pt-3">
          {/* Tab bar */}
          <div className="flex border-b border-[#00ff41]/10 mb-3">
            {detailTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1 text-[9px] uppercase tracking-widest transition-colors ${
                  tab === t.id
                    ? "text-[#00ff41] border-b border-[#00ff41]"
                    : "text-[#004d14] hover:text-[#00aa28]"
                }`}
              >
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span className="ml-1 text-[#004d14]">({t.count})</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === "scan" && (
            <ScanTab
              opps={summary.topOpportunities as Opportunity[]}
              onDismiss={id => startTransition(() => dismissOpportunity(id).then(() => router.refresh()))}
              onQueue={id => startTransition(() => markOpportunityInProgress(id).then(() => router.refresh()))}
              onMark={id => startTransition(() => markOpportunityInProgress(id).then(() => router.refresh()))}
            />
          )}
          {tab === "ledger" && <LedgerTab earnings={allEarnings} />}
          {tab === "assets" && <AssetsTab assets={allAssets} />}
          {tab === "approvals" && (
            <ApprovalsTab
              approvals={summary.approvals as Approval[]}
              onApprove={id => startTransition(() => approveAction(id).then(() => router.refresh()))}
              onReject={id => startTransition(() => rejectAction(id).then(() => router.refresh()))}
            />
          )}
          {tab === "log" && <LogTab activity={summary.recentActivity} />}
        </div>
      </div>
    </div>
  );
}

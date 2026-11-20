"use client";

import { useState, useEffect, useTransition, useRef } from "react";
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
@keyframes tileEnter {
  0%  { opacity:0; transform:scale(0.3) rotate(-8deg); }
  65% { transform:scale(1.08) rotate(1deg); }
  100%{ opacity:1; transform:scale(1) rotate(0deg); }
}
@keyframes tileSubmit {
  0%,100%{ opacity:1; }
  25%    { transform:scale(1.18); }
  50%    { transform:scale(1); }
  75%    { transform:scale(1.08); }
}
@keyframes tilePulse {
  0%,100%{ box-shadow:none; }
  50%    { box-shadow:0 0 14px 2px var(--ta,#fff4); }
}

.text-glow   { animation: textGlow 3s ease-in-out infinite }
.green-glow  { animation: greenGlow 3s ease-in-out infinite }
.border-live { animation: borderLive 2.5s ease-in-out infinite }
.cursor      { animation: blink 1s step-end infinite }
.idle-pulse  { animation: idlePulse 3s ease-in-out infinite }
.fade-up     { animation: fadeUp .35s ease-out both }
.slow-fade   { animation: slowFade 2.5s ease-in-out infinite }
.scan-prog   { transform-origin:left; animation: scanProg 55s linear forwards }
.tile-enter  { animation: tileEnter .32s cubic-bezier(0.34,1.56,0.64,1) both }
.tile-submit { animation: tileSubmit .5s ease-out, tilePulse 1.5s ease-in-out 2 }
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

// ── bounty tile (pixel square) ───────────────────────────────────────────────

function BountyTile({ id, title, usdAmt, url, fresh, submitted }: {
  id: string; title: string; usdAmt: number; url?: string | null; fresh?: boolean; submitted?: boolean;
}) {
  const accent = bountyAccent(title);
  const [tip, setTip] = useState(false);
  const label = usdAmt >= 1000
    ? `$${(usdAmt / 1000 % 1 === 0 ? (usdAmt / 1000).toFixed(0) : (usdAmt / 1000).toFixed(1))}k`
    : usdAmt > 0 ? `$${Math.round(usdAmt)}`
    : "—";

  return (
    <div className="relative" onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
      <div
        className={`w-14 h-14 flex items-center justify-center cursor-pointer select-none transition-all duration-150 ${fresh ? (submitted ? "tile-submit" : "tile-enter") : ""}`}
        style={{
          border: `1px solid ${accent}`,
          background: `color-mix(in srgb, ${accent} 10%, transparent)`,
          ["--ta" as any]: accent + "66",
          boxShadow: tip ? `0 0 12px 1px ${accent}44` : "none",
        }}
        onClick={() => url && window.open(url, "_blank")}
      >
        <span className="text-[11px] font-mono font-semibold tabular-nums" style={{ color: accent }}>{label}</span>
      </div>
      {tip && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-52 bg-zinc-950 border border-zinc-700 p-2 pointer-events-none" style={{ borderLeftColor: accent, borderLeftWidth: 2 }}>
          <p className="text-[11px] text-white leading-snug mb-1">{title}</p>
          {url && <p className="text-[10px] text-zinc-600 truncate">{url.replace("https://github.com/", "")}</p>}
        </div>
      )}
    </div>
  );
}

function BoardColumn({ label, colorLabel, items, fresh, submitted }: {
  label: string; colorLabel: string; items: { id: string; title: string; usdAmt: number; url?: string | null }[];
  fresh?: Set<string>; submitted?: Set<string>;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-widest" style={{ color: colorLabel }}>{label}</span>
        {items.length > 0 && <span className="text-[10px] text-zinc-700">{items.length}</span>}
      </div>
      <div className="flex flex-wrap gap-2 content-start min-h-[3.5rem]">
        {items.map(item => (
          <BountyTile
            key={item.id}
            id={item.id}
            title={item.title}
            usdAmt={item.usdAmt}
            url={item.url}
            fresh={fresh?.has(item.id)}
            submitted={submitted?.has(item.id)}
          />
        ))}
        {items.length === 0 && <span className="text-[11px] text-zinc-800 self-center">—</span>}
      </div>
    </div>
  );
}

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
          <p className="text-sm leading-snug" style={{ color: bountyAccent(item.title || "") }}>{item.title}</p>

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

// ── audio cues ────────────────────────────────────────────────────────────────

function playScanSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Radar sweep: rising sine + short tail
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.09, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

async function notifyScan(detail: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") await Notification.requestPermission();
  if (Notification.permission === "granted") {
    new Notification("TLS — Scan complete", { body: detail || "Discovery run finished", icon: "/icon.png" });
  }
}

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

function HeaderStats({ summary, winRate, allTimeUsd, openPRs, totalSubmissions, lastScanTs }: {
  summary: IncomeSummary; winRate: number; allTimeUsd: number; openPRs: number; totalSubmissions: number; lastScanTs: string | null;
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

type FeedLine = { id: string; ts: string; type: string; typeColor: string; msg: string; accent: string; bountyKey?: string };

const BOUNTY_PALETTE = ["#e879f9","#fb923c","#facc15","#a3e635","#34d399","#22d3ee","#818cf8","#f472b6","#ff6b6b","#4ecdc4"];

function bountyAccent(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return BOUNTY_PALETTE[Math.abs(h) % BOUNTY_PALETTE.length];
}

function formatFeedEntry(action: string, detail: string): { type: string; typeColor: string; msg: string; bountyKey?: string } {
  switch (action) {
    case "discovery_run":
      return { type: "SCAN",       typeColor: "#2dd4bf", msg: detail };
    case "agent_pr_opened": {
      const [title, url] = detail.split(" → ");
      const prNum = url?.match(/pull\/(\d+)/)?.[1];
      const repo  = url?.match(/github\.com\/[^/]+\/([^/]+)/)?.[1];
      const msg   = prNum && repo ? `#${prNum} on ${repo} — ${title || ""}` : detail;
      return { type: "SUBMITTED",  typeColor: "#38bdf8", msg, bountyKey: title };
    }
    case "pr_merged":
      return { type: "MERGED",     typeColor: "#4ade80", msg: detail, bountyKey: detail };
    case "pr_closed":
      return { type: "PR CLOSED",  typeColor: "#a1a1aa", msg: detail, bountyKey: detail };
    case "agent_no_changes":
      return { type: "NO CHANGE",  typeColor: "#fbbf24", msg: `No changes made — ${detail}`, bountyKey: detail };
    case "agent_skip":
      return { type: "SKIPPED",    typeColor: "#52525b", msg: detail };
    case "agent_error":
      return { type: "ERROR",      typeColor: "#f87171", msg: detail };
    case "opportunity_queued":
      return { type: "STAGED",     typeColor: "#a1a1aa", msg: detail, bountyKey: detail };
    case "opportunity_dismissed":
      return { type: "DISMISSED",  typeColor: "#3f3f46", msg: detail };
    case "earning_logged":
      return { type: "EARNED",     typeColor: "#4ade80", msg: detail };
    case "approval_approved":
      return { type: "APPROVED",   typeColor: "#4ade80", msg: detail };
    case "pr_check_run":
      return { type: "CI",         typeColor: "#52525b", msg: detail };
    case "pipeline_start":
      return { type: "PIPELINE",   typeColor: "#52525b", msg: detail };
    case "pipeline_end":
      return { type: "PIPELINE",   typeColor: "#4ade80", msg: detail };
    default:
      return { type: action.replace(/_/g, " ").toUpperCase().slice(0, 10), typeColor: "#52525b", msg: detail };
  }
}

function LiveFeed({ userId, stagedCount, projected, onScan }: { userId: string; stagedCount: number; projected: number; onScan?: (ts: string) => void }) {
  const [lines, setLines] = useState<FeedLine[]>([]);
  const [runState, setRunState] = useState<"idle" | "running" | "done" | "copied">("idle");
  const [serverAddr, setServerAddr] = useState(DEFAULT_AGENT_SERVER);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setServerAddr(getAgentServer()); }, []);

  function add(type: string, typeColor: string, msg: string, accent: string, bountyKey?: string) {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLines(prev => [...prev.slice(-99), { id: `${Date.now()}-${Math.random()}`, ts, type, typeColor, msg, accent, bountyKey }]);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  // Load history from activity log on mount
  useEffect(() => {
    const sb = createClient();
    (sb as any).from("income_activity_log")
      .select("id,action,detail,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }: any) => {
        if (!data?.length) return;
        const history: FeedLine[] = data.reverse().map((e: any) => {
          const ts = new Date(e.created_at).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const { type, typeColor, msg, bountyKey } = formatFeedEntry(e.action, e.detail || "");
          return { id: e.id, ts, type, typeColor, msg, accent: bountyKey ? bountyAccent(bountyKey) : "#71717a", bountyKey };
        });
        setLines(history);
      });
  }, [userId]);

  useEffect(() => {
    const sb = createClient();

    const ch1 = (sb as any).channel(`lf_wq_${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "income_work_queue", filter: `user_id=eq.${userId}` }, (p: any) => {
        const title = (p.new.title || "").slice(0, 48);
        const st = p.new.status;
        const [label, typeColor] =
          st === "in_progress" ? ["WORKING",   "#2dd4bf"] :
          st === "submitted"   ? ["SUBMITTED", "#38bdf8"] :
          st === "done"        ? ["MERGED",    "#4ade80"] :
          st === "failed"      ? ["FAILED",    "#f87171"] :
          st === "review"      ? ["REVIEW",    "#fbbf24"] :
          st === "pending"     ? ["STAGED",    "#a1a1aa"] :
                                 [st.toUpperCase(), "#52525b"];
        add(label, typeColor, title, bountyAccent(title), title);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "income_work_queue", filter: `user_id=eq.${userId}` }, (p: any) => {
        const t = p.new.title || "";
        add("QUEUED", "#a1a1aa", t, bountyAccent(t), t);
      })
      .subscribe();

    const ch2 = (sb as any).channel(`lf_log_${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "income_activity_log", filter: `user_id=eq.${userId}` }, (p: any) => {
        const { type, typeColor, msg, bountyKey } = formatFeedEntry(p.new.action, p.new.detail || "");
        add(type, typeColor, msg, bountyKey ? bountyAccent(bountyKey) : "#71717a", bountyKey);
        if (p.new.action === "discovery_run") {
          playScanSound();
          notifyScan(p.new.detail || "");
          onScan?.(p.new.created_at || new Date().toISOString());
        }
      })
      .subscribe();

    return () => { sb.removeChannel(ch1); sb.removeChannel(ch2); };
  }, [userId]);

  async function run() {
    if (runState === "running") return;
    setRunState("running");
    add("RUN", "#fbbf24", "pipeline triggered", "#fbbf24");
    try {
      const r = await fetch(`${serverAddr}/run`, { method: "POST", signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error();
      setRunState("done");
      setTimeout(() => setRunState("idle"), 3000);
    } catch {
      await navigator.clipboard.writeText("node scripts/income-agent.mjs");
      add("RUN", "#f87171", "server offline — command copied to clipboard", "#f87171");
      setRunState("copied");
      setTimeout(() => setRunState("idle"), 2500);
    }
  }

  const btnLabel =
    runState === "running" ? "running…" :
    runState === "done"    ? "✓ started" :
    runState === "copied"  ? "copied" :
    "run pipeline";

  const btnCls =
    runState === "running" ? "border-teal-800 text-teal-400" :
    runState === "done"    ? "border-emerald-900 text-emerald-400" :
    runState === "copied"  ? "border-amber-900 text-amber-400" :
    "border-zinc-700 text-white hover:border-white";

  return (
    <div className="border border-zinc-900 mb-6 font-mono">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-900 bg-zinc-950">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Live</span>
          {stagedCount > 0 && (
            <span className="text-[11px] text-zinc-500">
              <span className="text-emerald-400">{stagedCount}</span> staged
              {projected > 0 && <span className="text-zinc-700 ml-1.5">{usd(projected)}</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={run}
            disabled={runState === "running"}
            className={`text-xs border px-3 py-1 transition-all disabled:opacity-50 ${btnCls}`}>
            {btnLabel}
          </button>
          <button
            onClick={() => {
              const cur = getAgentServer();
              const next = window.prompt("Agent server address:", cur);
              if (next?.trim()) {
                const addr = next.trim().startsWith("http") ? next.trim() : `http://${next.trim()}`;
                localStorage.setItem("tls_agent_server", addr);
                setServerAddr(addr);
              }
            }}
            title={`Agent server: ${serverAddr}`}
            className="text-zinc-700 hover:text-zinc-500 transition-colors text-xs">
            ⚙
          </button>
        </div>
      </div>
      {/* feed */}
      <div className="h-[42vh] overflow-y-auto px-4 py-2 space-y-px bg-black">
        {lines.length === 0 && (
          <p className="text-[11px] text-zinc-800 py-1 select-none">— waiting for activity —</p>
        )}
        {lines.map(l => {
          // Split message so only the bounty name gets accent color; rest is white
          let msgNode: React.ReactNode = <span className="text-white">{l.msg}</span>;
          if (l.bountyKey && l.msg.includes(l.bountyKey)) {
            const idx = l.msg.indexOf(l.bountyKey);
            const before = l.msg.slice(0, idx);
            const after  = l.msg.slice(idx + l.bountyKey.length);
            msgNode = <>
              {before && <span className="text-white">{before}</span>}
              <span style={{ color: l.accent }}>{l.bountyKey}</span>
              {after && <span className="text-white">{after}</span>}
            </>;
          }
          return (
            <div key={l.id} className="flex gap-3 text-[11px] leading-5">
              <span className="text-zinc-700 shrink-0 tabular-nums">{l.ts}</span>
              <span className="shrink-0 w-16 tabular-nums" style={{ color: l.typeColor }}>{l.type}</span>
              <span className="break-words min-w-0">{msgNode}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [, startT] = useTransition();

  // Live pipeline items — realtime subscription keeps these current
  const [liveItems, setLiveItems] = useState<any[]>(pipelineItems);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [lastScanTs, setLastScanTs] = useState<string | null>(summary.lastDiscoveryRun);

  // Sync when server props refresh (router.refresh() polling)
  useEffect(() => { setLiveItems(pipelineItems); }, [pipelineItems]);

  useEffect(() => {
    const sb = createClient();
    const ch = (sb as any).channel(`m_${userId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "income_work_queue", filter: `user_id=eq.${userId}`,
      }, (p: any) => {
        if (p.eventType === "INSERT") {
          setLiveItems(prev => [p.new, ...prev]);
          setFresh(prev => new Set([...prev, p.new.id]));
          setTimeout(() => setFresh(prev => { const n = new Set(prev); n.delete(p.new.id); return n; }), 800);
          if (p.new.status === "pending") playBountyChime();
        } else if (p.eventType === "UPDATE") {
          setLiveItems(prev => prev.map(i => i.id === p.new.id ? { ...i, ...p.new } : i));
          if (p.new.status === "submitted") {
            setFresh(prev => new Set([...prev, p.new.id]));
            setSubmitted(prev => new Set([...prev, p.new.id]));
            setTimeout(() => {
              setFresh(prev => { const n = new Set(prev); n.delete(p.new.id); return n; });
              setSubmitted(prev => { const n = new Set(prev); n.delete(p.new.id); return n; });
            }, 1200);
          }
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

  // Polling fallback — refreshes server props every 10s in case realtime isn't firing
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <HeaderStats summary={summary} winRate={winRate} allTimeUsd={allTimeUsd} openPRs={openPRs} totalSubmissions={totalAttempted} lastScanTs={lastScanTs} />
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

        {/* ── live feed ───────────────────────────────────────────────── */}
        <LiveFeed userId={userId} stagedCount={pendingQueue.length} projected={summary.queueProjectedUsd} onScan={ts => setLastScanTs(ts)} />

        {/* ── 3-column bounty board ────────────────────────────────────── */}
        <section className="mb-8 grid grid-cols-3 gap-6 border-t border-zinc-900 pt-5">
          <BoardColumn
            label="Scanned"
            colorLabel="#2dd4bf"
            items={(summary.topOpportunities as Opportunity[])
              .filter(o => !["dismissed","queued","in_progress","submitted","done","paid"].includes(o.status))
              .slice(0, 20)
              .map(o => ({ id: o.id, title: o.title, usdAmt: o.reward_usd ?? 0, url: o.url }))}
            fresh={fresh}
          />
          <BoardColumn
            label="Waiting"
            colorLabel="#fbbf24"
            items={liveItems
              .filter(i => ["pending","in_progress","review"].includes(i.status))
              .map(i => ({ id: i.id, title: i.title, usdAmt: i.expected_usd ?? 0, url: i.income_opportunities?.url ?? null }))}
            fresh={fresh}
          />
          <BoardColumn
            label="Submitted"
            colorLabel="#38bdf8"
            items={liveItems
              .filter(i => i.status === "submitted")
              .map(i => ({ id: i.id, title: i.title, usdAmt: i.expected_usd ?? 0, url: i.pr_url ?? null }))}
            fresh={fresh}
            submitted={submitted}
          />
        </section>

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

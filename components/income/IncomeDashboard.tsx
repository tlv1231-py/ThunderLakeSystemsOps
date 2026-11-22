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
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

/* ── global 8-bit typeface ───────────────────────────────────────────────── */
.tls-dash, .tls-dash * {
  font-family: 'Press Start 2P', 'Courier New', monospace !important;
  -webkit-font-smoothing: none !important;
  font-smoothing: none !important;
}
/* Size scale for pixel font — values must always be visibly larger than their labels */
.tls-dash .text-2xl          { font-size:14px !important; line-height:1.5 !important; }
.tls-dash .text-xl           { font-size:12px !important; line-height:1.6 !important; }
.tls-dash .text-lg           { font-size:11px !important; line-height:1.6 !important; }
.tls-dash .text-base         { font-size:10px !important; line-height:1.8 !important; }
.tls-dash .text-sm           { font-size:9px  !important; line-height:1.9 !important; }
.tls-dash .text-xs           { font-size:7px  !important; line-height:2   !important; }
.tls-dash h1                 { font-size:11px !important; line-height:1.6 !important; }
/* Arbitrary size classes — squish label-sized text so values always win */
.tls-dash .text-\[16px\]     { font-size:11px !important; }
.tls-dash .text-\[11px\]     { font-size:11px !important; line-height:1.6 !important; }
.tls-dash .text-\[10px\]     { font-size:7px  !important; line-height:2 !important; }
.tls-dash .text-\[9px\]      { font-size:7px  !important; line-height:2 !important; }
.tls-dash .text-\[8px\]      { font-size:7px  !important; line-height:2 !important; }
.tls-dash .text-\[7px\]      { font-size:6px  !important; line-height:2 !important; }
.tls-dash .text-\[6px\]      { font-size:6px  !important; }
.tls-dash .text-\[5px\]      { font-size:5px  !important; }

/* ── existing animations ──────────────────────────────────────────────────── */
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
@keyframes fadeDown {
  from{opacity:0;transform:translateY(-5px)}
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
  0%  { opacity:0; transform:translateX(48px) scale(0.82); }
  55% { transform:translateX(-5px) scale(1.04); }
  100%{ opacity:1; transform:translateX(0) scale(1); }
}
@keyframes countPunch {
  0%  { transform:scale(1); }
  35% { transform:scale(1.55); color:#fbbf24; }
  100%{ transform:scale(1); }
}
@keyframes cardGlow {
  0%,100%{ box-shadow:none; }
  40%    { box-shadow:0 0 22px 4px var(--cg,#fff3); }
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
@keyframes tileActive {
  0%,100%{ border-color:rgba(45,212,191,0.4); box-shadow:0 0 8px rgba(45,212,191,0.2); }
  50%    { border-color:rgba(45,212,191,0.9); box-shadow:0 0 18px rgba(45,212,191,0.5); }
}
@keyframes tileExitWin {
  0%  { opacity:1; transform:scale(1) translateY(0); filter:brightness(1); }
  18% { transform:scale(1.07) translateY(-3px); filter:brightness(1.8); border-color:rgba(74,222,128,0.9); box-shadow:0 0 24px 6px rgba(74,222,128,0.5); }
  100%{ opacity:0; transform:scale(0.55) translateY(-52px); filter:brightness(0); }
}
@keyframes tileExitFail {
  0%   { opacity:1; transform:scale(1) translateX(0); filter:brightness(1); }
  10%  { transform:scale(0.97) translateX(-5px); border-color:rgba(248,113,113,0.7); }
  20%  { transform:scale(0.98) translateX(4px); }
  100% { opacity:0; transform:scale(0.78) translateY(18px); filter:brightness(0.3) saturate(0); }
}
@keyframes numUp   { 0%{transform:translateY(6px);color:#22c55e} 70%{color:#4ade80} 100%{transform:translateY(0);color:#fff} }
@keyframes numDown { 0%{transform:translateY(-6px);color:#ef4444} 70%{color:#f87171} 100%{transform:translateY(0);color:#fff} }
@keyframes workingLine { 0%,100%{ opacity:0.55; } 50%{ opacity:1; } }
@keyframes queueGlow { 0%,100%{ text-shadow:0 0 6px rgba(249,115,22,0.5); } 50%{ text-shadow:0 0 14px rgba(249,115,22,0.9), 0 0 4px rgba(249,115,22,0.3); } }
@keyframes numRise { from{transform:translateY(5px);opacity:0} to{transform:translateY(0);opacity:1} }
@keyframes numDrop { from{transform:translateY(-5px);opacity:0} to{transform:translateY(0);opacity:1} }

.text-glow      { animation: textGlow 3s ease-in-out infinite }
.green-glow     { animation: greenGlow 3s ease-in-out infinite }
.border-live    { animation: borderLive 2.5s ease-in-out infinite }
.cursor         { animation: blink 1s step-end infinite }
.idle-pulse     { animation: idlePulse 3s ease-in-out infinite }
.fade-up        { animation: fadeUp .35s ease-out both }
.slow-fade      { animation: slowFade 2.5s ease-in-out infinite }
.scan-prog      { transform-origin:left; animation: scanProg 55s linear forwards }
.tile-enter     { animation: tileEnter .42s cubic-bezier(0.22,1.2,0.36,1) both }
.tile-submit    { animation: tileSubmit .5s ease-out, tilePulse 1.5s ease-in-out 2 }
.tile-active    { animation: tileActive 1.8s ease-in-out infinite }
.tile-exit-win  { animation: tileExitWin  .58s cubic-bezier(0.4,0,1,1) forwards; pointer-events:none; }
.tile-exit-fail { animation: tileExitFail .48s ease-in forwards; pointer-events:none; }
.count-punch    { animation: countPunch .38s cubic-bezier(0.34,1.56,0.64,1) both }
.card-glow      { animation: cardGlow .6s ease-out both }
.num-up         { animation: numUp   .55s cubic-bezier(0.22,1,0.36,1) both }
.num-down       { animation: numDown .55s cubic-bezier(0.22,1,0.36,1) both }
.working-line   { animation: workingLine 1.8s ease-in-out infinite; }
.queue-urgent   { animation: queueGlow 2.2s ease-in-out infinite; }
.num-rise       { animation: numRise .3s cubic-bezier(0.22,1,0.36,1) both }
.num-drop       { animation: numDrop .3s cubic-bezier(0.22,1,0.36,1) both }
.fade-down      { animation: fadeDown .2s cubic-bezier(0.16,1,0.3,1) both }

.tls-feed {
  font-size: 9px;
  line-height: 1.55;
}
.tls-msg { line-height: 1.55; }
.tls-scroll { overflow-y:auto; scrollbar-width:none; }
.tls-scroll::-webkit-scrollbar { display:none; }

/* ── gamified feed entry animations — one per message type ───────────────── */
@keyframes feedAccepted {
  0%  { opacity:0; transform:scale(0.65) translateY(6px); filter:brightness(5) saturate(3); }
  28% { opacity:1; transform:scale(1.1) translateY(-3px); filter:brightness(2.5); }
  60% { transform:scale(0.98); filter:brightness(1.4); }
  100%{ transform:scale(1) translateY(0); filter:brightness(1); }
}
@keyframes feedSubmit {
  0%  { opacity:0; transform:translateY(18px) scale(0.88); filter:brightness(2.5); }
  48% { opacity:1; transform:translateY(-4px) scale(1.04); filter:brightness(1.6); }
  75% { transform:translateY(1px) scale(0.99); filter:brightness(1.1); }
  100%{ opacity:1; transform:translateY(0) scale(1); filter:brightness(1); }
}
@keyframes feedRejected {
  0%  { opacity:0.7; transform:translateX(0); }
  8%  { opacity:1; transform:translateX(7px) skewX(2deg); filter:brightness(2) saturate(3); }
  22% { transform:translateX(-5px) skewX(-1deg); }
  38% { transform:translateX(4px); filter:brightness(1.3); }
  58% { transform:translateX(-2px); }
  78% { transform:translateX(1px); filter:brightness(1); }
  100%{ transform:translateX(0) skewX(0deg); opacity:0.65; }
}
@keyframes feedQueued {
  0%  { opacity:0; transform:translateX(-24px) scale(0.85); }
  58% { opacity:1; transform:translateX(4px) scale(1.06); }
  80% { transform:translateX(-2px) scale(0.99); }
  100%{ opacity:1; transform:translateX(0) scale(1); }
}
@keyframes feedScan {
  0%  { opacity:0; letter-spacing:0.35em; filter:brightness(3); }
  38% { opacity:1; letter-spacing:0.1em; filter:brightness(1.6); }
  70% { letter-spacing:0.03em; filter:brightness(1.2); }
  100%{ opacity:1; letter-spacing:normal; filter:brightness(1); }
}
@keyframes feedWorking {
  0%  { opacity:0; filter:brightness(0); }
  12% { opacity:0.7; filter:brightness(3.5); }
  30% { opacity:0.3; filter:brightness(1.5); }
  52% { opacity:0.9; filter:brightness(2.2); }
  72% { opacity:0.6; filter:brightness(1.3); }
  100%{ opacity:1; filter:brightness(1); }
}
@keyframes feedError {
  0%  { opacity:0; transform:translateX(0); }
  8%  { opacity:1; transform:translateX(-8px) skewX(-4deg); filter:hue-rotate(130deg) brightness(2.5); }
  20% { transform:translateX(7px) skewX(3deg); filter:hue-rotate(0deg); }
  33% { transform:translateX(-5px) skewX(-2deg); }
  48% { transform:translateX(4px) skewX(1deg); filter:brightness(1.5); }
  65% { transform:translateX(-2px); }
  82% { transform:translateX(2px); filter:brightness(1); }
  100%{ transform:translateX(0) skewX(0deg); opacity:1; }
}
@keyframes feedPipeline {
  0%  { opacity:0; transform:translateX(-36px); filter:brightness(4); }
  38% { opacity:1; transform:translateX(5px); filter:brightness(2.5); }
  65% { transform:translateX(-2px); filter:brightness(1.5); }
  100%{ opacity:1; transform:translateX(0); filter:brightness(1); }
}
@keyframes feedWarn {
  0%  { opacity:0; transform:translateY(5px); }
  40% { opacity:1; transform:translateY(-2px); filter:brightness(2); }
  70% { filter:brightness(1.3); }
  100%{ opacity:1; transform:translateY(0); filter:brightness(1); }
}
@keyframes feedDefault {
  0%  { opacity:0; transform:translateY(7px); }
  100%{ opacity:1; transform:translateY(0); }
}

.feed-accepted { animation:feedAccepted 0.6s  cubic-bezier(0.22,1.4,0.36,1) both; }
.feed-submit   { animation:feedSubmit   0.45s cubic-bezier(0.22,1.2,0.36,1) both; }
.feed-rejected { animation:feedRejected 0.55s ease-out both; }
.feed-queued   { animation:feedQueued   0.42s cubic-bezier(0.34,1.56,0.64,1) both; }
.feed-scan     { animation:feedScan     0.7s  cubic-bezier(0.16,1,0.3,1) both; }
.feed-working  { animation:feedWorking  0.5s  ease-in-out both; }
.feed-error    { animation:feedError    0.6s  ease-out both; }
.feed-pipeline { animation:feedPipeline 0.4s  ease-out both; }
.feed-warn     { animation:feedWarn     0.4s  ease-out both; }
.feed-default  { animation:feedDefault  0.3s  ease-out both; }
`;

// ── design tokens ────────────────────────────────────────────────────────────
const IN_FLIGHT_BLUE = "#4fc3f7";   // unique across the UI — in-flight dollar values
const IN_FLIGHT_GOLD = "#fbbf24";   // in-flight count

// ── helpers ──────────────────────────────────────────────────────────────────

function usd(n: number) {
  return n === 0 ? "$0" : n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

function countdown(ms: number) {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m ${s % 60}s`;
}

function nextScan(now: number) {
  const d = new Date(now);
  const m = d.getUTCMinutes();
  const next = m < 15 ? 15 : m < 30 ? 30 : m < 45 ? 45 : 60;
  if (next === 60) { d.setUTCMinutes(0, 0, 0); d.setUTCHours(d.getUTCHours() + 1); }
  else { d.setUTCMinutes(next, 0, 0); }
  d.setUTCSeconds(0, 0);
  return d.getTime();
}

// Animate a number sliding up (increase) or down (decrease) when it changes.
// Returns {cls, animKey} — spread animKey onto element's key prop to restart the animation.
function useAnimDir(value: number) {
  const prevRef = useRef(value);
  const [state, setState] = useState<{ cls: string; k: number }>({ cls: "", k: 0 });
  useEffect(() => {
    if (value === prevRef.current) return;
    const cls = value > prevRef.current ? "num-rise" : "num-drop";
    prevRef.current = value;
    setState(s => ({ cls, k: s.k + 1 }));
  }, [value]);
  return state;
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
  pending: "waiting", in_progress: "working", review: "in review",
  submitted: "submitted", done: "accepted", failed: "rejected", cancelled: "—",
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

function BountyTile({ id, title, usdAmt, score, url, fresh, submitted, active }: {
  id: string; title: string; usdAmt: number; score?: number | null; url?: string | null; fresh?: boolean; submitted?: boolean; active?: boolean;
}) {
  const accent = bountyAccent(title);
  const [tip, setTip] = useState(false);
  const label = usdAmt >= 1000
    ? `$${(usdAmt / 1000 % 1 === 0 ? (usdAmt / 1000).toFixed(0) : (usdAmt / 1000).toFixed(1))}k`
    : usdAmt > 0 ? `$${Math.round(usdAmt)}`
    : score != null ? `${score}` : "?";

  return (
    <div className="relative" onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
      <div
        className={`w-16 h-16 flex items-center justify-center cursor-pointer select-none transition-all duration-150 ${fresh ? (submitted ? "tile-submit" : "tile-enter") : ""} ${active ? "tile-active" : ""}`}
        style={{
          background: '#000',
          border: `1px solid ${active ? "rgba(45,212,191,0.4)" : "rgba(255,255,255,0.3)"}`,
          ["--ta" as any]: accent + "aa",
          boxShadow: tip ? `0 0 14px 2px ${accent}44` : active ? "0 0 8px rgba(45,212,191,0.2)" : "none",
        }}
        onClick={() => url && window.open(url, "_blank")}
      >
        <span className="text-[16px] font-mono font-bold tabular-nums" style={{ color: accent }}>{label}</span>
      </div>
      {tip && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-52 bg-zinc-950 border border-zinc-700 p-2 pointer-events-none" style={{ borderLeftColor: accent, borderLeftWidth: 2 }}>
          <p className="text-[11px] text-white leading-snug mb-1">{title}</p>
          {score != null && <p className="text-[10px] text-zinc-500 mb-0.5">score {score}</p>}
          {url && <p className="text-[10px] text-zinc-600 truncate">{url.replace("https://github.com/", "")}</p>}
        </div>
      )}
    </div>
  );
}

function BoardColumn({ label, colorLabel, items, fresh, submitted, active }: {
  label: string; colorLabel: string; items: { id: string; title: string; usdAmt: number; score?: number | null; url?: string | null }[];
  fresh?: Set<string>; submitted?: Set<string>; active?: Set<string>;
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
            score={item.score}
            url={item.url}
            fresh={fresh?.has(item.id)}
            submitted={submitted?.has(item.id)}
            active={active?.has(item.id)}
          />
        ))}
        {items.length === 0 && <span className="text-[11px] text-zinc-800 self-center">—</span>}
      </div>
    </div>
  );
}

function WaitingColumn({ items, fresh, active, exiting }: {
  items: { id: string; title: string; usdAmt: number; url?: string | null; score?: number | null; status: string }[];
  fresh?: Set<string>; active?: Set<string>;
  exiting?: Map<string, { type: "win" | "fail"; item: any }>;
}) {
  const queued   = items.filter(i => ["pending","in_progress"].includes(i.status));
  const inFlight = items.filter(i => ["submitted","review"].includes(i.status));
  const queueUsd  = queued.reduce((s, i) => s + (i.usdAmt ?? 0), 0);
  const flightUsd = inFlight.reduce((s, i) => s + (i.usdAmt ?? 0), 0);
  const qAnim  = useAnimDir(queued.length);
  const ifAnim = useAnimDir(inFlight.length);
  const fuAnim = useAnimDir(flightUsd);

  function amtStr(n: number) {
    return n >= 1000 ? `$${(n/1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : n > 0 ? `$${Math.round(n)}` : "?";
  }

  function Tile({ item, color, exitType }: { item: any; color: string; exitType?: "win"|"fail" }) {
    const accent = bountyAccent(item.title ?? item.id);
    const isActive = active?.has(item.id);
    const isFresh = fresh?.has(item.id);
    const amt = amtStr(item.usdAmt ?? item.expected_usd ?? 0);
    return (
      <div
        title={item.title}
        onClick={() => item.url && window.open(item.url, "_blank")}
        className={`relative flex items-center justify-center rounded-sm cursor-pointer transition-opacity hover:opacity-100 ${isFresh ? "tile-enter" : ""} ${exitType ? `tile-exit-${exitType}` : ""} ${isActive ? "working-line" : "opacity-70"}`}
        style={{ width: 52, height: 36, background: `${accent}18`, border: `1px solid ${accent}55` }}
      >
        <span className="text-[10px] font-semibold tabular-nums" style={{ color }}>{amt}</span>
        {isActive && <span className="absolute top-0.5 right-0.5 text-[7px] text-teal-400 animate-pulse">●</span>}
        {item.status === "review" && <span className="absolute bottom-0.5 right-1 text-[7px]" style={{ color: IN_FLIGHT_GOLD }}>↺</span>}
      </div>
    );
  }

  return (
    <div className="w-36 space-y-5">

      {/* IN FLIGHT — top */}
      {inFlight.length > 0 && (
        <div>
          <div className="mb-2">
            <div className="flex items-end gap-2">
              <div key={ifAnim.k} className={`text-2xl font-semibold tabular-nums leading-none ${ifAnim.cls}`} style={{ color: IN_FLIGHT_GOLD }}>{inFlight.length}</div>
              {flightUsd > 0 && <div key={fuAnim.k} className={`text-lg font-semibold tabular-nums leading-none mb-px ${fuAnim.cls}`} style={{ color: IN_FLIGHT_BLUE }}>{usd(flightUsd)}</div>}
            </div>
            <div className="text-[10px] tracking-widest text-zinc-500 mt-0.5">in flight</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {inFlight.map(item => <Tile key={item.id} item={item} color={IN_FLIGHT_BLUE} />)}
          </div>
        </div>
      )}

      {/* QUEUE — below IN FLIGHT, hidden when empty */}
      {(queued.length > 0 || (exiting?.size ?? 0) > 0) && (
        <div>
          <div className="flex items-end justify-between mb-2">
            <div>
              <div key={qAnim.k} className={`text-2xl font-semibold tabular-nums leading-none queue-urgent ${qAnim.cls}`} style={{color:"#f97316"}}>{queued.length}</div>
              <div className="text-[10px] uppercase tracking-widest mt-0.5 queue-urgent" style={{color:"#f97316"}}>queue</div>
            </div>
            {queueUsd > 0 && <span className="text-xs text-zinc-400 tabular-nums mb-0.5">{usd(queueUsd)}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {queued.map(item => <Tile key={item.id} item={item} color="#f97316" />)}
            {exiting && [...exiting.entries()].map(([id, { type, item: ex }]) => (
              <Tile key={`exit-${id}`} item={{ ...ex, id }} color={type === "win" ? "#ffd54f" : "#ff9800"} exitType={type} />
            ))}
          </div>
        </div>
      )}
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

let _muted = false;
try { _muted = localStorage.getItem("tls_muted") === "1"; } catch {}
export function isMuted() { return _muted; }
export function setMuted(v: boolean) {
  _muted = v;
  try { localStorage.setItem("tls_muted", v ? "1" : "0"); } catch {}
}

// Shared AudioContext — created once, resumed on first user gesture
let _sharedCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!_sharedCtx || _sharedCtx.state === "closed") {
      _sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return _sharedCtx;
  } catch { return null; }
}
export function unlockAudio() {
  const c = getCtx();
  if (c?.state === "suspended") c.resume().catch(() => {});
}

function playScanSound() {
  if (_muted) return;
  const ctx = getCtx(); if (!ctx) return;
  try {
    [220, 294, 392, 523].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = "square"; osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.065;
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
      osc.start(t); osc.stop(t + 0.065);
    });
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
  if (_muted) return;
  const ctx = getCtx(); if (!ctx) return;
  try {
    [392, 523, 659, 784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = "square"; osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.055;
      g.gain.setValueAtTime(0.07, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
      osc.start(t); osc.stop(t + 0.075);
    });
  } catch {}
}

function playPipelineSound() {
  if (_muted) return;
  const ctx = getCtx(); if (!ctx) return;
  try {
    const sub = ctx.createOscillator(); const sg = ctx.createGain();
    sub.connect(sg); sg.connect(ctx.destination);
    sub.type = "sawtooth"; sub.frequency.value = 80;
    sg.gain.setValueAtTime(0.14, ctx.currentTime);
    sg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    sub.start(ctx.currentTime); sub.stop(ctx.currentTime + 0.28);
    [65, 98, 131, 165, 196, 262].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = "sawtooth"; osc.frequency.value = freq;
      const t = ctx.currentTime + 0.12 + i * 0.075;
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.start(t); osc.stop(t + 0.11);
    });
  } catch {}
}

function playTick() {
  if (_muted) return;
  const ctx = getCtx(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = "square"; osc.frequency.value = 880;
    g.gain.setValueAtTime(0.022, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.015);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.015);
  } catch {}
}

function playScanComplete() {
  if (_muted) return;
  const ctx = getCtx(); if (!ctx) return;
  try {
    // Soft two-tone ding — polite, unobtrusive
    [[880, 0], [1320, 0.09]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.start(t); osc.stop(t + 0.18);
    });
  } catch {}
}

function playQueuedSound() {
  if (_muted) return;
  const ctx = getCtx(); if (!ctx) return;
  try {
    // 8-bit happy: C E G — quick ascending major chord
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = "square"; osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.045;
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.start(t); osc.stop(t + 0.07);
    });
  } catch {}
}

function playSubmittedSound() {
  if (_muted) return;
  const ctx = getCtx(); if (!ctx) return;
  try {
    // 8-bit fanfare: C E G C — ascending arpeggio + octave top
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = "square"; osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.065;
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t); osc.stop(t + 0.1);
    });
    // Extra shimmer on the high note
    const sh = ctx.createOscillator(); const sg = ctx.createGain();
    sh.connect(sg); sg.connect(ctx.destination);
    sh.type = "sine"; sh.frequency.value = 2093;
    const st = ctx.currentTime + 0.195;
    sg.gain.setValueAtTime(0.04, st);
    sg.gain.exponentialRampToValueAtTime(0.0001, st + 0.12);
    sh.start(st); sh.stop(st + 0.12);
  } catch {}
}

function playReceive() {
  if (_muted) return;
  const ctx = getCtx(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(1100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1480, ctx.currentTime + 0.04);
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.065);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.065);
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

function ScanCountdown({ lastScanTs }: { lastScanTs: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  const [lastScanMs, setLastScanMs] = useState<number | null>(() =>
    lastScanTs ? new Date(lastScanTs).getTime() : null
  );
  const prevTickSec = useRef<number | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Sync lastScanMs from parent prop (LiveFeed fires onScan on discovery_run)
  useEffect(() => {
    if (!lastScanTs) return;
    setLastScanMs(new Date(lastScanTs).getTime());
  }, [lastScanTs]);

  let nextMs = nextScan(now);
  while (nextMs <= now) nextMs += 15 * 60 * 1000;
  const remaining = nextMs - now;
  const remM = Math.floor(remaining / 60000);
  const remS = Math.floor((remaining % 60000) / 1000);

  // Show "scanning…" for up to 90s after a slot passes (self-heals even if event missed)
  const lastPassedSlot = nextMs - 15 * 60 * 1000;
  const waitingForScan = (lastScanMs === null || lastPassedSlot > lastScanMs)
    && (now - lastPassedSlot) < 90 * 1000;

  // Tick on last 5 seconds
  useEffect(() => {
    if (!waitingForScan && remM === 0 && remS >= 1 && remS <= 5) {
      if (prevTickSec.current !== remS) {
        prevTickSec.current = remS;
        playTick();
      }
    }
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  if (waitingForScan) {
    const elapsedSec = Math.floor((now - lastPassedSlot) / 1000);
    return <span className="text-sm tabular-nums font-mono text-amber-400 animate-pulse">scanning… {elapsedSec}s</span>;
  }
  return (
    <span className={`text-sm tabular-nums font-mono ${remaining < 120000 ? "text-amber-400" : "text-zinc-600"}`}>
      {countdown(remaining)}
    </span>
  );
}

function StatCell({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className={`text-lg font-semibold tabular-nums leading-tight ${color ?? "text-white"}`}>{value}</span>
      <span className="text-[11px] text-zinc-600 leading-tight">{label}</span>
    </div>
  );
}

function HeaderStats({ allTimeUsd, inFlightUsd, inFlightCount, submittedAllTime, acceptedCount, rejectedCount, winRate, totalScanned }: {
  allTimeUsd: number; inFlightUsd: number; inFlightCount: number; submittedAllTime: number; acceptedCount: number; rejectedCount: number; winRate: number; totalScanned: number;
}) {
  const hasRecord = acceptedCount + rejectedCount > 0;
  const hifAnim = useAnimDir(inFlightCount);
  const hifUAnim = useAnimDir(inFlightUsd);
  return (
    <div className="flex flex-wrap items-end gap-x-7 gap-y-1 mt-2">
      <StatCell value={usd(allTimeUsd)} label="total" color={allTimeUsd > 0 ? "text-emerald-400 green-glow" : "text-zinc-500"} />
      <Dot />
      {/* in flight: [count gold] at [value blue] */}
      <div className="flex flex-col">
        <div className="flex items-baseline gap-1 leading-tight">
          {inFlightCount > 0 ? (
            <>
              <span key={hifAnim.k} className={`text-lg font-semibold tabular-nums ${hifAnim.cls}`} style={{ color: IN_FLIGHT_GOLD }}>{inFlightCount}</span>
              <span className="text-zinc-700 text-sm select-none">at</span>
              <span key={hifUAnim.k} className={`text-lg font-semibold tabular-nums ${hifUAnim.cls}`} style={{ color: IN_FLIGHT_BLUE }}>{usd(inFlightUsd)}</span>
            </>
          ) : (
            <span className="text-lg font-semibold tabular-nums text-zinc-500">—</span>
          )}
        </div>
        <span className="text-[11px] text-zinc-600 leading-tight">in flight</span>
      </div>
      <Dot />
      <StatCell value={String(submittedAllTime)} label="submitted" />
      <Dot />
      <StatCell value={`${winRate}%`} label="" color={hasRecord ? "text-zinc-300" : "text-zinc-600"} />
      <Dot />
      <StatCell value={totalScanned > 0 ? totalScanned.toLocaleString() : "—"} label="scanned" color={totalScanned > 0 ? "text-zinc-400" : "text-zinc-600"} />
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
const DASH_VERSION = "v63r";

function getAgentServer() {
  if (typeof window === "undefined") return DEFAULT_AGENT_SERVER;
  return localStorage.getItem("tls_agent_server") || DEFAULT_AGENT_SERVER;
}

type FeedLine = { id: string; ts: string; epochMs: number; msg: string; accent: string; bountyKey?: string; hidden?: boolean; itemId?: string; };

// Inline countdown for the most recent scan complete message
function FeedScanCountdown() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  let nextMs = nextScan(now);
  while (nextMs <= now) nextMs += 15 * 60 * 1000;
  const remaining = nextMs - now;
  if (remaining < 5000) return <span className="text-amber-400 font-mono text-[11px] tabular-nums"> · scanning…</span>;
  const remM = Math.floor(remaining / 60000);
  const remS = Math.floor((remaining % 60000) / 1000);
  return (
    <span className={`font-mono text-[11px] tabular-nums ${remaining < 120000 ? "text-amber-400" : "text-zinc-500"}`}>
      {" · next in "}{remM}:{String(remS).padStart(2, "0")}
    </span>
  );
}

// Return cron slot timestamps (ms) that fall strictly between two epoch values, newest-first order
function cronSlotsBetween(olderMs: number, newerMs: number): number[] {
  const slots: number[] = [];
  const STEP = 15 * 60 * 1000;
  // Find the first slot at or after olderMs
  let slot = Math.ceil(olderMs / STEP) * STEP;
  while (slot < newerMs) {
    if (slot > olderMs) slots.push(slot);
    slot += STEP;
  }
  return slots.reverse();
}

// Status colors reserved: red (error), emerald (success), sky-blue (submitted), amber (warning), teal (working)
// Bounty palette: spread across spectrum — no red, no green
const BOUNTY_PALETTE = ["#fb923c","#22d3ee","#c084fc","#f472b6","#818cf8","#eab308","#e879f9","#8b5cf6","#2dd4bf","#06b6d4"];

const ACTION_COLORS: [string, string][] = [
  ["Accepted",       "#ffd54f"],  // gold
  ["Earned",         "#ffd54f"],
  ["Approved",       "#ffd54f"],
  ["Submitted",      "#4fc3f7"],  // sky blue
  ["Scan complete",  "#ce93d8"],  // purple
  ["Found ",         "#4fc3f7"],
  ["Discovery scan", "#4fc3f7"],  // backward compat
  ["Pipeline",       "#b39ddb"],  // lavender
  ["Queued",         "#00e5ff"],  // cyan
  ["Working on",     "#80cbc4"],  // teal
  ["In review",      "#fbbf24"],  // amber
  ["Abandoned",      "#ff9800"],  // orange
  ["Error:",         "#f48fb1"],  // pink
  ["Failed",         "#ff9800"],
  ["Rejected",       "#ff9800"],
  ["Server offline", "#ff9800"],
  ["Skipped",        "#ff9800"],
  ["Dismissed",      "#ff9800"],
];

function bountyAccent(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return BOUNTY_PALETTE[Math.abs(h) % BOUNTY_PALETTE.length];
}

function formatFeedEntry(action: string, detail: string): { msg: string; bountyKey?: string; hidden?: boolean } {
  switch (action) {
    case "scan_source":
    case "scan_start":
      return { msg: detail, hidden: true };
    case "discovery_run": {
      if (!detail.startsWith("Scan complete")) return { msg: detail };
      // Normalize: strip zero-count sources from any historical format
      let msg = detail;
      // Rewrite old "X queued" → "X new" in message text
      msg = msg.replace(/(\d+) queued,/, "$1 new,");
      // Strip zero-count source tokens [src:0] from bracket list
      msg = msg.replace(/\[([^\]]+)\]/g, (_, inner) => {
        const parts = inner.split(/\s+/).filter((p: string) => !p.match(/^\w+:0$/));
        return parts.length > 0 ? `[${parts.join("  ")}]` : "";
      }).replace(/\s+$/, "");
      return { msg };
    }
    case "pipeline_start":
    case "pipeline_end":
      return { msg: detail };
    case "agent_pr_opened": {
      const [title, url] = detail.split(" → ");
      const prNum = url?.match(/pull\/(\d+)/)?.[1];
      const repo  = url?.match(/github\.com\/[^/]+\/([^/]+)/)?.[1];
      const msg   = prNum && repo ? `Submitted #${prNum} on ${repo} — ${title || ""}` : `Submitted — ${detail}`;
      return { msg, bountyKey: title };
    }
    case "pr_merged": {
      // New: `PR merged: "${title}"${reward} — payment should arrive via platform`
      const m = detail.match(/PR merged: "([^"]+)"/);
      if (m) {
        const title = m[1];
        const reward = detail.match(/\$(\d[\d.]*)/)?.[1];
        return { msg: reward ? `Accepted — ${title} — $${reward} incoming` : `Accepted — ${title}`, bountyKey: title };
      }
      return { msg: `Accepted — ${detail}`, bountyKey: detail };
    }
    case "pr_closed": {
      // New: `PR rejected: "${title}" — closed without merging, no payout`
      const m = detail.match(/PR rejected: "([^"]+)"/);
      if (m) return { msg: `Rejected — ${m[1]}`, bountyKey: m[1] };
      return { msg: `Rejected — ${detail}`, bountyKey: detail };
    }
    case "agent_no_changes": {
      const sep = detail.indexOf("|||");
      const title  = sep > -1 ? detail.slice(0, sep) : detail;
      const reason = sep > -1 ? detail.slice(sep + 3) : "no code changes";
      return { msg: `Abandoned — ${title} — ${reason}`, bountyKey: title };
    }
    case "agent_skip": {
      const sep = detail.indexOf("|||");
      const title  = sep > -1 ? detail.slice(0, sep) : detail;
      const reason = sep > -1 ? detail.slice(sep + 3) : "";
      return { msg: reason ? `Skipped — ${title} — ${reason}` : `Skipped — ${detail}`, bountyKey: sep > -1 ? title : undefined };
    }
    case "agent_error":
      return { msg: `Error: ${detail}` };
    case "opportunity_queued": {
      const isManual = detail.startsWith("Manually queued:");
      const titleM = detail.match(/"([^"]+)"/);
      if (titleM) {
        const title = titleM[1];
        const reward = detail.match(/\$(\d[\d.]*)/)?.[1];
        const srcM   = detail.match(/via (\w+)/);
        const source = srcM ? srcM[1] : (isManual ? null : "github");
        const scoreM = detail.match(/score (\d+)/);
        const score  = scoreM ? scoreM[1] : null;
        const amtPart = reward ? ` $${reward} —` : " —";
        const srcLabel = isManual ? "Added manually." : `Identified on ${source}.`;
        const scorePart = score ? ` Score ${score}.` : "";
        return { msg: `Queued${amtPart} ${title}. ${srcLabel}${scorePart}`, bountyKey: title };
      }
      return { msg: `Queued — ${detail}`, bountyKey: detail };
    }
    case "opportunity_dismissed": {
      // New: `You archived "${title}" (source) — won't appear again`
      const newM = detail.match(/You archived "([^"]+)"/);
      if (newM) return { msg: `Dismissed — ${newM[1]}`, bountyKey: newM[1] };
      // Old "||| format"
      const sep = detail.indexOf("|||");
      const title  = sep > -1 ? detail.slice(0, sep) : detail;
      const reason = sep > -1 ? detail.slice(sep + 3) : "";
      return { msg: reason ? `Dismissed — ${title} — ${reason}` : `Dismissed — ${detail}`, bountyKey: title };
    }
    case "earning_logged":
      return { msg: `Earned — ${detail}`, bountyKey: detail };
    case "approval_approved":
      return { msg: `Approved — ${detail}` };
    case "frantic_delivered": {
      const m = detail.match(/"([^"]+)"/);
      if (m) {
        const title = m[1];
        const reward = detail.match(/\$(\d[\d.]*)/)?.[1];
        return { msg: reward ? `Submitted $${reward} — ${title}` : `Submitted — ${title}`, bountyKey: title };
      }
      return { msg: `Submitted — ${detail}` };
    }
    case "frantic_delivery_error":
      return { msg: `Error: ${detail}` };
    case "submit_ok": {
      // New: `Submitted to Superteam: "${title}" — $X USDC ...`
      const m = detail.match(/"([^"]+)"/);
      if (m) {
        const title = m[1];
        const reward = detail.match(/\$(\d[\d.]*)/)?.[1];
        return { msg: reward ? `Submitted $${reward} — ${title}` : `Submitted — ${title}`, bountyKey: title };
      }
      return { msg: `Submitted — ${detail}` };
    }
    case "submit_error":
      return { msg: `Failed — ${detail}` };
    case "pr_check_run":
      return { msg: detail, hidden: true };
    default:
      return { msg: detail };
  }
}

function LiveFeed({ userId, stagedCount, projected, onScan, onRun, getPipelineItem }: {
  userId: string; stagedCount: number; projected: number;
  onScan?: (ts: string) => void; onRun?: () => Promise<void>;
  getPipelineItem?: (id: string) => any;
}) {
  const [lines, setLines] = useState<FeedLine[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [runState, setRunState] = useState<"idle" | "running" | "done" | "copied">("idle");
  const [serverAddr, setServerAddr] = useState(DEFAULT_AGENT_SERVER);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [approvalFlash, setApprovalFlash] = useState<"green" | "red" | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStatusRef = useRef<Map<string, string>>(new Map());
  const [workingItemIds, setWorkingItemIds] = useState<Set<string>>(new Set());
  useEffect(() => { setServerAddr(getAgentServer()); }, []);
  // Unlock AudioContext on first user interaction (browser autoplay policy)
  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener("click", unlock, { once: true });
    return () => document.removeEventListener("click", unlock);
  }, []);

  function triggerApprovalFlash(color: "green" | "red") {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setApprovalFlash(color);
    flashTimerRef.current = setTimeout(() => setApprovalFlash(null), 1400);
  }

  // Track which line ids are "fresh" (arrived live, not from history) so we can animate them
  const freshLineIdsRef = useRef<Set<string>>(new Set());

  function getFeedClass(msg: string): string {
    if (msg.startsWith("Accepted") || msg.startsWith("Earned") || msg.startsWith("Approved")) return "feed-accepted";
    if (msg.startsWith("Submitted")) return "feed-submit";
    if (msg.startsWith("Rejected") || msg.startsWith("Failed")) return "feed-rejected";
    if (msg.startsWith("Queued")) return "feed-queued";
    if (msg.startsWith("Scan complete")) return "feed-scan";
    if (msg.startsWith("Working on")) return "feed-working";
    if (msg.startsWith("Error")) return "feed-error";
    if (msg.startsWith("Pipeline")) return "feed-pipeline";
    if (msg.startsWith("In review") || msg.startsWith("Abandoned") || msg.startsWith("Skipped") || msg.startsWith("Dismissed")) return "feed-warn";
    return "feed-default";
  }

  function add(msg: string, accent: string, bountyKey?: string, hidden?: boolean, id?: string, itemId?: string) {
    if (hidden) return;
    const lineId = id ?? `${Date.now()}-${Math.random()}`;
    if (id) {
      if (seenIdsRef.current.has(id)) return;
      seenIdsRef.current.add(id);
    }
    playReceive();
    const now = new Date();
    const ts = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    freshLineIdsRef.current.add(lineId);
    setLines(prev => [...prev.slice(-99), { id: lineId, ts, epochMs: now.getTime(), msg, accent, bountyKey, itemId }]);
  }

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
        const history: FeedLine[] = data.reverse().flatMap((e: any) => {
          const d = new Date(e.created_at);
          const ts = d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
          const { msg, bountyKey, hidden } = formatFeedEntry(e.action, e.detail || "");
          if (hidden) return [];
          seenIdsRef.current.add(e.id);
          const accent = e.action === "pipeline_start" ? "#fbbf24"
            : bountyKey ? bountyAccent(bountyKey) : "#71717a";
          return [{ id: e.id, ts, epochMs: d.getTime(), msg, accent, bountyKey }];
        });
        setLines(history);
      });
  }, [userId]);

  // Load pending approval count on mount
  useEffect(() => {
    const sb = createClient();
    (sb as any).from("income_approvals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending")
      .then(({ count }: any) => setPendingApprovals(count ?? 0));
  }, [userId]);

  // Poll feed every 15s — realtime may not fire if income_activity_log isn't in Supabase publication
  useEffect(() => {
    const sb = createClient();
    async function poll() {
      const { data } = await (sb as any)
        .from("income_activity_log")
        .select("id,action,detail,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!data?.length) return;
      const freshEntries = data.filter((e: any) => !seenIdsRef.current.has(e.id));
      if (!freshEntries.length) return;
      const freshLines: FeedLine[] = freshEntries.reverse().flatMap((e: any) => {
        seenIdsRef.current.add(e.id);
        const d = new Date(e.created_at);
        const ts = d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const { msg, bountyKey, hidden } = formatFeedEntry(e.action, e.detail || "");
        if (hidden) return [];
        if (e.action === "pipeline_start") playPipelineSound();
        const accent = e.action === "pipeline_start" ? "#fbbf24"
          : bountyKey ? bountyAccent(bountyKey) : "#71717a";
        return [{ id: e.id, ts, epochMs: d.getTime(), msg, accent, bountyKey }];
      });
      if (!freshLines.length) return;
      setLines(prev => [...prev, ...freshLines].slice(-100));
    }
    const t = setInterval(poll, 15_000);
    return () => clearInterval(t);
  }, [userId]);

  useEffect(() => {
    const sb = createClient();

    const ch1 = (sb as any).channel(`lf_wq_${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "income_work_queue", filter: `user_id=eq.${userId}` }, (p: any) => {
        const title = (p.new.title || "").slice(0, 60);
        const st = p.new.status;
        // Skip if status hasn't changed — prevents duplicate "Working on" on every column update
        const prevStatus = lastStatusRef.current.get(p.new.id);
        if (st === prevStatus) return;
        lastStatusRef.current.set(p.new.id, st);

        if (st === "in_progress") {
          const liveItem = getPipelineItem?.(p.new.id);
          const src = liveItem?.income_opportunities?.source ?? "";
          const amt = p.new.expected_usd ?? 0;
          const srcPart = src ? ` from ${src}` : "";
          const amtPart = amt > 0 ? ` It's worth ${usd(amt)}.` : "";
          add(`Working on ${title}${srcPart}.${amtPart}`, bountyAccent(title), title, false, undefined, p.new.id);
          setWorkingItemIds(prev => new Set([...prev, p.new.id]));
        } else {
          if (["submitted","done","failed","cancelled"].includes(st)) {
            setWorkingItemIds(prev => { const n = new Set(prev); n.delete(p.new.id); return n; });
          }
          if (st === "submitted") playSubmittedSound();
          const msg =
            st === "submitted" ? `Submitted — ${title}` :
            st === "done"      ? `Accepted — ${title}` :
            st === "failed"    ? `Rejected — ${title}` :
            st === "review"    ? `In review — ${title}` :
            st === "pending"   ? `Queued — ${title}` :
                                 `${st} — ${title}`;
          add(msg, bountyAccent(title), title);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "income_work_queue", filter: `user_id=eq.${userId}` }, (p: any) => {
        // activity_log handles terminal message for opportunity_queued — just play the chime
        playBountyChime();
      })
      .subscribe();

    const ch2 = (sb as any).channel(`lf_log_${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "income_activity_log", filter: `user_id=eq.${userId}` }, (p: any) => {
        const { msg, bountyKey, hidden } = formatFeedEntry(p.new.action, p.new.detail || "");
        const accent = p.new.action === "pipeline_start" ? "#fbbf24"
          : bountyKey ? bountyAccent(bountyKey) : "#71717a";
        add(msg, accent, bountyKey, hidden, p.new.id);
        if (p.new.action === "discovery_run") {
          playScanSound();
          playScanComplete();
          notifyScan(p.new.detail || "");
          onScan?.(p.new.created_at || new Date().toISOString());
        }
        if (p.new.action === "opportunity_queued") {
          playQueuedSound();
        }
        if (p.new.action === "pipeline_start") {
          playPipelineSound();
        }
        if (p.new.action === "agent_pr_opened" || p.new.action === "submit_ok") {
          playSubmittedSound();
        }
      })
      .subscribe();

    const ch3 = (sb as any).channel(`lf_app_${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "income_approvals", filter: `user_id=eq.${userId}` }, () => {
        setPendingApprovals(n => n + 1);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "income_approvals", filter: `user_id=eq.${userId}` }, (p: any) => {
        if (p.new.status === "approved") {
          setPendingApprovals(n => Math.max(0, n - 1));
          triggerApprovalFlash("green");
        } else if (p.new.status === "rejected") {
          setPendingApprovals(n => Math.max(0, n - 1));
          triggerApprovalFlash("red");
        }
      })
      .subscribe();

    return () => { sb.removeChannel(ch1); sb.removeChannel(ch2); sb.removeChannel(ch3); };
  }, [userId]);

  async function run() {
    if (runState === "running") return;
    setRunState("running");
    await onRun?.();
    add("Pipeline triggered", "#fbbf24");
    try {
      const r = await fetch(`${serverAddr}/run`, { method: "POST", signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error();
      setRunState("done");
      setTimeout(() => setRunState("idle"), 3000);
    } catch {
      await navigator.clipboard.writeText("node scripts/income-agent.mjs");
      add("Server offline — command copied to clipboard", "#f87171");
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

  const flashColor = approvalFlash === "green" ? "#00e676" : approvalFlash === "red" ? "#ff5252" : pendingApprovals > 0 ? "#ffb800" : "#2d3f4d";
  const flashGlow  = approvalFlash === "green" ? "0 0 8px #00e67660" : approvalFlash === "red" ? "0 0 8px #ff525260" : "none";
  const dotCls     = approvalFlash === "green" ? "bg-[#00e676]" : approvalFlash === "red" ? "bg-[#ff5252]" : pendingApprovals > 0 ? "bg-[#ffb800] animate-pulse" : "bg-[#2d3f4d]";
  const dotLabel   = approvalFlash === "green" ? "APPROVED" : approvalFlash === "red" ? "REJECTED" : pendingApprovals > 0 ? `${pendingApprovals} PENDING` : "";

  return (
    <div className="flex flex-col flex-1 min-h-0">
    <div className="flex items-center gap-2 mb-1.5 pl-0.5 shrink-0">
      <div className="flex items-center gap-1.5 transition-all duration-300" style={{ color: flashColor, textShadow: flashGlow }}>
        <span className={`inline-block w-1.5 h-1.5 rounded-full transition-colors duration-300 ${dotCls}`} />
        <span className="text-[9px] font-mono uppercase tracking-widest font-semibold">{dotLabel}</span>
      </div>
    </div>
    <div
      className="tls-scroll flex-1 min-h-0"
      style={{
        WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 92%, transparent 100%)",
        maskImage:        "linear-gradient(to bottom, black 0%, black 92%, transparent 100%)",
      }}
    >
      {/* ── History — newest at top ────────────────────────────────────── */}
      <div className="space-y-3 pr-2">
        {lines.length === 0 && (
          <p className="tls-feed text-zinc-700 py-1 select-none">waiting for activity</p>
        )}
        {(() => {
          const reversed = [...lines].reverse();
          const nodes: React.ReactNode[] = [];
          reversed.forEach((l, idx) => {
            let kwLen = 0;
            for (const [kw] of ACTION_COLORS) {
              if (l.msg.startsWith(kw)) { kwLen = kw.length; break; }
            }
            const kwText = l.msg.slice(0, kwLen);
            const rest   = l.msg.slice(kwLen);

            let restNode: React.ReactNode;
            if (l.bountyKey && rest.includes(l.bountyKey)) {
              const bkIdx  = rest.indexOf(l.bountyKey);
              const before = rest.slice(0, bkIdx);
              const after  = rest.slice(bkIdx + l.bountyKey.length);
              restNode = <>
                {before && <span className="text-zinc-400">{before}</span>}
                <span style={{ color: l.accent }}>{l.bountyKey}</span>
                {after && <span className="text-zinc-400">{after}</span>}
              </>;
            } else {
              restNode = <span className="text-zinc-400">{rest}</span>;
            }

            const isWorking = !!(l.itemId && workingItemIds.has(l.itemId));
            const kwColor = kwText.startsWith("Submitted") ? IN_FLIGHT_BLUE : "white";
            const isFresh = freshLineIdsRef.current.has(l.id);
            const animCls = isFresh ? getFeedClass(l.msg) : "";

            nodes.push(
              <div key={l.id} className={`flex gap-3 tls-feed tls-msg ${animCls} ${isWorking ? "working-line" : ""}`}>
                <span className={`shrink-0 tabular-nums ${idx === 0 ? "text-white" : "text-zinc-700"}`} style={{ fontSize: 8 }}>{l.ts}</span>
                <span className="break-words min-w-0 leading-relaxed">
                  {kwLen > 0 && <span style={{ color: kwColor }}>{kwText}</span>}
                  {restNode}
                </span>
              </div>
            );
          });
          return nodes;
        })()}
      </div>
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

  const [menuOpen, setMenuOpen] = useState(false);
  const [muted, setMutedState] = useState(() => { try { return localStorage.getItem("tls_muted") === "1"; } catch { return false; } });
  const [, startT] = useTransition();

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  // Live pipeline items — realtime subscription keeps these current
  const [liveItems, setLiveItems] = useState<any[]>(pipelineItems);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [exitingTiles, setExitingTiles] = useState<Map<string, { type: "win" | "fail"; item: any }>>(new Map());
  const liveItemsRef = useRef<any[]>(pipelineItems);
  useEffect(() => { liveItemsRef.current = liveItems; }, [liveItems]);
  const [lastScanTs, setLastScanTs] = useState<string | null>(summary.lastDiscoveryRun);

  // Sync when server props refresh (router.refresh() polling)
  useEffect(() => { setLiveItems(pipelineItems); }, [pipelineItems]);

  async function syncQueue() {
    const sb = createClient();
    const { data } = await (sb as any)
      .from("income_work_queue")
      .select("*")
      .eq("user_id", userId)
      .not("status", "in", '("done","failed","cancelled")')
      .order("priority");
    if (data) setLiveItems(data);
  }

  useEffect(() => {
    const sb = createClient();
    const ch = (sb as any).channel(`m_${userId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "income_work_queue", filter: `user_id=eq.${userId}`,
      }, (p: any) => {
        if (p.eventType === "INSERT") {
          setLiveItems(prev => prev.some(i => i.id === p.new.id) ? prev : [p.new, ...prev]);
          setFresh(prev => new Set([...prev, p.new.id]));
          setTimeout(() => setFresh(prev => { const n = new Set(prev); n.delete(p.new.id); return n; }), 800);
        } else if (p.eventType === "UPDATE") {
          const prevItem = liveItemsRef.current.find(i => i.id === p.new.id);
          const wasQueued = prevItem && ["pending","in_progress","review"].includes(prevItem.status);
          setLiveItems(prev => prev.map(i => i.id === p.new.id ? { ...i, ...p.new } : i));
          if (wasQueued && p.new.status === "submitted") {
            // Win exit: flash green, zip upward
            setExitingTiles(prev => { const n = new Map(prev); n.set(p.new.id, { type: "win", item: { ...prevItem, ...p.new } }); return n; });
            setTimeout(() => setExitingTiles(prev => { const n = new Map(prev); n.delete(p.new.id); return n; }), 700);
            setFresh(prev => new Set([...prev, p.new.id]));
            setSubmitted(prev => new Set([...prev, p.new.id]));
            setTimeout(() => {
              setFresh(prev => { const n = new Set(prev); n.delete(p.new.id); return n; });
              setSubmitted(prev => { const n = new Set(prev); n.delete(p.new.id); return n; });
            }, 1200);
          } else if (wasQueued && ["failed","cancelled"].includes(p.new.status)) {
            // Fail exit: shake red, crumple down
            setExitingTiles(prev => { const n = new Map(prev); n.set(p.new.id, { type: "fail", item: { ...prevItem, ...p.new } }); return n; });
            setTimeout(() => setExitingTiles(prev => { const n = new Map(prev); n.delete(p.new.id); return n; }), 600);
          } else if (!wasQueued && p.new.status === "submitted") {
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
  const activeItems     = liveItems.filter(w => w.status === "in_progress");
  const activeSet       = new Set(activeItems.map(i => i.id));
  const acceptedCount   = liveItems.filter(w => w.status === "done").length;
  const rejectedCount   = liveItems.filter(w => w.status === "failed").length;
  const submittedAllTime = liveItems.filter(w => ["submitted","review","done","failed"].includes(w.status)).length;
  const inFlightItems   = liveItems.filter(w => ["submitted","review"].includes(w.status));
  const inFlightCount   = inFlightItems.length;
  const inFlightUsd     = inFlightItems.reduce((s, w) => s + (w.expected_usd ?? 0), 0);
  const allTimeUsd      = allEarnings.filter(e => e.status === "collected").reduce((s, e) => s + e.amount_usd, 0);
  const winRate         = (acceptedCount + rejectedCount) > 0 ? Math.round((acceptedCount / (acceptedCount + rejectedCount)) * 100) : 0;
  const activeMissions  = liveItems.filter(w => !["done","failed","cancelled"].includes(w.status)).length;


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


  return (
    <div className="bg-black text-white tls-dash -mx-4 -mt-6 -mb-6 h-screen overflow-hidden flex flex-col relative">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="max-w-[960px] w-full mx-auto px-6 py-6 relative z-10 flex flex-col flex-1 min-h-0">


        {/* ── header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-6 shrink-0">
          <div>
            <h1 className="text-base font-semibold text-white tracking-wide">
              Bounty Engine<span className="cursor ml-0.5 text-zinc-600">_</span>
              <span className="ml-2 text-[10px] text-white font-mono font-normal">{DASH_VERSION}</span>
            </h1>
            <div className="mt-3">
              <HeaderStats allTimeUsd={allTimeUsd} inFlightUsd={inFlightUsd} inFlightCount={inFlightCount} submittedAllTime={submittedAllTime} acceptedCount={acceptedCount} rejectedCount={rejectedCount} winRate={winRate} totalScanned={summary.totalBountyCount} />
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 mt-1">
            <button
              onClick={toggleMute}
              className={`text-sm border px-2.5 py-1 transition-colors ${muted ? "border-zinc-800 text-zinc-700" : "border-zinc-600 text-zinc-300 hover:border-zinc-400"}`}
              title={muted ? "Unmute audio" : "Mute audio"}>
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className={`text-sm border px-2.5 py-1 transition-colors ${menuOpen ? "border-zinc-500 text-zinc-300" : "border-zinc-800 text-zinc-600 hover:border-zinc-500 hover:text-zinc-300"}`}
              title="Scan · Ledger · Log">
              ☰
            </button>
          </div>
        </div>

        {/* ── terminal + side columns ─────────────────────────────────── */}
        <div className="flex gap-8 flex-1 min-h-0">
          {/* Terminal — no frame, left edge flush */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <LiveFeed userId={userId} stagedCount={pendingQueue.length} projected={summary.queueProjectedUsd} onScan={ts => setLastScanTs(ts)} onRun={syncQueue} getPipelineItem={id => liveItemsRef.current.find((i: any) => i.id === id)} />
          </div>
          {/* WAITING */}
          <div className="shrink-0">
            <WaitingColumn
              items={liveItems
                .filter(i => ["pending","in_progress","review","submitted"].includes(i.status))
                .map(i => ({
                  id: i.id,
                  title: i.title,
                  usdAmt: i.expected_usd ?? 0,
                  url: i.income_opportunities?.url ?? null,
                  score: i.income_opportunities?.score ?? null,
                  status: i.status,
                }))}
              fresh={fresh}
              active={activeSet}
              exiting={exitingTiles}
            />
          </div>
        </div>

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
              userId={userId}
            />
          </div>
        </div>}

      </div>
    </div>
  );
}

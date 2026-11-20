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
@keyframes fadeDown {
  from{opacity:0;transform:translateY(-8px)}
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

.text-glow   { animation: textGlow 3s ease-in-out infinite }
.green-glow  { animation: greenGlow 3s ease-in-out infinite }
.border-live { animation: borderLive 2.5s ease-in-out infinite }
.cursor      { animation: blink 1s step-end infinite }
.idle-pulse  { animation: idlePulse 3s ease-in-out infinite }
.fade-up     { animation: fadeUp .35s ease-out both }
.slow-fade   { animation: slowFade 2.5s ease-in-out infinite }
.scan-prog   { transform-origin:left; animation: scanProg 55s linear forwards }
.tile-enter  { animation: tileEnter .42s cubic-bezier(0.22,1.2,0.36,1) both }
.tile-submit { animation: tileSubmit .5s ease-out, tilePulse 1.5s ease-in-out 2 }
.tile-active { animation: tileActive 1.8s ease-in-out infinite }
.count-punch { animation: countPunch .38s cubic-bezier(0.34,1.56,0.64,1) both }
.card-glow   { animation: cardGlow .6s ease-out both }
@keyframes numUp   { 0%{transform:translateY(6px);color:#22c55e} 70%{color:#4ade80} 100%{transform:translateY(0);color:#fff} }
@keyframes numDown { 0%{transform:translateY(-6px);color:#ef4444} 70%{color:#f87171} 100%{transform:translateY(0);color:#fff} }
.num-up   { animation: numUp   .55s cubic-bezier(0.22,1,0.36,1) both }
.num-down { animation: numDown .55s cubic-bezier(0.22,1,0.36,1) both }
.tls-feed { font-family:'Geist','Inter','Segoe UI Variable',system-ui,-apple-system,sans-serif; font-size:15px; letter-spacing:-0.01em; }
.fade-down { animation: fadeDown .3s ease-out both }
.tls-scroll { overflow-y:auto; scrollbar-width:none; }
.tls-scroll::-webkit-scrollbar { display:none; }
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

function nextScan(now: number) {
  const d = new Date(now);
  const m = d.getUTCMinutes();
  const next = m < 15 ? 15 : m < 30 ? 30 : m < 45 ? 45 : 60;
  if (next === 60) { d.setUTCMinutes(0, 0, 0); d.setUTCHours(d.getUTCHours() + 1); }
  else { d.setUTCMinutes(next, 0, 0); }
  d.setUTCSeconds(0, 0);
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

function WaitingColumn({ items, fresh, active }: {
  items: { id: string; title: string; usdAmt: number; url?: string | null; score?: number | null }[];
  fresh?: Set<string>; active?: Set<string>;
}) {
  const [prevCount, setPrevCount] = useState(items.length);
  const [countDir, setCountDir] = useState<"up"|"down"|null>(null);
  const totalUsd = items.reduce((s, i) => s + (i.usdAmt ?? 0), 0);
  const [prevTotal, setPrevTotal] = useState(totalUsd);
  const [totalDir, setTotalDir] = useState<"up"|"down"|null>(null);

  useEffect(() => {
    if (items.length !== prevCount) {
      setCountDir(items.length > prevCount ? "up" : "down");
      const t = setTimeout(() => setCountDir(null), 600);
      setPrevCount(items.length);
      return () => clearTimeout(t);
    }
  }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (totalUsd !== prevTotal) {
      setTotalDir(totalUsd > prevTotal ? "up" : "down");
      const t = setTimeout(() => setTotalDir(null), 600);
      setPrevTotal(totalUsd);
      return () => clearTimeout(t);
    }
  }, [totalUsd]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-56">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex flex-col leading-none">
          <span className={`text-4xl font-black tabular-nums leading-none ${
            countDir === "up" ? "num-up" : countDir === "down" ? "num-down" : ""
          } ${items.length === 0 ? "text-zinc-700" : "text-white"}`}>
            {items.length}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 mt-1">queued</span>
        </div>
        {totalUsd > 0 && (
          <div className="flex flex-col items-end leading-none">
            <span className={`text-4xl font-black tabular-nums leading-none ${
              totalDir === "up" ? "num-up" : totalDir === "down" ? "num-down" : "text-white"
            }`}>{usd(totalUsd)}</span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-600 mt-1">total value</span>
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2.5">
        {items.length === 0 && <span className="text-[11px] text-zinc-800">—</span>}
        {items.map(item => {
          const accent = bountyAccent(item.title);
          const isFresh = fresh?.has(item.id);
          const isActive = active?.has(item.id);
          const amtLabel = item.usdAmt >= 1000
            ? `$${(item.usdAmt / 1000 % 1 === 0 ? (item.usdAmt / 1000).toFixed(0) : (item.usdAmt / 1000).toFixed(1))}k`
            : item.usdAmt > 0 ? `$${Math.round(item.usdAmt)}` : "?";
          const scoreColor = item.score != null
            ? `hsl(${Math.round(item.score * 1.2)},85%,55%)`
            : null;
          return (
            <div
              key={item.id}
              className={`${isFresh ? "tile-enter" : ""} cursor-pointer select-none`}
              onClick={() => item.url && window.open(item.url, "_blank")}
            >
              <div
                className={`p-3 border ${isFresh ? "card-glow" : ""} ${isActive ? "tile-active" : ""} transition-all duration-200 hover:brightness-125`}
                style={{
                  borderColor: isActive ? "rgba(45,212,191,0.5)" : `${accent}44`,
                  background: `${accent}09`,
                  ["--cg" as any]: `${accent}55`,
                }}
              >
                <div className="flex items-baseline justify-between gap-1 leading-none">
                  {scoreColor && (
                    <span className="text-[20px] font-mono font-bold tabular-nums" style={{ color: scoreColor }}>
                      {item.score}
                    </span>
                  )}
                  <span className="text-[20px] font-mono font-bold tabular-nums ml-auto" style={{ color: accent }}>
                    {amtLabel}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-1.5 leading-snug" style={{
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>
                  {item.title}
                </div>
              </div>
            </div>
          );
        })}
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

let _muted = false;
try { _muted = localStorage.getItem("tls_muted") === "1"; } catch {}
export function isMuted() { return _muted; }
export function setMuted(v: boolean) {
  _muted = v;
  try { localStorage.setItem("tls_muted", v ? "1" : "0"); } catch {}
}

function playScanSound() {
  if (_muted) return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // 8-bit radar sweep: ascending square-wave tones
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
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // 8-bit "point scored" — G C E G C ascending arpeggio
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
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Low thud + ascending sawtooth run — "engine starting"
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
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = "square"; osc.frequency.value = 880;
    g.gain.setValueAtTime(0.022, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.015);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.015);
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

function ScanCountdown({ lastScanTs: initialTs }: { lastScanTs: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  const [lastScanMs, setLastScanMs] = useState<number | null>(() =>
    initialTs ? new Date(initialTs).getTime() : null
  );
  const prevTickSec = useRef<number | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Live subscription — update lastScanMs when a scan actually lands
  useEffect(() => {
    const { createClient } = require("@/lib/supabase/client");
    const supabase = createClient();
    const seenScan = new Set<string>();
    const ch = (supabase as any)
      .channel("scan_countdown")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "income_activity_log" }, (p: any) => {
        const e = p.new;
        if (seenScan.has(e.id)) return;
        seenScan.add(e.id);
        if (e.action === "discovery_run" || e.action === "scan_start") {
          setLastScanMs(new Date(e.created_at).getTime());
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Always count to next UTC cron slot (:00/:15/:30/:45) — independent of when scan landed
  let nextMs = nextScan(now);
  while (nextMs <= now) nextMs += 15 * 60 * 1000;
  const remaining = nextMs - now;
  const remM = Math.floor(remaining / 60000);
  const remS = Math.floor((remaining % 60000) / 1000);

  // Overdue: last confirmed scan > 20 min ago
  const missedMs = lastScanMs ? now - lastScanMs : null;
  const isOverdue = missedMs !== null && missedMs > 20 * 60 * 1000;
  const overdueMin = missedMs ? Math.floor(missedMs / 60000) : 0;

  // Tick on last 5 seconds
  useEffect(() => {
    if (!isOverdue && remM === 0 && remS >= 1 && remS <= 5) {
      if (prevTickSec.current !== remS) {
        prevTickSec.current = remS;
        playTick();
      }
    }
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isOverdue) {
    return <span className="text-sm tabular-nums font-mono text-red-500 animate-pulse">OVERDUE {overdueMin}m</span>;
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

function HeaderStats({ allTimeUsd, inFlightUsd, submittedAllTime, acceptedCount, rejectedCount, winRate, totalScanned }: {
  allTimeUsd: number; inFlightUsd: number; submittedAllTime: number; acceptedCount: number; rejectedCount: number; winRate: number; totalScanned: number;
}) {
  const hasRecord = acceptedCount + rejectedCount > 0;
  return (
    <div className="flex flex-wrap items-end gap-x-7 gap-y-1 mt-2">
      <StatCell value={usd(allTimeUsd)} label="total earned" color={allTimeUsd > 0 ? "text-emerald-400 green-glow" : "text-zinc-500"} />
      <Dot />
      <StatCell value={usd(inFlightUsd)} label="submitted value" color={inFlightUsd > 0 ? "text-sky-400" : "text-zinc-500"} />
      <Dot />
      <StatCell value={String(submittedAllTime)} label="submitted" />
      <Dot />
      {/* Compact W/L + win% combined cell */}
      <div className="flex flex-col">
        <div className="flex items-baseline gap-1 leading-tight">
          <span className={`text-lg font-semibold tabular-nums ${acceptedCount > 0 ? "text-emerald-400" : "text-zinc-500"}`}>{acceptedCount}W</span>
          <span className="text-zinc-700 text-sm select-none">·</span>
          <span className={`text-lg font-semibold tabular-nums ${rejectedCount > 0 ? "text-red-400" : "text-zinc-500"}`}>{rejectedCount}L</span>
          <span className={`text-sm tabular-nums font-mono ml-1 ${hasRecord ? "text-zinc-400" : "text-zinc-600"}`}>{winRate}%</span>
        </div>
        <span className="text-[11px] text-zinc-600 leading-tight">win rate</span>
      </div>
      <Dot />
      <StatCell value={totalScanned > 0 ? totalScanned.toLocaleString() : "—"} label="bounties scanned" color={totalScanned > 0 ? "text-zinc-400" : "text-zinc-600"} />
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
const DASH_VERSION = "v33";

function getAgentServer() {
  if (typeof window === "undefined") return DEFAULT_AGENT_SERVER;
  return localStorage.getItem("tls_agent_server") || DEFAULT_AGENT_SERVER;
}

type FeedLine = { id: string; ts: string; msg: string; accent: string; bountyKey?: string; hidden?: boolean };

// No reds, greens, blues, ambers, or teals — those are reserved for system status colors
const BOUNTY_PALETTE = ["#e879f9","#a78bfa","#818cf8","#f472b6","#c084fc","#d8b4fe","#f9a8d4","#7c3aed","#9333ea","#a855f7"];

const ACTION_COLORS: [string, string][] = [
  ["Abandoned",      "#f87171"],
  ["Error:",         "#f87171"],
  ["Failed",         "#f87171"],
  ["Rejected",       "#f87171"],
  ["Server offline", "#f87171"],
  ["Accepted",       "#4ade80"],
  ["Earned",         "#4ade80"],
  ["Submitted",      "#38bdf8"],
  ["Found ",         "#38bdf8"],
  ["Discovery scan", "#38bdf8"],
  ["Pipeline",       "#52525b"],
  ["Skipped",        "#71717a"],
  ["Staged",         "#71717a"],
  ["Dismissed",      "#71717a"],
  ["Working on",     "#2dd4bf"],
  ["In review",      "#fbbf24"],
];

function bountyAccent(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return BOUNTY_PALETTE[Math.abs(h) % BOUNTY_PALETTE.length];
}

function formatFeedEntry(action: string, detail: string): { msg: string; bountyKey?: string; hidden?: boolean } {
  switch (action) {
    case "scan_source":
      return { msg: detail, hidden: true };
    case "scan_start":
      return { msg: detail };
    case "discovery_run":
      return { msg: detail };
    case "pipeline_start":
      return { msg: detail };
    case "pipeline_end":
      return { msg: detail };
    case "agent_pr_opened": {
      const [title, url] = detail.split(" → ");
      const prNum = url?.match(/pull\/(\d+)/)?.[1];
      const repo  = url?.match(/github\.com\/[^/]+\/([^/]+)/)?.[1];
      const msg   = prNum && repo ? `Submitted — #${prNum} on ${repo} — ${title || ""}` : `Submitted — ${detail}`;
      return { msg, bountyKey: title };
    }
    case "pr_merged":
      return { msg: `Accepted — ${detail}`, bountyKey: detail };
    case "pr_closed":
      return { msg: `Rejected — ${detail}`, bountyKey: detail };
    case "agent_no_changes": {
      const sep = detail.indexOf("|||");
      const title  = sep > -1 ? detail.slice(0, sep) : detail;
      const reason = sep > -1 ? detail.slice(sep + 3) : "no code changes";
      return { msg: `Abandoned bounty — ${title} — ${reason}`, bountyKey: title };
    }
    case "agent_skip": {
      const sep = detail.indexOf("|||");
      const title  = sep > -1 ? detail.slice(0, sep) : detail;
      const reason = sep > -1 ? detail.slice(sep + 3) : "";
      return { msg: reason ? `Skipped — ${title} — ${reason}` : `Skipped — ${detail}`, bountyKey: sep > -1 ? title : undefined };
    }
    case "agent_error":
      return { msg: `Error: ${detail}` };
    case "opportunity_queued":
      return { msg: `Staged — ${detail}`, bountyKey: detail };
    case "opportunity_dismissed": {
      const sep = detail.indexOf("|||");
      const title  = sep > -1 ? detail.slice(0, sep) : detail;
      const reason = sep > -1 ? detail.slice(sep + 3) : "";
      return { msg: reason ? `Dismissed — ${title} — ${reason}` : `Dismissed — ${detail}`, bountyKey: title };
    }
    case "earning_logged":
      return { msg: `Earned — ${detail}`, bountyKey: detail };
    case "approval_approved":
      return { msg: `Approved — ${detail}` };
    case "pr_check_run":
      return { msg: detail, hidden: true };
    default:
      return { msg: detail };
  }
}

function LiveFeed({ userId, stagedCount, projected, onScan, onRun }: { userId: string; stagedCount: number; projected: number; onScan?: (ts: string) => void; onRun?: () => Promise<void> }) {
  const [lines, setLines] = useState<FeedLine[]>([]);
  const [runState, setRunState] = useState<"idle" | "running" | "done" | "copied">("idle");
  const [serverAddr, setServerAddr] = useState(DEFAULT_AGENT_SERVER);
  useEffect(() => { setServerAddr(getAgentServer()); }, []);

  // ── Typewriter engine ─────────────────────────────────────────────────────
  const typingQueueRef = useRef<FeedLine[]>([]);
  const typingActiveRef = useRef<{ line: FeedLine; pos: number } | null>(null);
  const [typingDisplay, setTypingDisplay] = useState<{ line: FeedLine; pos: number } | null>(null);
  const [cursorBlink, setCursorBlink] = useState(true);
  const [clockStr, setClockStr] = useState(() =>
    new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );

  useEffect(() => {
    const c = setInterval(() => setCursorBlink(b => !b), 530);
    const k = setInterval(() => setClockStr(
      new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
    ), 1000);
    return () => { clearInterval(c); clearInterval(k); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (!typingActiveRef.current) {
        const next = typingQueueRef.current.shift();
        if (!next) return;
        typingActiveRef.current = { line: next, pos: 0 };
      }
      const active = typingActiveRef.current;
      const newPos = Math.min(active.pos + 3, active.line.msg.length);
      active.pos = newPos;
      setTypingDisplay({ line: active.line, pos: newPos });
      if (newPos >= active.line.msg.length) {
        const done = active.line;
        typingActiveRef.current = null;
        setTypingDisplay(null);
        setLines(prev => [...prev.slice(-99), done]);
        playTick();
      }
    }, 16);
    return () => clearInterval(t);
  }, []);

  function add(msg: string, accent: string, bountyKey?: string, hidden?: boolean) {
    if (hidden) return;
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    typingQueueRef.current.push({ id: `${Date.now()}-${Math.random()}`, ts, msg, accent, bountyKey });
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
          const ts = new Date(e.created_at).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
          const { msg, bountyKey, hidden } = formatFeedEntry(e.action, e.detail || "");
          if (hidden) return [];
          const accent = e.action === "pipeline_start" ? "#fbbf24"
            : bountyKey ? bountyAccent(bountyKey) : "#71717a";
          return [{ id: e.id, ts, msg, accent, bountyKey }];
        });
        setLines(history);
      });
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
      setLines(prev => {
        const known = new Set(prev.map((l: FeedLine) => l.id));
        const fresh = data.reverse().flatMap((e: any) => {
          if (known.has(e.id)) return [];
          const ts = new Date(e.created_at).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
          const { msg, bountyKey, hidden } = formatFeedEntry(e.action, e.detail || "");
          if (hidden) return [];
          if (e.action === "pipeline_start") playPipelineSound();
          const accent = e.action === "pipeline_start" ? "#fbbf24"
            : bountyKey ? bountyAccent(bountyKey) : "#71717a";
          return [{ id: e.id, ts, msg, accent, bountyKey }];
        });
        if (!fresh.length) return prev;
        return [...prev, ...fresh].slice(-100);
      });
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
        const msg =
          st === "in_progress" ? `Working on — ${title}` :
          st === "submitted"   ? `Submitted — ${title}` :
          st === "done"        ? `Accepted — ${title}` :
          st === "failed"      ? `Rejected — ${title}` :
          st === "review"      ? `In review — ${title}` :
          st === "pending"     ? `Staged — ${title}` :
                                 `${st} — ${title}`;
        add(msg, bountyAccent(title), title);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "income_work_queue", filter: `user_id=eq.${userId}` }, (p: any) => {
        const t = p.new.title || "";
        const amt = p.new.expected_usd ?? 0;
        const amtStr = amt > 0 ? ` ${usd(amt)} —` : "";
        add(`Staged —${amtStr} ${t}`, bountyAccent(t), t);
        playBountyChime();
      })
      .subscribe();

    const ch2 = (sb as any).channel(`lf_log_${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "income_activity_log", filter: `user_id=eq.${userId}` }, (p: any) => {
        const { msg, bountyKey, hidden } = formatFeedEntry(p.new.action, p.new.detail || "");
        const accent = p.new.action === "pipeline_start" ? "#fbbf24"
          : bountyKey ? bountyAccent(bountyKey) : "#71717a";
        add(msg, accent, bountyKey, hidden);
        if (p.new.action === "discovery_run") {
          playScanSound();
          notifyScan(p.new.detail || "");
          onScan?.(p.new.created_at || new Date().toISOString());
        }
        if (p.new.action === "pipeline_start") {
          playPipelineSound();
        }
      })
      .subscribe();

    return () => { sb.removeChannel(ch1); sb.removeChannel(ch2); };
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

  return (
    <div
      className="tls-scroll"
      style={{
        height: "calc(100vh - 220px)",
        WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 88%, transparent 100%)",
        maskImage:        "linear-gradient(to bottom, black 0%, black 88%, transparent 100%)",
      }}
    >
      {/* ── Cursor row — always pinned at top ─────────────────────────── */}
      <div className="flex gap-3 tls-feed leading-[1.65] mb-1 sticky top-0 bg-black pb-1">
        <span className="text-zinc-500 shrink-0 tabular-nums font-mono text-[11px] mt-[3px]">{clockStr}</span>
        <span className="text-zinc-600 shrink-0 font-mono text-[11px] mt-[3px] select-none">›</span>
        <span className="break-words min-w-0 font-mono">
          {typingDisplay ? (
            <>
              {(() => {
                const l = typingDisplay.line;
                const partial = l.msg.slice(0, typingDisplay.pos);
                let kwLen = 0, kwColor = "";
                for (const [kw, c] of ACTION_COLORS) {
                  if (partial.startsWith(kw) || l.msg.startsWith(kw)) { kwLen = Math.min(kw.length, typingDisplay.pos); kwColor = c; break; }
                }
                return <>
                  {kwLen > 0 && <span style={{ color: kwColor }}>{partial.slice(0, kwLen)}</span>}
                  {l.bountyKey && partial.slice(kwLen).includes(l.bountyKey)
                    ? (() => {
                        const r = partial.slice(kwLen);
                        const bi = r.indexOf(l.bountyKey);
                        return <>
                          <span className="text-zinc-300">{r.slice(0, bi)}</span>
                          <span style={{ color: l.accent }}>{l.bountyKey}</span>
                          <span className="text-zinc-300">{r.slice(bi + l.bountyKey.length)}</span>
                        </>;
                      })()
                    : <span className="text-zinc-300">{partial.slice(kwLen)}</span>
                  }
                  <span className="text-zinc-200">█</span>
                </>;
              })()}
            </>
          ) : (
            <span className={`text-zinc-500 transition-opacity duration-75 ${cursorBlink ? "opacity-100" : "opacity-0"}`}>█</span>
          )}
        </span>
      </div>

      {/* ── History — newest at top ────────────────────────────────────── */}
      <div className="space-y-1 pr-2">
        {lines.length === 0 && !typingDisplay && (
          <p className="tls-feed text-zinc-800 py-1 select-none pl-[52px]">— waiting for activity —</p>
        )}
        {[...lines].reverse().map((l, idx) => {
          let kwLen = 0, kwColor = "";
          for (const [kw, c] of ACTION_COLORS) {
            if (l.msg.startsWith(kw)) { kwLen = kw.length; kwColor = c; break; }
          }
          const kwText = l.msg.slice(0, kwLen);
          const rest   = l.msg.slice(kwLen);

          let restNode: React.ReactNode;
          if (l.bountyKey && rest.includes(l.bountyKey)) {
            const bkIdx  = rest.indexOf(l.bountyKey);
            const before = rest.slice(0, bkIdx);
            const after  = rest.slice(bkIdx + l.bountyKey.length);
            restNode = <>
              {before && <span className="text-zinc-300">{before}</span>}
              <span style={{ color: l.accent }}>{l.bountyKey}</span>
              {after && <span className="text-zinc-300">{after}</span>}
            </>;
          } else {
            restNode = <span className="text-zinc-300">{rest}</span>;
          }

          return (
            <div key={l.id} className={`flex gap-3 tls-feed leading-[1.65] ${idx === 0 ? "fade-down" : ""}`}>
              <span className="text-zinc-700 shrink-0 tabular-nums font-mono text-[11px] mt-[3px]">{l.ts}</span>
              <span className="text-zinc-700 shrink-0 font-mono text-[11px] mt-[3px] select-none">·</span>
              <span className="break-words min-w-0">
                {kwLen > 0 && <span style={{ color: kwColor }}>{kwText}</span>}
                {restNode}
              </span>
            </div>
          );
        })}
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
          setLiveItems(prev => [p.new, ...prev]);
          setFresh(prev => new Set([...prev, p.new.id]));
          setTimeout(() => setFresh(prev => { const n = new Set(prev); n.delete(p.new.id); return n; }), 800);
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
  const activeItems     = liveItems.filter(w => w.status === "in_progress");
  const activeSet       = new Set(activeItems.map(i => i.id));
  const acceptedCount   = liveItems.filter(w => w.status === "done").length + allEarnings.filter(e => e.status === "collected").length;
  const rejectedCount   = liveItems.filter(w => w.status === "failed").length;
  const submittedAllTime = liveItems.filter(w => ["submitted","done","failed"].includes(w.status)).length;
  const inFlightUsd     = liveItems.filter(w => w.status === "submitted").reduce((s, w) => s + (w.expected_usd ?? 0), 0);
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
    <div className="bg-black text-white font-mono -mx-4 -mt-6 -mb-6 min-h-screen relative">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="max-w-[960px] mx-auto px-6 py-6 relative z-10">


        {/* ── header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-base font-semibold text-white tracking-wide">
              Bounty Engine<span className="cursor ml-0.5 text-zinc-600">_</span>
              <span className="ml-2 text-[10px] text-white font-mono font-normal">{DASH_VERSION}</span>
            </h1>
            <HeaderStats allTimeUsd={allTimeUsd} inFlightUsd={inFlightUsd} submittedAllTime={submittedAllTime} acceptedCount={acceptedCount} rejectedCount={rejectedCount} winRate={winRate} totalScanned={summary.totalBountyCount} />
          </div>
          <div className="flex items-center gap-3 shrink-0 mt-1">
            <ScanCountdown lastScanTs={lastScanTs} />
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
        <div className="flex gap-8 items-start mb-8">
          {/* Terminal — no frame, left edge flush */}
          <div className="flex-1 min-w-0">
            <LiveFeed userId={userId} stagedCount={pendingQueue.length} projected={summary.queueProjectedUsd} onScan={ts => setLastScanTs(ts)} onRun={syncQueue} />
          </div>
          {/* WAITING */}
          <div className="shrink-0 pt-[67px]">
            <WaitingColumn
              items={liveItems
                .filter(i => ["pending","in_progress","review"].includes(i.status))
                .map(i => ({
                  id: i.id,
                  title: i.title,
                  usdAmt: i.expected_usd ?? 0,
                  url: i.income_opportunities?.url ?? null,
                  score: i.income_opportunities?.score ?? null,
                }))}
              fresh={fresh}
              active={activeSet}
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

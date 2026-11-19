"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Opportunity } from "@/lib/income/types";

interface Props {
  opportunities: Opportunity[];
}

const SOURCE_COLOR: Record<string, string> = {
  algora:    "\x1b[32m",  // green
  issuehunt: "\x1b[36m",  // cyan
  github:    "\x1b[35m",  // magenta
  manual:    "\x1b[37m",  // white
};

function fmt(n: number | null, prefix = "$"): string {
  if (n == null) return "   —   ";
  return `${prefix}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function IncomeSelector({ opportunities }: Props) {
  const router = useRouter();
  const [cursor, setCursor]     = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queuing, setQueuing]   = useState(false);
  const [status, setStatus]     = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs      = useRef<(HTMLDivElement | null)[]>([]);

  // Scroll active row into view
  useEffect(() => {
    rowRefs.current[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const toggleSelect = useCallback((idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      const id = opportunities[idx]?.id;
      if (!id) return next;
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, [opportunities]);

  const queueSelected = useCallback(async () => {
    if (selected.size === 0) { setStatus("Nothing selected — press SPACE to select"); return; }
    setQueuing(true);
    setStatus(`Queuing ${selected.size} opportunit${selected.size === 1 ? "y" : "ies"}…`);
    try {
      const res = await fetch("/api/income/queue-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const data = await res.json();
      setStatus(`✓ ${data.queued} queued — returning to pipeline…`);
      setTimeout(() => router.push("/income?tab=pipeline"), 1200);
    } catch {
      setStatus("Error queuing — check console");
      setQueuing(false);
    }
  }, [selected, router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (queuing) return;
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setCursor(c => Math.max(0, c - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setCursor(c => Math.min(opportunities.length - 1, c + 1));
          break;
        case " ":
          e.preventDefault();
          toggleSelect(cursor);
          break;
        case "Enter":
          e.preventDefault();
          toggleSelect(cursor);
          setCursor(c => Math.min(opportunities.length - 1, c + 1));
          break;
        case "a":
        case "A":
          e.preventDefault();
          if (selected.size === opportunities.length) {
            setSelected(new Set());
          } else {
            setSelected(new Set(opportunities.map(o => o.id)));
          }
          break;
        case "s":
        case "S":
          e.preventDefault();
          queueSelected();
          break;
        case "Escape":
          router.push("/income");
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, opportunities, toggleSelect, queueSelected, queuing, router, selected.size]);

  // Auto-focus container
  useEffect(() => { containerRef.current?.focus(); }, []);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="fixed inset-0 bg-zinc-950 font-mono text-xs outline-none flex flex-col"
      style={{ fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace" }}
    >
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-amber-400 font-bold tracking-widest">TLS INCOME OPS</span>
          <span className="text-zinc-600 mx-3">─</span>
          <span className="text-zinc-500">BOUNTY SELECTOR</span>
          <span className="text-zinc-700 mx-3">─</span>
          <span className="text-zinc-600">{opportunities.length} opportunities</span>
        </div>
        <div className="flex items-center gap-6 text-zinc-600">
          <span><span className="text-zinc-400">↑↓</span> navigate</span>
          <span><span className="text-zinc-400">SPACE</span> select</span>
          <span><span className="text-zinc-400">A</span> select all</span>
          <span><span className="text-zinc-400 font-bold">S</span> queue {selected.size > 0 ? <span className="text-amber-400">({selected.size})</span> : null}</span>
          <span><span className="text-zinc-400">ESC</span> back</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="px-4 py-1.5 border-b border-zinc-900 flex items-center gap-0 text-zinc-700 uppercase tracking-widest text-[10px]">
        <span className="w-5" />
        <span className="w-10 text-right">SCR</span>
        <span className="w-24 text-right">REWARD</span>
        <span className="w-16 text-right">HRS</span>
        <span className="w-24 text-right">RATE</span>
        <span className="ml-4 flex-1">TITLE</span>
        <span className="w-32 text-right">SOURCE</span>
      </div>

      {/* Opportunity rows */}
      <div className="flex-1 overflow-y-auto scrollbar-none">
        {opportunities.map((opp, i) => {
          const isActive   = i === cursor;
          const isSelected = selected.has(opp.id);

          return (
            <div
              key={opp.id}
              ref={el => { rowRefs.current[i] = el; }}
              onClick={() => { setCursor(i); toggleSelect(i); }}
              className={`flex items-center px-4 py-1 gap-0 cursor-pointer transition-colors ${
                isActive
                  ? isSelected ? "bg-amber-900/40" : "bg-zinc-800/60"
                  : isSelected ? "bg-amber-950/30" : "hover:bg-zinc-900/40"
              }`}
            >
              {/* Select indicator */}
              <span className={`w-5 ${isSelected ? "text-amber-400" : "text-zinc-800"}`}>
                {isSelected ? "✓" : isActive ? "▶" : " "}
              </span>

              {/* Score */}
              <span className={`w-10 text-right tabular-nums ${
                opp.score >= 70 ? "text-emerald-400" : opp.score >= 50 ? "text-amber-500" : "text-zinc-600"
              }`}>
                {opp.score}
              </span>

              {/* Reward */}
              <span className={`w-24 text-right tabular-nums font-semibold ${
                opp.reward_usd && opp.reward_usd >= 500 ? "text-emerald-400"
                : opp.reward_usd ? "text-emerald-600" : "text-zinc-700"
              }`}>
                {opp.reward_usd ? `$${opp.reward_usd.toLocaleString()}` : "—"}
              </span>

              {/* Hours */}
              <span className="w-16 text-right text-zinc-600 tabular-nums">
                {opp.estimated_hours ? `~${opp.estimated_hours}h` : "—"}
              </span>

              {/* Rate */}
              <span className={`w-24 text-right tabular-nums ${
                opp.hourly_rate_est && opp.hourly_rate_est >= 200 ? "text-emerald-400"
                : opp.hourly_rate_est && opp.hourly_rate_est >= 50 ? "text-amber-500"
                : "text-zinc-700"
              }`}>
                {opp.hourly_rate_est ? `$${Math.round(opp.hourly_rate_est)}/hr` : "—"}
              </span>

              {/* Title */}
              <span className={`ml-4 flex-1 truncate ${isActive ? "text-zinc-100" : isSelected ? "text-zinc-200" : "text-zinc-400"}`}>
                {opp.title}
              </span>

              {/* Source + tags */}
              <span className="w-32 text-right flex items-center justify-end gap-1.5">
                <span className={`uppercase text-[9px] font-bold ${
                  opp.source === "algora" ? "text-emerald-500"
                  : opp.source === "issuehunt" ? "text-sky-500"
                  : "text-purple-500"
                }`}>{opp.source}</span>
                {opp.language && <span className="text-zinc-700">{opp.language}</span>}
                {opp.difficulty === "easy" && <span className="text-emerald-700">EASY</span>}
                {opp.difficulty === "hard" && <span className="text-red-700">HARD</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer status */}
      <div className={`border-t border-zinc-800 px-4 py-2 flex items-center justify-between ${queuing ? "bg-amber-950/20" : ""}`}>
        <span className={`${
          status.startsWith("✓") ? "text-emerald-400" :
          status.startsWith("Error") ? "text-red-400" : "text-zinc-500"
        }`}>
          {status || (selected.size > 0
            ? `${selected.size} selected — press S to queue for agent`
            : "Arrow keys to navigate, SPACE to select")}
        </span>
        {selected.size > 0 && !queuing && (
          <button
            onClick={queueSelected}
            className="px-4 py-1 text-xs font-bold bg-amber-800/60 text-amber-300 rounded border border-amber-700 hover:bg-amber-700/60 transition-colors"
          >
            QUEUE {selected.size} FOR AGENT →
          </button>
        )}
      </div>
    </div>
  );
}

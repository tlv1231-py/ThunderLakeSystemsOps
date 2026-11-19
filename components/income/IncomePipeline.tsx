"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

interface WorkItem {
  id: string;
  title: string;
  status: string;
  priority: number;
  expected_usd: number | null;
  estimated_hours: number | null;
  hours_invested: number;
  progress_note: string | null;
  progress_pct: number;
  pr_url: string | null;
  pr_number: number | null;
  repo_url: string | null;
  branch_name: string | null;
  agent_log: string | null;
  opportunity_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  initialItems: WorkItem[];
  userId: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending:     "text-zinc-500",
  in_progress: "text-amber-400",
  review:      "text-sky-400",
  submitted:   "text-orange-400",
  done:        "text-emerald-400",
  failed:      "text-red-400",
  cancelled:   "text-zinc-700",
};

const STATUS_DOT: Record<string, string> = {
  pending:     "○",
  in_progress: "●",
  review:      "◈",
  submitted:   "◎",
  done:        "✓",
  failed:      "✗",
  cancelled:   "–",
};

export function IncomePipeline({ initialItems, userId }: Props) {
  const [items, setItems] = useState<WorkItem[]>(initialItems);
  const [expanded, setExpanded] = useState<string | null>(null);
  const supabase = createClient();

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("income_pipeline_" + userId)
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "income_work_queue",
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            setItems(prev => [payload.new as WorkItem, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setItems(prev =>
              prev.map(item => item.id === payload.new.id ? { ...item, ...payload.new } : item)
            );
          } else if (payload.eventType === "DELETE") {
            setItems(prev => prev.filter(item => item.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const active   = items.filter(i => ["pending", "in_progress", "review", "submitted"].includes(i.status));
  const finished = items.filter(i => ["done", "failed", "cancelled"].includes(i.status));

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-10 text-center">
        <p className="text-sm text-zinc-500 font-mono">Pipeline empty</p>
        <p className="text-xs text-zinc-700 mt-2 font-mono">
          Opportunities are queued automatically — run the agent to begin
        </p>
        <div className="mt-6 font-mono text-left inline-block">
          <p className="text-zinc-700 text-xs">$ node scripts/income-agent.mjs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 font-mono">
      {/* Agent command hint */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60">
        <span className="text-xs text-zinc-600">
          <span className="text-zinc-500">$</span> node scripts/income-agent.mjs
        </span>
        <span className="text-[10px] text-zinc-700">
          {active.filter(i => i.status === "in_progress").length > 0
            ? <span className="text-amber-500 animate-pulse">● AGENT RUNNING</span>
            : active.length > 0
            ? <span className="text-zinc-600">● {active.length} PENDING</span>
            : <span className="text-emerald-700">● IDLE</span>
          }
        </span>
      </div>

      {/* Active items */}
      {active.map(item => (
        <PipelineRow
          key={item.id}
          item={item}
          expanded={expanded === item.id}
          onToggle={() => setExpanded(e => e === item.id ? null : item.id)}
        />
      ))}

      {/* Finished items */}
      {finished.length > 0 && (
        <details>
          <summary className="text-[11px] text-zinc-700 cursor-pointer hover:text-zinc-500 select-none py-1">
            {finished.length} completed / failed
          </summary>
          <div className="mt-1 space-y-1">
            {finished.map(item => (
              <PipelineRow
                key={item.id}
                item={item}
                expanded={expanded === item.id}
                onToggle={() => setExpanded(e => e === item.id ? null : item.id)}
                dim
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function PipelineRow({
  item, expanded, onToggle, dim = false,
}: {
  item: WorkItem;
  expanded: boolean;
  onToggle: () => void;
  dim?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border transition-colors ${
        item.status === "in_progress"
          ? "border-amber-800/50 bg-amber-950/20"
          : item.status === "done"
          ? "border-emerald-900/50 bg-emerald-950/10"
          : item.status === "failed"
          ? "border-red-900/40 bg-red-950/10"
          : "border-zinc-800 bg-zinc-900"
      } ${dim ? "opacity-50" : ""}`}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={onToggle}
      >
        {/* Status dot */}
        <span className={`text-sm w-4 ${STATUS_COLOR[item.status] ?? "text-zinc-500"} ${
          item.status === "in_progress" ? "animate-pulse" : ""
        }`}>
          {STATUS_DOT[item.status] ?? "○"}
        </span>

        {/* Title */}
        <span className={`flex-1 truncate text-xs ${dim ? "text-zinc-600" : "text-zinc-300"}`}>
          {item.title}
        </span>

        {/* Progress bar (only when in_progress) */}
        {item.status === "in_progress" && (
          <div className="w-24 h-1 bg-zinc-800 rounded-full overflow-hidden shrink-0">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${item.progress_pct ?? 0}%` }}
            />
          </div>
        )}

        {/* Reward */}
        {item.expected_usd && (
          <span className={`text-xs tabular-nums shrink-0 ${
            item.status === "done" ? "text-emerald-400" : "text-zinc-500"
          }`}>
            {formatCurrency(item.expected_usd)}
          </span>
        )}

        {/* PR link */}
        {item.pr_url && (
          <a
            href={item.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-[10px] text-sky-500 hover:underline shrink-0"
          >
            PR #{item.pr_number ?? "—"}
          </a>
        )}

        {/* Expand toggle */}
        <span className="text-zinc-700 text-[10px] shrink-0">{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Progress note */}
      {!expanded && item.progress_note && item.status !== "done" && (
        <div className="px-4 pb-2 text-[11px] text-zinc-600 font-mono">
          {item.progress_note}
        </div>
      )}

      {/* Expanded log */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
          {item.progress_note && (
            <p className="text-xs text-zinc-400">{item.progress_note}</p>
          )}
          {item.repo_url && (
            <p className="text-[11px] text-zinc-600">
              repo: <a href={item.repo_url} target="_blank" rel="noopener noreferrer"
                className="text-sky-700 hover:underline">{item.repo_url}</a>
            </p>
          )}
          {item.branch_name && (
            <p className="text-[11px] text-zinc-600">branch: <span className="text-zinc-500">{item.branch_name}</span></p>
          )}
          {item.agent_log && (
            <pre className="text-[10px] text-zinc-600 bg-zinc-950 rounded p-3 overflow-x-auto max-h-48 overflow-y-auto leading-relaxed">
              {item.agent_log}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

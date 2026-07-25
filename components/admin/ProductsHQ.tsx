"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export type ProductRow = {
  product_id: string;
  display_name: string;
  status: "healthy" | "degraded" | "down";
  metrics: Record<string, string | number | null>;
  reported_at: string;
  created_at: string;
};

const STALE_MS = 5  * 60 * 1000;
const DEAD_MS  = 15 * 60 * 1000;

function effectiveStatus(p: ProductRow): "healthy" | "degraded" | "down" {
  const age = Date.now() - new Date(p.reported_at).getTime();
  if (age > DEAD_MS) return "down";
  if (age > STALE_MS || p.status === "degraded") return "degraded";
  return p.status === "down" ? "down" : "healthy";
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function isIsoTimestamp(s: string) {
  return /^\d{4}-\d{2}-\d{2}T/.test(s);
}

const DOT: Record<string, string> = {
  healthy:  "bg-emerald-400",
  degraded: "bg-amber-400",
  down:     "bg-red-500",
};

const LABEL: Record<string, string> = {
  healthy:  "text-emerald-400",
  degraded: "text-amber-400",
  down:     "text-red-400",
};

const LABEL_TEXT: Record<string, string> = {
  healthy:  "Healthy",
  degraded: "Degraded",
  down:     "Offline",
};

export function ProductsHQ({ initial }: { initial: ProductRow[] }) {
  const [products, setProducts] = useState<ProductRow[]>(initial);
  const [, setTick] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const ch = (supabase as any)
      .channel("product_status_hq")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_status" }, (payload: any) => {
        setProducts((prev) => {
          if (payload.eventType === "DELETE") {
            return prev.filter((p) => p.product_id !== payload.old.product_id);
          }
          const next = payload.new as ProductRow;
          const exists = prev.some((p) => p.product_id === next.product_id);
          return exists
            ? prev.map((p) => p.product_id === next.product_id ? next : p)
            : [...prev, next];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const statuses  = products.map(effectiveStatus);
  const allOk     = statuses.length > 0 && statuses.every((s) => s === "healthy");
  const downCount = statuses.filter((s) => s === "down").length;
  const warnCount = statuses.filter((s) => s === "degraded").length;

  const mostRecentAt = products.length
    ? products.reduce((best, p) => (p.reported_at > best ? p.reported_at : best), "")
    : null;

  return (
    <div className="space-y-5">

      {/* ── Summary bar ── */}
      <div className="flex items-center gap-3 h-6">
        {products.length === 0 ? (
          <span className="text-sm text-zinc-600">No products reporting yet — set up a heartbeat to get started.</span>
        ) : allOk ? (
          <span className="flex items-center gap-2 text-sm font-medium text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            All Systems Operational
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm font-medium text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            {[
              downCount > 0 && `${downCount} offline`,
              warnCount > 0 && `${warnCount} degraded`,
            ].filter(Boolean).join(" · ")}
          </span>
        )}
        {mostRecentAt && (
          <span className="text-xs text-zinc-600">
            · {products.length} product{products.length !== 1 ? "s" : ""} · updated {timeAgo(mostRecentAt)}
          </span>
        )}
      </div>

      {/* ── Product cards ── */}
      {products.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-10 text-center space-y-2">
          <p className="text-sm text-zinc-500">No products reporting yet</p>
          <p className="text-xs text-zinc-700">
            POST to <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">/api/products/heartbeat</code> from your product to appear here
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => {
            const eff = effectiveStatus(p);
            const entries = Object.entries(p.metrics ?? {});
            return (
              <div key={p.product_id} className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                {/* Card header */}
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${DOT[eff]}`} />
                    <h3 className="text-sm font-semibold text-zinc-100 truncate">{p.display_name}</h3>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className={`text-xs font-medium ${LABEL[eff]}`}>{LABEL_TEXT[eff]}</p>
                    <p className="text-[10px] text-zinc-600">{timeAgo(p.reported_at)}</p>
                  </div>
                </div>

                {/* Metrics */}
                {entries.length > 0 && (
                  <div className="border-t border-zinc-800">
                    {entries.map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between px-5 py-2 border-b border-zinc-800/60 last:border-0">
                        <span className="text-xs text-zinc-500">{k}</span>
                        <span className="text-xs font-medium text-zinc-300 tabular-nums">
                          {v == null
                            ? "—"
                            : isIsoTimestamp(String(v))
                            ? timeAgo(String(v))
                            : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

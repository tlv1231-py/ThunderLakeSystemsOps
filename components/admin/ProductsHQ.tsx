"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export type ProductRow = {
  product_id: string;
  display_name: string;
  token_hash: string;
  expected_interval_seconds: number;
  status: "healthy" | "degraded" | "down";
  metrics: Record<string, string | number | boolean | null>;
  last_seen: string | null;
  created_at: string;
};

type EffectiveStatus = "healthy" | "degraded" | "down" | "missing";

function effectiveStatus(p: ProductRow): EffectiveStatus {
  if (!p.last_seen) return "missing";
  const age       = Date.now() - new Date(p.last_seen).getTime();
  const threshold = (p.expected_interval_seconds ?? 300) * 2 * 1000;
  if (age > threshold)      return "missing";
  if (p.status === "down")  return "down";
  if (p.status === "degraded") return "degraded";
  return "healthy";
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function isIsoTimestamp(s: string) {
  return /^\d{4}-\d{2}-\d{2}T/.test(s);
}

function formatMetricValue(v: string | number | boolean | null): string {
  if (v == null)             return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && isIsoTimestamp(v)) return timeAgo(v);
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
}

const DOT: Record<EffectiveStatus, string> = {
  healthy:  "bg-emerald-400",
  degraded: "bg-amber-400",
  down:     "bg-red-500",
  missing:  "bg-zinc-600",
};

const RING: Record<EffectiveStatus, string> = {
  healthy:  "border-zinc-800",
  degraded: "border-amber-800/50",
  down:     "border-red-900/60",
  missing:  "border-zinc-800",
};

const LABEL_COLOR: Record<EffectiveStatus, string> = {
  healthy:  "text-emerald-400",
  degraded: "text-amber-400",
  down:     "text-red-400",
  missing:  "text-zinc-500",
};

const LABEL_TEXT: Record<EffectiveStatus, string> = {
  healthy:  "Healthy",
  degraded: "Degraded",
  down:     "Offline",
  missing:  "Missing",
};

export function ProductsHQ({ initial }: { initial: ProductRow[] }) {
  const [products, setProducts] = useState<ProductRow[]>(initial);
  const [, setTick] = useState(0);
  const supabase = createClient();

  // Re-render every 10 s so staleness labels stay current
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  // Realtime: watch the products table for any change
  useEffect(() => {
    const ch = (supabase as any)
      .channel("products_hq")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, (payload: any) => {
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

  const statuses     = products.map(effectiveStatus);
  const allOk        = statuses.length > 0 && statuses.every((s) => s === "healthy");
  const downCount    = statuses.filter((s) => s === "down").length;
  const degradedCount = statuses.filter((s) => s === "degraded").length;
  const missingCount = statuses.filter((s) => s === "missing").length;
  const problemCount = downCount + degradedCount + missingCount;

  const mostRecentAt = products
    .filter((p) => p.last_seen)
    .reduce<string | null>((best, p) => (!best || p.last_seen! > best ? p.last_seen! : best), null);

  return (
    <div className="space-y-5">

      {/* ── Summary bar ── */}
      <div className="flex items-center gap-3 min-h-6">
        {products.length === 0 ? (
          <span className="text-sm text-zinc-600">No products registered yet.</span>
        ) : allOk ? (
          <span className="flex items-center gap-2 text-sm font-medium text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            All Systems Operational
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm font-medium text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            {[
              downCount    > 0 && `${downCount} offline`,
              degradedCount > 0 && `${degradedCount} degraded`,
              missingCount  > 0 && `${missingCount} missing`,
            ].filter(Boolean).join(" · ")}
          </span>
        )}
        {products.length > 0 && (
          <span className="text-xs text-zinc-600">
            · {products.length} product{products.length !== 1 ? "s" : ""}
            {mostRecentAt ? ` · updated ${timeAgo(mostRecentAt)}` : ""}
          </span>
        )}
      </div>

      {/* ── Cards ── */}
      {products.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-10 text-center space-y-2">
          <p className="text-sm text-zinc-500">No products registered yet</p>
          <p className="text-xs text-zinc-700">
            POST to{" "}
            <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">/api/products/register</code>{" "}
            to add a product, then start sending heartbeats.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => {
            const eff     = effectiveStatus(p);
            const entries = Object.entries(p.metrics ?? {});
            return (
              <div
                key={p.product_id}
                className={`rounded-xl border bg-zinc-900 overflow-hidden ${RING[eff]}`}
              >
                {/* Header */}
                <div className="px-5 py-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${DOT[eff]} ${eff === "healthy" ? "animate-pulse" : ""}`} />
                    <h3 className="text-sm font-semibold text-zinc-100 truncate">{p.display_name}</h3>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-medium ${LABEL_COLOR[eff]}`}>{LABEL_TEXT[eff]}</p>
                    <p className="text-[10px] text-zinc-600">
                      {p.last_seen ? timeAgo(p.last_seen) : "never seen"}
                    </p>
                  </div>
                </div>

                {/* Metrics */}
                {entries.length > 0 && (
                  <div className="border-t border-zinc-800">
                    {entries.map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-center justify-between px-5 py-2 border-b border-zinc-800/50 last:border-0"
                      >
                        <span className="text-xs text-zinc-500">{k}</span>
                        <span className={`text-xs font-medium tabular-nums ${
                          typeof v === "boolean"
                            ? v ? "text-emerald-400" : "text-red-400"
                            : "text-zinc-300"
                        }`}>
                          {formatMetricValue(v)}
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

"use client";

import { useState } from "react";
import { toWeekStart, type WeekBucket } from "@/services/cashflow-service";

const BAR_H = 120; // px — total bar area height
const LABEL_H = 32; // px — space below bars for date label

function fmtFull(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function monthLabel(monthStart: string): string {
  const d = new Date(monthStart + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

interface TooltipData {
  bucket: WeekBucket;
  colIndex: number;
}

export function CashflowTimeline({ weeks }: { weeks: WeekBucket[] }) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const todayWeek = toWeekStart(new Date().toISOString().split("T")[0]);
  const maxTotal = Math.max(
    ...weeks.map((w) => w.projected + w.sent + w.paid + w.overdue),
    1
  );

  function barH(amount: number) {
    return Math.round((amount / maxTotal) * BAR_H);
  }

  const totalCols = weeks.length;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-100">Cashflow Timeline</h2>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <LegendDot color="bg-emerald-600/80" label="Paid" />
          <LegendDot color="bg-blue-500/80" label="Sent" />
          <LegendDot color="bg-red-500/80" label="Overdue" />
          <LegendDot color="bg-zinc-400/50" label="Projected" />
        </div>
      </div>

      {/* Chart */}
      <div className="px-4 pt-5 pb-4 overflow-x-auto">
        <div
          className="relative flex items-end gap-1"
          style={{ height: BAR_H + LABEL_H }}
        >
          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute z-20 pointer-events-none"
              style={{
                bottom: LABEL_H + BAR_H + 8,
                left: `${((tooltip.colIndex + 0.5) / totalCols) * 100}%`,
                transform: "translateX(-50%)",
                minWidth: 172,
              }}
            >
              <div className="rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl p-3 text-xs">
                <p className="font-medium text-zinc-200 mb-2 whitespace-nowrap">
                  {monthLabel(tooltip.bucket.weekStart)}
                </p>
                <div className="space-y-1.5">
                  <TooltipRow
                    show={tooltip.bucket.paid > 0}
                    label="Paid"
                    color="text-emerald-400"
                    value={fmtFull(tooltip.bucket.paid)}
                  />
                  <TooltipRow
                    show={tooltip.bucket.sent > 0}
                    label="Sent"
                    color="text-blue-400"
                    value={fmtFull(tooltip.bucket.sent)}
                  />
                  <TooltipRow
                    show={tooltip.bucket.overdue > 0}
                    label="Overdue"
                    color="text-red-400"
                    value={fmtFull(tooltip.bucket.overdue)}
                  />
                  <TooltipRow
                    show={tooltip.bucket.projected > 0}
                    label="Projected"
                    color="text-zinc-400"
                    value={fmtFull(tooltip.bucket.projected)}
                  />
                  {tooltip.bucket.paid === 0 &&
                    tooltip.bucket.sent === 0 &&
                    tooltip.bucket.overdue === 0 &&
                    tooltip.bucket.projected === 0 && (
                      <p className="text-zinc-600">No activity</p>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* Bar columns */}
          {weeks.map((week, i) => {
            const isCurrent = week.weekStart === todayWeek;
            const paidH = barH(week.paid);
            const sentH = barH(week.sent);
            const overdueH = barH(week.overdue);
            const projH = barH(week.projected);
            const isEmpty = paidH + sentH + overdueH + projH === 0;

            return (
              <div
                key={week.weekStart}
                className="flex-1 flex flex-col items-stretch cursor-default select-none"
                style={{ height: BAR_H + LABEL_H }}
                onMouseEnter={() => setTooltip({ bucket: week, colIndex: i })}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Bar area — flex-col-reverse stacks from bottom up */}
                <div
                  className={`flex flex-col-reverse gap-px rounded-t-sm ${
                    isCurrent ? "bg-zinc-800/60" : "bg-transparent"
                  } ${isEmpty ? "border-b border-zinc-800" : ""}`}
                  style={{ height: BAR_H }}
                >
                  {paidH > 0 && (
                    <div
                      style={{ height: paidH }}
                      className="w-full bg-emerald-600/70 hover:bg-emerald-600/90 transition-colors"
                    />
                  )}
                  {sentH > 0 && (
                    <div
                      style={{ height: sentH }}
                      className="w-full bg-blue-500/70 hover:bg-blue-500/90 transition-colors"
                    />
                  )}
                  {overdueH > 0 && (
                    <div
                      style={{ height: overdueH }}
                      className="w-full bg-red-500/70 hover:bg-red-500/90 transition-colors"
                    />
                  )}
                  {projH > 0 && (
                    <div
                      style={{ height: projH }}
                      className="w-full bg-zinc-400/40 hover:bg-zinc-400/60 transition-colors"
                    />
                  )}
                </div>

                {/* Date label */}
                <div
                  className="flex items-start justify-center pt-1.5"
                  style={{ height: LABEL_H }}
                >
                  <span
                    className={`text-[9px] leading-tight text-center whitespace-nowrap ${
                      isCurrent
                        ? "text-zinc-300 font-semibold"
                        : "text-zinc-600"
                    }`}
                  >
                    {week.weekLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Baseline rule */}
        <div className="border-t border-zinc-800 -mt-[1px]" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-sm inline-block flex-shrink-0 ${color}`} />
      {label}
    </span>
  );
}

function TooltipRow({
  show,
  label,
  color,
  value,
}: {
  show: boolean;
  label: string;
  color: string;
  value: string;
}) {
  if (!show) return null;
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={color}>{label}</span>
      <span className="text-zinc-200 tabular-nums">{value}</span>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  hoursByDate: Record<string, number>;
  eventsByDate: Record<string, string[]>;
};

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function ActivityCalendar({ hoursByDate, eventsByDate }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function dateKey(d: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const todayKey = today.toISOString().split("T")[0];

  const maxHours = Math.max(1, ...Object.values(hoursByDate));

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-100">Activity</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Hours
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-500 ml-2" />
            Events
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs text-zinc-300 w-32 text-center">{monthLabel}</span>
            <button
              onClick={nextMonth}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 px-4 pt-3 pb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-zinc-600 py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 px-4 pb-4 gap-y-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} />;
          const key = dateKey(day);
          const hours = hoursByDate[key] ?? 0;
          const events = eventsByDate[key] ?? [];
          const isToday = key === todayKey;
          const barHeight = hours > 0 ? Math.max(3, Math.round((hours / maxHours) * 20)) : 0;

          return (
            <div
              key={key}
              className="flex flex-col items-center gap-0.5 py-1 group relative"
              title={[
                hours > 0 ? `${hours.toFixed(1)} hrs` : "",
                events.length > 0 ? events.join(", ") : "",
              ].filter(Boolean).join(" · ") || undefined}
            >
              <span
                className={`text-xs w-6 h-6 flex items-center justify-center rounded-full leading-none ${
                  isToday
                    ? "bg-zinc-700 text-zinc-100 font-semibold"
                    : "text-zinc-500 group-hover:text-zinc-300"
                }`}
              >
                {day}
              </span>
              {/* Hours bar */}
              {barHeight > 0 && (
                <div
                  className="w-4 rounded-sm bg-emerald-600/70"
                  style={{ height: `${barHeight}px` }}
                />
              )}
              {/* Event dot */}
              {events.length > 0 && (
                <div className="h-1 w-1 rounded-full bg-indigo-500" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

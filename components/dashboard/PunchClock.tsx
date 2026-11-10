"use client";

import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { upsertTimeEntry, createProject } from "@/app/(admin)/time/actions";

const PUNCH_KEY = "tls_punch_in_at";
const ADD_NEW   = "__ADD_NEW__";

type Client  = { id: string; company_name: string; default_hourly_rate: number | null };
type Project = { id: string; name: string; hourly_rate_override: number | null };
type DayBar  = { date: string; label: string; hours: number; isToday: boolean };

function getWeekDates(): string[] {
  const today = new Date();
  const dow = today.getDay(); // 0 = Sunday
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

export function PunchClock({ userId }: { userId: string }) {
  const [mounted, setMounted]           = useState(false);
  const [punchInAt, setPunchInAt]       = useState<number | null>(null);
  const [elapsed, setElapsed]           = useState("00:00:00");
  const [weekDays, setWeekDays]         = useState<DayBar[]>([]);
  const [weekTotal, setWeekTotal]       = useState(0);

  // Modal
  const [modalOpen, setModalOpen]       = useState(false);
  const [clients, setClients]           = useState<Client[]>([]);
  const [projects, setProjects]         = useState<Project[]>([]);
  const [selClientId, setSelClientId]   = useState("");
  const [selProjectId, setSelProjectId] = useState("");
  const [task, setTask]                 = useState("");
  const [hours, setHours]               = useState("");
  const [dateWorked, setDateWorked]     = useState("");
  const [billable, setBillable]         = useState(true);
  const [addingProj, setAddingProj]     = useState(false);
  const [newProjName, setNewProjName]   = useState("");
  const [modalError, setModalError]     = useState<string | null>(null);
  const [submitPending, startSubmit]    = useTransition();
  const [addProjPending, startAddProj]  = useTransition();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = createClient() as any;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Hydrate punch state from localStorage ─────────────────────────────────
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(PUNCH_KEY);
    if (stored) setPunchInAt(Number(stored));
  }, []);

  // ── Live timer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!punchInAt) { setElapsed("00:00:00"); return; }
    const tick = () => setElapsed(formatElapsed(Date.now() - punchInAt));
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [punchInAt]);

  // ── Load this week's logged hours ──────────────────────────────────────────
  const loadWeek = useCallback(async () => {
    const dates = getWeekDates();
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("time_entries")
      .select("date_worked, hours_decimal")
      .eq("user_id", userId)
      .gte("date_worked", dates[0])
      .lte("date_worked", dates[6]);

    const byDate = new Map<string, number>();
    for (const e of data ?? []) {
      byDate.set(e.date_worked, (byDate.get(e.date_worked) ?? 0) + e.hours_decimal);
    }

    const labels = ["M", "T", "W", "T", "F", "S", "S"];
    const days: DayBar[] = dates.map((date, i) => ({
      date, label: labels[i],
      hours: byDate.get(date) ?? 0,
      isToday: date === today,
    }));
    setWeekDays(days);
    setWeekTotal(days.reduce((s, d) => s + d.hours, 0));
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadWeek(); }, [loadWeek]);

  // ── Load clients on mount ──────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from("clients")
      .select("id, company_name, default_hourly_rate")
      .eq("user_id", userId)
      .order("company_name")
      .then(({ data }: any) => { if (data) setClients(data); });
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load projects when selected client changes ─────────────────────────────
  useEffect(() => {
    if (!selClientId) { setProjects([]); setSelProjectId(""); return; }
    supabase
      .from("projects")
      .select("id, name, hourly_rate_override")
      .eq("client_id", selClientId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }: any) => {
        setProjects(data ?? []);
        setSelProjectId("");
      });
  }, [selClientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Punch in ───────────────────────────────────────────────────────────────
  function handlePunchIn() {
    const ts = Date.now();
    localStorage.setItem(PUNCH_KEY, String(ts));
    setPunchInAt(ts);
  }

  // ── Open punch-out modal ───────────────────────────────────────────────────
  function handlePunchOutClick() {
    // Round up to nearest 0.5h (ceil to nearest half)
    const computedHours = punchInAt
      ? Math.ceil(((Date.now() - punchInAt) / 3_600_000) * 2) / 2
      : 0.5;
    setHours(String(computedHours));
    setDateWorked(new Date().toISOString().split("T")[0]);
    setSelClientId(clients[0]?.id ?? "");
    setTask("");
    setBillable(true);
    setModalError(null);
    setAddingProj(false);
    setNewProjName("");
    setModalOpen(true);
  }

  // ── Confirm punch-out → log time entry ────────────────────────────────────
  function handleConfirm() {
    if (!selClientId) { setModalError("Please select a client."); return; }
    const h = parseFloat(hours);
    if (isNaN(h) || h <= 0) { setModalError("Hours must be greater than 0."); return; }
    setModalError(null);

    startSubmit(async () => {
      try {
        const fd = new FormData();
        fd.append("client_id",    selClientId);
        fd.append("project_id",   selProjectId);
        fd.append("date_worked",  dateWorked);
        fd.append("hours_decimal", String(h));
        fd.append("description",  task);
        fd.append("billable",     String(billable));
        await upsertTimeEntry(fd);
        localStorage.removeItem(PUNCH_KEY);
        setPunchInAt(null);
        setModalOpen(false);
        await loadWeek();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Failed to log time.");
      }
    });
  }

  // ── Add project inline ─────────────────────────────────────────────────────
  function handleAddProject() {
    const name = newProjName.trim();
    if (!name || !selClientId) return;
    startAddProj(async () => {
      try {
        const proj = await createProject(selClientId, name);
        setProjects((p) => [...p, proj]);
        setSelProjectId(proj.id);
        setAddingProj(false);
        setNewProjName("");
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Failed to create project.");
      }
    });
  }

  const maxHours = Math.max(...weekDays.map((d) => d.hours), 1);

  if (!mounted) return null; // avoid hydration mismatch

  const isPunchedIn = punchInAt !== null;

  return (
    <>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden h-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-100">Work Tracker</h2>
          <span className="text-xs text-zinc-500 tabular-nums">{weekTotal.toFixed(1)} hrs this week</span>
        </div>

        <div className="p-5 flex gap-6 items-center">
          {/* Punch controls */}
          <div className="flex flex-col items-center justify-center gap-3 w-40 shrink-0">
            {isPunchedIn ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs text-zinc-500 uppercase tracking-wide">Recording</span>
                </div>
                <span className="font-mono text-2xl font-semibold text-zinc-100 tabular-nums tracking-tight">
                  {elapsed}
                </span>
                <button
                  onClick={handlePunchOutClick}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/18 transition-colors text-sm font-medium"
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-400 shrink-0" />
                  Punch Out
                </button>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full border border-zinc-700 flex items-center justify-center">
                  <span className="inline-block w-3.5 h-3.5 rounded-full bg-zinc-700" />
                </div>
                <button
                  onClick={handlePunchIn}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/18 transition-colors text-sm font-medium"
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                  Punch In
                </button>
              </>
            )}
          </div>

          {/* This Week bars */}
          <div className="flex-1 min-w-0">
            <div className="flex items-end gap-1.5" style={{ height: 64 }}>
              {weekDays.map((day) => {
                const pct = day.hours > 0 ? Math.max((day.hours / maxHours) * 100, 10) : 0;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1" style={{ height: "100%" }}>
                    <div className="w-full flex flex-col justify-end flex-1">
                      {pct > 0 ? (
                        <div
                          style={{ height: `${pct}%` }}
                          className={`w-full rounded-t-sm transition-all ${day.isToday ? "bg-emerald-500" : "bg-zinc-600"}`}
                          title={`${day.hours.toFixed(1)}h`}
                        />
                      ) : (
                        <div className={`w-full h-0.5 rounded-full ${day.isToday ? "bg-emerald-900" : "bg-zinc-800"}`} />
                      )}
                    </div>
                    <span className={`text-[9px] font-medium tabular-nums ${day.isToday ? "text-emerald-400" : "text-zinc-600"}`}>
                      {day.hours > 0 ? day.hours.toFixed(1) : day.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {weekDays.map((day) => (
                <div key={day.date} className="flex-1 text-center">
                  {day.hours === 0 && (
                    <span className={`text-[9px] ${day.isToday ? "text-emerald-900" : "text-zinc-800"}`}>{day.label}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Punch-out modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-100">Log Time</h3>
              <span className="text-xs text-zinc-500 font-mono tabular-nums">{elapsed}</span>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Client */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Client</label>
                <select
                  value={selClientId}
                  onChange={(e) => setSelClientId(e.target.value)}
                  style={{ colorScheme: "dark" }}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                >
                  <option value="">Select client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.company_name}</option>
                  ))}
                </select>
              </div>

              {/* Project */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Project</label>
                {addingProj ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={newProjName}
                      onChange={(e) => setNewProjName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddProject();
                        if (e.key === "Escape") { setAddingProj(false); setNewProjName(""); }
                      }}
                      placeholder="Project name"
                      className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                    />
                    <button
                      onClick={handleAddProject}
                      disabled={!newProjName.trim() || addProjPending}
                      className="px-3 rounded-lg bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors disabled:opacity-50"
                    >
                      {addProjPending ? "…" : "Add"}
                    </button>
                    <button
                      onClick={() => { setAddingProj(false); setNewProjName(""); }}
                      className="px-2 text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <select
                    value={selProjectId}
                    onChange={(e) => {
                      if (e.target.value === ADD_NEW) { setAddingProj(true); return; }
                      setSelProjectId(e.target.value);
                    }}
                    disabled={!selClientId}
                    style={{ colorScheme: "dark" }}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-40"
                  >
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                    {selClientId && <option value={ADD_NEW}>+ New project…</option>}
                  </select>
                )}
              </div>

              {/* Task / description */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Task</label>
                <input
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="What did you work on?"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                />
              </div>

              {/* Hours + Date */}
              <div className="flex gap-3">
                <div className="w-24 shrink-0">
                  <label className="block text-xs text-zinc-500 mb-1.5">Hours</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 tabular-nums"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-zinc-500 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={dateWorked}
                    onChange={(e) => setDateWorked(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                  />
                </div>
              </div>

              {/* Billable */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={billable}
                  onChange={(e) => setBillable(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-emerald-500"
                />
                <span className="text-xs text-zinc-400">Billable</span>
              </label>

              {modalError && <p className="text-xs text-red-400">{modalError}</p>}
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitPending || !selClientId}
                className="flex-1 rounded-lg bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:opacity-50"
              >
                {submitPending ? "Logging…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

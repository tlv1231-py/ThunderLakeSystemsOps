"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Aircraft = {
  icao: string;
  callsign: string;
  altFt: number | null;
  speedKt: number | null;
  track: number;
  typeCode: string;
};

type WeatherStation = {
  id: string;
  name: string;
  tempF: number | null;
  windKt: number | null;
  windDir: number | null;
  windGustKt: number | null;
  description: string | null;
  slpInHg: number | null;
};

type Incident = {
  id: string;
  callType: string;
  address: string;
  timestamp: string;
};

type MarineStation = {
  name: string;
  type: "tide_gauge" | "buoy";
  waterLevel?: number | null;
  waterTemp?: number | null;
  windSpeed?: number | null;
  windDir?: number | null;
  waveHeight?: number | null;
};

type Alert = {
  event: string;
  headline: string;
  expires: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function trackArrow(deg: number): string {
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"][idx];
}

function windCardinal(deg: number | null): string {
  if (deg == null) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

function fmtTime(iso: string): string {
  if (!iso) return "——:——";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York",
    });
  } catch { return "——:——"; }
}

function fmtExpires(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      hour12: false, timeZone: "America/New_York",
    });
  } catch { return ""; }
}

// ── Component ──────────────────────────────────────────────────────────────────

export function MonitorTerminal() {
  const termRef  = useRef<HTMLDivElement>(null);
  const [fs, setFs]        = useState(false);
  const [clock, setClock]  = useState("——:——:——");
  const [dateStr, setDate] = useState("");

  const [aircraft,  setAircraft]  = useState<Aircraft[]>([]);
  const [weather,   setWeather]   = useState<WeatherStation[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [marine,    setMarine]    = useState<MarineStation[]>([]);
  const [alerts,    setAlerts]    = useState<Alert[]>([]);

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/New_York" }));
      setDate(now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen();
    else termRef.current?.requestFullscreen();
  }

  // ── Fetchers ───────────────────────────────────────────────────────────────
  const fetchAircraft = useCallback(async () => {
    try {
      const { states = [] } = await fetch("/api/map/aircraft").then(r => r.json());
      const ac: Aircraft[] = (states as any[][])
        .filter(s => !s[8] && s[7] != null)
        .map(s => ({
          icao:     String(s[0]),
          callsign: (String(s[1]).trim() || String(s[0])).slice(0, 9),
          altFt:    Math.round(s[7] * 3.281 / 100) * 100,
          speedKt:  s[9] != null ? Math.round(s[9] * 1.944) : null,
          track:    s[10] ?? 0,
          typeCode: String(s[17] ?? "").slice(0, 4),
        }))
        .sort((a, b) => (b.altFt ?? 0) - (a.altFt ?? 0))
        .slice(0, 22);
      setAircraft(ac);
    } catch {}
  }, []);

  const fetchWeather = useCallback(async () => {
    try {
      const { stations = [] } = await fetch("/api/map/storm").then(r => r.json());
      setWeather(stations as WeatherStation[]);
    } catch {}
  }, []);

  const fetchDispatch = useCallback(async () => {
    try {
      const { incidents: raw = [] } = await fetch("/api/map/dispatch").then(r => r.json());
      setIncidents(raw as Incident[]);
    } catch {}
  }, []);

  const fetchMarine = useCallback(async () => {
    try {
      const { stations = [] } = await fetch("/api/map/marine").then(r => r.json());
      setMarine(stations as MarineStation[]);
    } catch {}
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const { features = [] } = await fetch("/api/map/alerts").then(r => r.json());
      setAlerts(
        (features as any[]).map(f => ({
          event:    f.properties?.event ?? "Alert",
          headline: f.properties?.headline ?? "",
          expires:  f.properties?.expires ?? "",
        }))
      );
    } catch {}
  }, []);

  // ── Polling ────────────────────────────────────────────────────────────────
  useEffect(() => { fetchAircraft(); const id = setInterval(fetchAircraft, 10_000); return () => clearInterval(id); }, [fetchAircraft]);
  useEffect(() => { fetchWeather();  const id = setInterval(fetchWeather,  300_000); return () => clearInterval(id); }, [fetchWeather]);
  useEffect(() => { fetchDispatch(); const id = setInterval(fetchDispatch,  15_000); return () => clearInterval(id); }, [fetchDispatch]);
  useEffect(() => { fetchMarine();   const id = setInterval(fetchMarine,   300_000); return () => clearInterval(id); }, [fetchMarine]);
  useEffect(() => { fetchAlerts();   const id = setInterval(fetchAlerts,   120_000); return () => clearInterval(id); }, [fetchAlerts]);

  // ── Render ─────────────────────────────────────────────────────────────────
  // -mx-4 -my-6 escapes the admin layout's px-4 py-6 wrapper; height 100dvh
  // fills the main pane exactly (wrapper + padding = 100dvh, no overflow).
  return (
    <div
      ref={termRef}
      className="-mx-4 -my-6 flex flex-col bg-black select-none"
      style={{ height: "100dvh", fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace" }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-zinc-900">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-600">TLS MONITOR</span>
          <span className="text-zinc-800">·</span>
          <span className="text-sm tabular-nums text-amber-500 tracking-tight">{clock}</span>
          <span className="text-zinc-800">·</span>
          <span className="text-[11px] text-zinc-600">{dateStr}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-zinc-800 tabular-nums">
            {aircraft.length}AC&nbsp;·&nbsp;{incidents.length}DISP&nbsp;·&nbsp;{alerts.length}ALRT
          </span>
          <button onClick={toggleFs} className="text-zinc-700 hover:text-zinc-400 transition-colors" title="Toggle fullscreen">
            {fs ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 grid overflow-hidden min-h-0" style={{ gridTemplateColumns: "2.2fr 1.5fr 1.3fr" }}>

        {/* ── COL 1: AIRCRAFT ──────────────────────────────────────────── */}
        <div className="border-r border-zinc-900 flex flex-col overflow-hidden min-h-0">
          <PaneHead title="AIRCRAFT" badge={aircraft.length} note="70nm · 41.05°N 73.54°W" />
          <div className="flex-1 overflow-y-auto min-h-0 px-3 pb-2">
            {aircraft.length === 0
              ? <Dim>scanning…</Dim>
              : (
                <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <Th>CALLSIGN</Th>
                      <Th>TYPE</Th>
                      <Th r>ALT</Th>
                      <Th r>KT</Th>
                      <Th c>↑</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {aircraft.map(a => (
                      <tr key={a.icao} className="border-t border-zinc-900/80 hover:bg-zinc-900/40 transition-colors">
                        <td className="py-[3px] pr-3 text-amber-400 font-semibold tabular-nums">{a.callsign}</td>
                        <td className="py-[3px] pr-3 text-zinc-600">{a.typeCode || "——"}</td>
                        <td className="py-[3px] pr-3 text-zinc-300 text-right tabular-nums">
                          {a.altFt != null
                            ? a.altFt >= 1000 ? `${(a.altFt / 1000).toFixed(0)}k` : String(a.altFt)
                            : "—"}
                        </td>
                        <td className="py-[3px] pr-3 text-zinc-500 text-right tabular-nums">{a.speedKt ?? "—"}</td>
                        <td className="py-[3px] text-zinc-600 text-center">{trackArrow(a.track)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </div>
        </div>

        {/* ── COL 2: WEATHER + DISPATCH ────────────────────────────────── */}
        <div className="border-r border-zinc-900 flex flex-col overflow-hidden min-h-0">

          {/* Surface observations */}
          <div className="shrink-0 border-b border-zinc-900">
            <PaneHead title="SURFACE OBS" badge={weather.length} />
            <div className="px-3 pb-3 overflow-hidden">
              {weather.length === 0
                ? <Dim>fetching…</Dim>
                : (
                  <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <Th>STN</Th>
                        <Th r>°F</Th>
                        <Th r>KT</Th>
                        <Th>DIR</Th>
                        <Th r>SLP</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {weather.slice(0, 5).map(s => (
                        <tr key={s.id} className="border-t border-zinc-900/80">
                          <td className="py-[3px] pr-2 text-zinc-500 whitespace-nowrap">{s.id}</td>
                          <td className="py-[3px] pr-2 text-amber-400 text-right tabular-nums">{s.tempF ?? "—"}</td>
                          <td className="py-[3px] pr-2 text-zinc-400 text-right tabular-nums whitespace-nowrap">
                            {s.windKt ?? "—"}
                            {s.windGustKt != null && <span className="text-zinc-700">G{s.windGustKt}</span>}
                          </td>
                          <td className="py-[3px] pr-2 text-zinc-600">{windCardinal(s.windDir)}</td>
                          <td className="py-[3px] text-zinc-700 text-right tabular-nums">{s.slpInHg ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>
          </div>

          {/* Dispatch */}
          <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
            <PaneHead
              title="DISPATCH"
              badge={incidents.length}
              note={incidents.length === 0 ? "monitoring" : undefined}
            />
            <div className="flex-1 overflow-y-auto min-h-0 px-3 pb-3 space-y-2">
              {incidents.length === 0
                ? <Dim>no active incidents</Dim>
                : incidents.map(inc => (
                    <div key={inc.id} className="border-t border-zinc-900/80 pt-1.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-zinc-700 tabular-nums text-[10px] shrink-0">{fmtTime(inc.timestamp)}</span>
                        <span className="text-red-500 text-[11px] font-bold uppercase tracking-wide truncate">{inc.callType}</span>
                      </div>
                      <p className="text-zinc-600 text-[10px] pl-9 truncate">{inc.address}</p>
                    </div>
                  ))
              }
            </div>
          </div>
        </div>

        {/* ── COL 3: ALERTS + MARINE ───────────────────────────────────── */}
        <div className="flex flex-col overflow-hidden min-h-0">

          {/* Alerts */}
          <div className="shrink-0 border-b border-zinc-900">
            <PaneHead
              title="NWS ALERTS"
              badge={alerts.length}
              note={alerts.length === 0 ? "clear" : undefined}
              warn={alerts.length > 0}
            />
            <div className="px-3 pb-3 space-y-2">
              {alerts.length === 0
                ? <Dim>no active alerts · CT</Dim>
                : alerts.slice(0, 3).map((a, i) => (
                    <div key={i} className="border-t border-zinc-900/80 pt-1.5">
                      <p className="text-amber-500 text-[11px] font-bold uppercase tracking-wide">{a.event}</p>
                      <p className="text-zinc-600 text-[10px] mt-0.5 leading-snug line-clamp-2">{a.headline}</p>
                      {a.expires && (
                        <p className="text-zinc-800 text-[10px] mt-0.5">until {fmtExpires(a.expires)}</p>
                      )}
                    </div>
                  ))
              }
            </div>
          </div>

          {/* Marine */}
          <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
            <PaneHead title="MARINE" badge={marine.length} />
            <div className="flex-1 overflow-y-auto min-h-0 px-3 pb-3 space-y-1.5">
              {marine.length === 0
                ? <Dim>fetching…</Dim>
                : marine.slice(0, 9).map((s, i) => (
                    <div key={i} className="border-t border-zinc-900/80 pt-1.5">
                      <p className="text-zinc-700 text-[10px] truncate">{s.name}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {s.type === "tide_gauge" && s.waterLevel != null && (
                          <span className="text-amber-500 text-xs tabular-nums">{s.waterLevel}ft</span>
                        )}
                        {s.waveHeight != null && (
                          <span className="text-zinc-500 text-[11px] tabular-nums">{s.waveHeight}ft∼</span>
                        )}
                        {s.waterTemp != null && (
                          <span className="text-zinc-600 text-[11px] tabular-nums">{s.waterTemp}°F</span>
                        )}
                        {s.windSpeed != null && (
                          <span className="text-zinc-700 text-[10px] tabular-nums">{Math.round(s.windSpeed)}kt {windCardinal(s.windDir ?? null)}</span>
                        )}
                      </div>
                    </div>
                  ))
              }
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-zinc-900 px-4 py-1 flex items-center justify-between">
        <span className="text-[9px] text-zinc-800 tracking-widest">
          AC·10s&nbsp;&nbsp;DISP·15s&nbsp;&nbsp;ALRT·2m&nbsp;&nbsp;WX·5m&nbsp;&nbsp;MARINE·5m
        </span>
        <span className="text-[9px] text-zinc-800 tracking-widest">THUNDER LAKE SYSTEMS</span>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PaneHead({
  title, badge, note, warn = false,
}: {
  title: string; badge?: number; note?: string; warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold tracking-[0.15em] ${warn ? "text-amber-600" : "text-zinc-700"}`}>
          {title}
        </span>
        {badge !== undefined && badge > 0 && (
          <span className={`text-[10px] tabular-nums ${warn ? "text-amber-700" : "text-zinc-800"}`}>{badge}</span>
        )}
      </div>
      {note && <span className="text-[9px] text-zinc-800 tracking-widest">{note.toUpperCase()}</span>}
    </div>
  );
}

function Th({ children, r, c }: { children: React.ReactNode; r?: boolean; c?: boolean }) {
  return (
    <td className={`pb-1 pr-2 text-[10px] text-zinc-800 ${r ? "text-right" : c ? "text-center" : ""}`}>
      {children}
    </td>
  );
}

function Dim({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-zinc-800 py-1">{children}</p>;
}

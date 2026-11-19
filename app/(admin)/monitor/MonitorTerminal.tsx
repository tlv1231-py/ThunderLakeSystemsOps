"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type LogLine = {
  id:    number;
  ts:    string;
  cat:   string;
  color: string;
  text:  string;
};

// ── Color palette ──────────────────────────────────────────────────────────────

const C = {
  acft:    "#fbbf24",   // amber-400
  wx:      "#38bdf8",   // sky-400
  metar:   "#67e8f9",   // cyan-300
  disp:    "#f87171",   // red-400
  alert:   "#fb923c",   // orange-400
  marine:  "#2dd4bf",   // teal-400
  traffic: "#facc15",   // yellow-400
  outage:  "#fde68a",   // amber-200
  sys:     "#52525b",   // zinc-600
};

// ── Incrementing ID counter (module-level is fine — one instance) ──────────────

let _uid = 0;
const uid = () => ++_uid;

// ── Helpers ────────────────────────────────────────────────────────────────────

function etNow(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: "America/New_York",
  });
}

function trackArrow(deg: number): string {
  return ["↑","↗","→","↘","↓","↙","←","↖"][Math.round(((deg%360)+360)%360/45)%8];
}

function windCard(deg: number | null): string {
  if (deg == null) return "—";
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(((deg%360)+360)%360/45)%8];
}

function pad(s: string | number, n: number): string {
  return String(s).padEnd(n);
}

function mk(cat: string, color: string, text: string): LogLine {
  return { id: uid(), ts: etNow(), cat, color, text };
}

// ── Line builders ─────────────────────────────────────────────────────────────

function acftLines(states: any[][]): LogLine[] {
  return states
    .filter(s => !s[8] && s[7] != null)
    .map(s => {
      const cs   = (String(s[1]).trim() || String(s[0])).slice(0, 9);
      const type = String(s[17] ?? "").slice(0, 4) || "????";
      const altFt = Math.round(s[7] * 3.281 / 100) * 100;
      const alt   = altFt >= 18000
        ? `FL${String(Math.round(altFt/100)).padStart(3,"0")}`
        : altFt >= 1000 ? `${(altFt/1000).toFixed(1)}k` : `${altFt}ft`;
      const spd  = s[9] != null ? `${Math.round(s[9]*1.944)}kt` : "—";
      const arr  = trackArrow(s[10] ?? 0);
      return mk("ACFT", C.acft,
        `${pad(cs,10)} ${pad(type,5)} ${alt.padStart(6)}  ${spd.padStart(5)}  ${arr}`);
    })
    .sort((a,b)=>{
      const alt = (t:string)=>{
        const fl=t.match(/FL(\d+)/); if(fl) return +fl[1]*100;
        const k=t.match(/([\d.]+)k/); if(k) return +k[1]*1000;
        const ft=t.match(/(\d+)ft/); return ft?+ft[1]:0;
      };
      return alt(b.text)-alt(a.text);
    })
    .slice(0, 30);
}

function wxLines(stations: any[]): LogLine[] {
  return stations.filter(Boolean).map(s => {
    const wind = s.windKt!=null
      ? `${windCard(s.windDir??null)}${s.windKt}kt${s.windGustKt?` G${s.windGustKt}`:""}`
      : "—";
    const slp  = s.slpInHg!=null ? ` ${s.slpInHg}"` : "";
    const desc = s.description ? `  ${s.description.toUpperCase()}` : "";
    return mk("WX", C.wx,
      `${pad(s.id??"???",5)}  ${(s.tempF!=null?`${s.tempF}°F`:"  —").padStart(5)}  ${pad(wind,12)}${slp}${desc}`
    );
  });
}

function metarLines(stations: any[]): LogLine[] {
  return stations.filter(Boolean).map(s => {
    const tempF = s.temp_c!=null ? `${Math.round(s.temp_c*9/5+32)}°F` : "  —";
    const ws    = s.wind_speed_kt??0;
    const wd    = s.wind_dir_degrees??null;
    const wg    = s.wind_gust_kt;
    const wind  = wd!=null ? `${windCard(wd)}${ws}kt${wg?` G${wg}`:""}` : "—";
    const cat   = s.flight_category ?? "";
    const vis   = s.visibility_statute_mi!=null ? ` ${s.visibility_statute_mi}SM` : "";
    const ceil  = (s.sky_condition??[]).find((c:any)=>["OVC","BKN","OVC","FEW"].includes(c.sky_cover));
    const ceilStr = ceil ? ` ${ceil.sky_cover}${String(ceil.cloud_base_ft_agl??0).padStart(5,"0")}` : "";
    return mk("METAR", C.metar,
      `${pad(s.station_id??"???",5)}  ${tempF.padStart(5)}  ${pad(wind,12)}  ${pad(cat,5)}${vis}${ceilStr}`
    );
  });
}

function dispatchLines(incidents: any[]): LogLine[] {
  return incidents.map(inc =>
    mk("DISP", C.disp,
      `${pad(String(inc.callType??"UNKNOWN").toUpperCase(),22)}  ${String(inc.address??"").toUpperCase()}`)
  );
}

function alertLines(features: any[]): LogLine[] {
  return features.map(f => {
    const p    = f.properties??{};
    const event = String(p.event??"ALERT").toUpperCase();
    const exp  = p.expires
      ? `  until ${new Date(p.expires).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"America/New_York"})}`
      : "";
    const area = p.areaDesc ? `  [${String(p.areaDesc).slice(0,30)}]` : "";
    return mk("ALERT", C.alert, `${event}${area}${exp}`);
  });
}

function marineLines(stations: any[]): LogLine[] {
  return stations.filter(Boolean).map(s => {
    const name  = String(s.name??"").toUpperCase().slice(0,22);
    const type  = s.type==="tide_gauge" ? "TIDE" : "BUOY";
    const level = s.waterLevel!=null ? `${s.waterLevel>0?"+":""}${s.waterLevel}ft` : "";
    const wave  = s.waveHeight!=null  ? `${s.waveHeight}ft∼` : "";
    const wtemp = s.waterTemp!=null   ? `${s.waterTemp}°F` : "";
    const wind  = s.windSpeed!=null   ? `${Math.round(s.windSpeed)}kt ${windCard(s.windDir??null)}` : "";
    const parts = [type,level,wave,wtemp,wind].filter(Boolean).join("  ");
    return mk("MARINE", C.marine, `${pad(name,24)}  ${parts}`);
  });
}

function trafficLines(events: any[]): LogLine[] {
  return events.slice(0,20).map(e => {
    const sub  = String((e.subtype||e.type)??"event").toUpperCase().slice(0,18);
    const road = String(e.road??"").toUpperCase().slice(0,10);
    const dir  = String(e.direction??"").toUpperCase().slice(0,2);
    const desc = String(e.description??"").slice(0,40);
    return mk("TRAF", C.traffic,
      `${pad(sub,20)}  ${pad(road,12)}  ${dir}  ${desc}`.trimEnd());
  });
}

function outageLines(towns: any[]): LogLine[] {
  return towns
    .filter(t=>t.custAffected>0)
    .map(t =>
      mk("OUTAGE", C.outage,
        `${pad(String(t.town??"").toUpperCase(),18)}  ${String(t.custAffected).padStart(5)} cust  ${t.pct}%`)
    );
}

function sysLine(msg: string): LogLine {
  return mk("SYS", C.sys, msg);
}

// ── Component ──────────────────────────────────────────────────────────────────

const MAX_LINES = 800;

export function MonitorTerminal() {
  const termRef  = useRef<HTMLDivElement>(null);
  const feedRef  = useRef<HTMLDivElement>(null);
  const queueRef = useRef<LogLine[]>([]);
  const lastLineTs = useRef<number>(Date.now());

  const [lines,   setLines]   = useState<LogLine[]>([]);
  const [fs,      setFs]      = useState(false);
  const [clock,   setClock]   = useState("——:——:——");
  const [dateStr, setDate]    = useState("");
  const [counts,  setCounts]  = useState({ ac: 0, disp: 0, alrt: 0 });

  const enqueue = useCallback((incoming: LogLine[]) => {
    queueRef.current.push(...incoming);
  }, []);

  // ── Drip interval — 400ms/line normal; burst when queue backs up ───────────
  useEffect(() => {
    const id = setInterval(() => {
      const q = queueRef.current;
      if (q.length === 0) return;
      const batch = q.length > 20 ? Math.min(4, q.length) : 1;
      const next  = q.splice(0, batch);
      lastLineTs.current = Date.now();
      setLines(prev => {
        const updated = [...prev, ...next];
        return updated.length > MAX_LINES
          ? updated.slice(updated.length - MAX_LINES)
          : updated;
      });
    }, 400);
    return () => clearInterval(id);
  }, []);

  // ── Heartbeat — keeps the terminal alive between data bursts ──────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastLineTs.current > 18_000) {
        enqueue([sysLine(`━━ ${etNow()} ── MONITORING ── ${counts.ac} ACFT ACTIVE ━━`)]);
      }
    }, 20_000);
    return () => clearInterval(id);
  }, [enqueue, counts.ac]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);

  // ── Clock ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString("en-US", {
        hour:"2-digit", minute:"2-digit", second:"2-digit",
        hour12:false, timeZone:"America/New_York",
      }));
      setDate(now.toLocaleDateString("en-US", {
        weekday:"short", month:"short", day:"numeric", year:"numeric",
        timeZone:"America/New_York",
      }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen();
    else termRef.current?.requestFullscreen();
  }

  // ── Boot sequence ─────────────────────────────────────────────────────────
  useEffect(() => {
    enqueue([
      sysLine("TLS MONITOR v2.0 — LIVE DATA TERMINAL"),
      sysLine("REGION: CONNECTICUT · 41.05°N 73.54°W · 70nm"),
      sysLine("FEEDS: ACFT  METAR  WX  DISPATCH  ALERTS  MARINE  TRAFFIC  OUTAGES"),
      sysLine("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"),
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchAircraft = useCallback(async () => {
    try {
      const { states = [] } = await fetch("/api/map/aircraft").then(r=>r.json());
      const ls = acftLines(states as any[][]);
      setCounts(c => ({ ...c, ac: ls.length }));
      if (ls.length > 0) enqueue(ls);
    } catch {}
  }, [enqueue]);

  const fetchWx = useCallback(async () => {
    try {
      const { stations = [] } = await fetch("/api/map/storm").then(r=>r.json());
      const ls = wxLines(stations);
      if (ls.length > 0) enqueue(ls);
    } catch {}
  }, [enqueue]);

  const fetchMetar = useCallback(async () => {
    try {
      const { stations = [] } = await fetch("/api/map/metar").then(r=>r.json());
      const ls = metarLines(stations);
      if (ls.length > 0) enqueue(ls);
    } catch {}
  }, [enqueue]);

  const fetchDispatch = useCallback(async () => {
    try {
      const { incidents: raw = [] } = await fetch("/api/map/dispatch").then(r=>r.json());
      const ls = dispatchLines(raw);
      setCounts(c => ({ ...c, disp: ls.length }));
      if (ls.length > 0) enqueue(ls);
    } catch {}
  }, [enqueue]);

  const fetchAlerts = useCallback(async () => {
    try {
      const { features = [] } = await fetch("/api/map/alerts").then(r=>r.json());
      const ls = alertLines(features);
      setCounts(c => ({ ...c, alrt: ls.length }));
      if (ls.length > 0) enqueue(ls);
      else enqueue([sysLine("ALERTS CLEAR · NWS CONNECTICUT")]);
    } catch {}
  }, [enqueue]);

  const fetchMarine = useCallback(async () => {
    try {
      const { stations = [] } = await fetch("/api/map/marine").then(r=>r.json());
      const ls = marineLines(stations);
      if (ls.length > 0) enqueue(ls);
    } catch {}
  }, [enqueue]);

  const fetchTraffic = useCallback(async () => {
    try {
      const { events = [] } = await fetch("/api/map/traffic").then(r=>r.json());
      const ls = trafficLines(events);
      if (ls.length > 0) enqueue(ls);
    } catch {}
  }, [enqueue]);

  const fetchOutages = useCallback(async () => {
    try {
      const { towns = [] } = await fetch("/api/map/outages").then(r=>r.json());
      const ls = outageLines(towns);
      if (ls.length > 0) enqueue(ls);
    } catch {}
  }, [enqueue]);

  // ── Polling intervals ─────────────────────────────────────────────────────
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => { fetchAircraft(); const id=setInterval(fetchAircraft, 10_000); return ()=>clearInterval(id); }, [fetchAircraft]);
  useEffect(() => { fetchWx();      const id=setInterval(fetchWx,       300_000); return ()=>clearInterval(id); }, [fetchWx]);
  useEffect(() => { fetchMetar();   const id=setInterval(fetchMetar,    300_000); return ()=>clearInterval(id); }, [fetchMetar]);
  useEffect(() => { fetchDispatch();const id=setInterval(fetchDispatch,  15_000); return ()=>clearInterval(id); }, [fetchDispatch]);
  useEffect(() => { fetchAlerts();  const id=setInterval(fetchAlerts,   120_000); return ()=>clearInterval(id); }, [fetchAlerts]);
  useEffect(() => { fetchMarine();  const id=setInterval(fetchMarine,   300_000); return ()=>clearInterval(id); }, [fetchMarine]);
  useEffect(() => { fetchTraffic(); const id=setInterval(fetchTraffic,  120_000); return ()=>clearInterval(id); }, [fetchTraffic]);
  useEffect(() => { fetchOutages(); const id=setInterval(fetchOutages,  300_000); return ()=>clearInterval(id); }, [fetchOutages]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={termRef}
      className="-mx-4 -my-6 flex flex-col bg-black select-none overflow-hidden"
      style={{ height: "100dvh", fontFamily: "ui-monospace,'Cascadia Code','Fira Code',monospace" }}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-zinc-900">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-700">TLS MONITOR</span>
          <span className="text-zinc-800">·</span>
          <span className="text-sm tabular-nums text-amber-500 tracking-tight">{clock}</span>
          <span className="text-zinc-800">·</span>
          <span className="text-[11px] text-zinc-600">{dateStr}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-zinc-800 tabular-nums">
            {counts.ac}&nbsp;AC&nbsp;·&nbsp;{counts.disp}&nbsp;DISP&nbsp;·&nbsp;{counts.alrt}&nbsp;ALRT
          </span>
          <button
            onClick={toggleFs}
            className="text-zinc-700 hover:text-zinc-400 transition-colors"
            title="Toggle fullscreen"
          >
            {fs ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto min-h-0 px-4 py-2"
        style={{ scrollbarWidth: "none" }}
      >
        {lines.map(line => (
          <div
            key={line.id}
            className="flex items-baseline leading-[1.65] text-[12px]"
          >
            <span
              className="shrink-0 text-zinc-800 tabular-nums"
              style={{ width: "9ch" }}
            >
              {line.ts}
            </span>
            <span
              className="shrink-0 font-semibold tracking-wider"
              style={{ width: "8ch", color: line.color }}
            >
              {line.cat}
            </span>
            <span className="text-zinc-400 whitespace-pre overflow-hidden text-ellipsis">
              {line.text}
            </span>
          </div>
        ))}
        {/* Blinking cursor at end of feed */}
        <div className="flex items-baseline leading-[1.65] text-[12px]">
          <span className="shrink-0" style={{ width: "17ch" }} />
          <span
            className="text-zinc-600"
            style={{ animation: "blink 1.1s step-end infinite" }}
          >
            ▋
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-zinc-900 px-4 py-1 flex items-center justify-between">
        <span className="text-[9px] text-zinc-800 tracking-widest">
          AC·10s · DISP·15s · ALRT·2m · TRAF·2m · WX·5m · MARINE·5m · OUTAGE·5m
        </span>
        <span className="text-[9px] text-zinc-800 tracking-widest">THUNDER LAKE SYSTEMS</span>
      </div>

      <style>{`
        @keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0 } }
        div::-webkit-scrollbar { display:none }
      `}</style>
    </div>
  );
}

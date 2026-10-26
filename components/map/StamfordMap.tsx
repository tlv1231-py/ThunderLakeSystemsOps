"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type LayerKey = "aircraft" | "radar" | "iss" | "alerts" | "lightning" | "transit" | "rail" | "services" | "traffic" | "dispatch" | "buildings" | "marine" | "vessels" | "metar" | "storm" | "outages" | "sector";
type BaseKey  = "satellite" | "hybrid" | "dark";
interface LogEntry { icon: string; text: string; color: string; loggedAt: number; }
interface OngoingItem {
  id: string; evtType: string; detail: string; color: string;
  startMs: number; serverNow?: number; fetchTime?: number;
}

interface TermEntry    { ts: number; cat: string; text: string; color: string; }
interface NewsItem    { ts: number; pub: string; headline: string; }
interface HourlyFc   { hour: number; temp: number; code: number; precip: number; }
interface DailyFc    { date: string; max: number; min: number; code: number; precip: number; }
interface SsTrackInfo { type: string; id: string; detail: string; }

interface WeatherNow {
  temp: number; wind_speed: number; wind_dir: number;
  humidity: number; cloud_cover: number; precipitation: number; code: number;
}
interface ISSPos {
  latitude: number; longitude: number; altitude: number;
  velocity: number; visibility: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STAMFORD_BOUNDS: [[number, number], [number, number]] = [[40.990, -73.657], [41.125, -73.432]];
const STAMFORD = { lat: 41.0534, lng: -73.5387 };

const BASE_LAYERS: Record<BaseKey, { label: string; url: string; subdomains?: string; minNativeZoom: number; maxNativeZoom: number }> = {
  satellite: { label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", minNativeZoom: 2, maxNativeZoom: 19 },
  hybrid:    { label: "Hybrid",    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", minNativeZoom: 2, maxNativeZoom: 19 },
  dark:      { label: "Dark",      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", minNativeZoom: 0, maxNativeZoom: 16 },
};

const WMO: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 51: "Drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 80: "Showers", 95: "Thunderstorm",
};

interface LayerMeta { label: string; color: string; section: "overhead" | "atmospheric" | "city" }

const LAYER_META: Record<LayerKey, LayerMeta> = {
  aircraft:  { label: "Aircraft",   color: "#a855f7", section: "overhead"    },
  iss:       { label: "ISS",        color: "#a78bfa", section: "overhead"    },
  radar:     { label: "Radar",      color: "#39d97a", section: "atmospheric" },
  lightning: { label: "Lightning",  color: "#ffe066", section: "atmospheric" },
  alerts:    { label: "NWS Alerts", color: "#f59e0b", section: "atmospheric" },
  transit:   { label: "Transit",    color: "#60a5fa", section: "city"        },
  rail:      { label: "Metro-North", color: "#4488ff", section: "city"        },
  services:  { label: "Services",   color: "#4ade80", section: "city"        },
  traffic:   { label: "Traffic",    color: "#f59e0b", section: "city"        },
  dispatch:  { label: "Dispatch",   color: "#ff4466", section: "city"        },
  buildings: { label: "City Lights", color: "#fbbf24", section: "city"       },
  marine:    { label: "Maritime",    color: "#06b6d4", section: "city"       },
  vessels:   { label: "AIS Vessels", color: "#0ea5e9", section: "city"       },
  metar:     { label: "METAR",       color: "#22c55e", section: "atmospheric" },
  storm:     { label: "Storm Obs",   color: "#38bdf8", section: "atmospheric" },
  outages:   { label: "Power Outages", color: "#facc15", section: "city" },
  sector:    { label: "Sectors",      color: "#22d3ee", section: "overhead" },
};

const SECTIONS: { key: "overhead" | "atmospheric" | "city"; label: string }[] = [
  { key: "overhead",    label: "Overhead"    },
  { key: "atmospheric", label: "Atmospheric" },
  { key: "city",        label: "City Intel"  },
];

type FeedKey = "weather" | "aircraft" | "iss" | "alerts" | "lightning" | "transit" | "rail" | "services" | "traffic" | "dispatch" | "marine" | "vessels" | "metar" | "storm" | "outages" | "radar";

const FEED_META: Record<FeedKey, { icon: string; short: string; label: string; color: string; maxAge: number }> = {
  weather:   { icon: "⛅", short: "WX",    label: "Weather",           color: "#60a5fa", maxAge: 900   },
  aircraft:  { icon: "✈",  short: "AIR",   label: "Aircraft · ADS-B",  color: "#a855f7", maxAge: 90    },
  iss:       { icon: "🛸", short: "ISS",   label: "ISS Position",      color: "#a78bfa", maxAge: 90    },
  alerts:    { icon: "⚠",  short: "ALRT",  label: "NWS Alerts",        color: "#f59e0b", maxAge: 600   },
  lightning: { icon: "⚡", short: "LTNG",  label: "Lightning",         color: "#ffe066", maxAge: 600   },
  transit:   { icon: "🚌", short: "BUS",   label: "Bus · CT Transit",  color: "#60a5fa", maxAge: 90    },
  rail:      { icon: "🚆", short: "RAIL",  label: "Metro-North Rail",  color: "#4488ff", maxAge: 90    },
  services:  { icon: "📍", short: "SVC",   label: "City Services",     color: "#4ade80", maxAge: 86400 },
  traffic:   { icon: "🚦", short: "TFC",   label: "Traffic Flow",      color: "#f59e0b", maxAge: 600   },
  dispatch:  { icon: "📻", short: "DISP",  label: "Dispatch Radio",    color: "#ff4466", maxAge: 180   },
  marine:    { icon: "🌊", short: "MRNE",  label: "Marine · NDBC",     color: "#06b6d4", maxAge: 900   },
  vessels:   { icon: "⛵", short: "AIS",   label: "Vessels · AIS",     color: "#0ea5e9", maxAge: 90    },
  metar:     { icon: "🛫", short: "METAR", label: "Aviation WX",       color: "#22c55e", maxAge: 900   },
  storm:     { icon: "🌩", short: "STRM",  label: "Storm Reports",     color: "#38bdf8", maxAge: 900   },
  outages:   { icon: "💡", short: "PWR",   label: "Power Outages",     color: "#facc15", maxAge: 900   },
  radar:     { icon: "🌧", short: "RADAR", label: "NEXRAD Radar",      color: "#38bdf8", maxAge: 600   },
};

const FEED_LAYER: Partial<Record<FeedKey, LayerKey>> = {
  aircraft: "aircraft", iss: "iss", alerts: "alerts", lightning: "lightning",
  transit: "transit", rail: "rail", services: "services", traffic: "traffic",
  dispatch: "dispatch", marine: "marine", vessels: "vessels",
  metar: "metar", storm: "storm", outages: "outages", radar: "radar",
};

const FEED_ORDER: FeedKey[] = ["aircraft", "iss", "alerts", "lightning", "radar", "metar", "storm", "weather", "transit", "rail", "traffic", "dispatch", "marine", "vessels", "outages", "services"];

// CT town centroids for Eversource service territory (hardcoded — doesn't change)
const CT_TOWNS: Record<string, [number, number]> = {
  ASHFORD:[41.869,-72.136],BARKHAMSTED:[41.926,-72.944],BERLIN:[41.621,-72.750],
  BETHLEHEM:[41.639,-73.199],BLOOMFIELD:[41.815,-72.719],BOLTON:[41.765,-72.435],
  BOZRAH:[41.553,-72.155],BRIDGEPORT:[41.187,-73.195],BRISTOL:[41.671,-72.950],
  BROOKFIELD:[41.462,-73.400],BROOKLYN:[41.784,-71.946],BURLINGTON:[41.760,-72.963],
  CANTON:[41.859,-72.898],CHAPLIN:[41.797,-72.136],CHESHIRE:[41.499,-72.900],
  CLINTON:[41.277,-72.528],COLCHESTER:[41.574,-72.332],COLUMBIA:[41.701,-72.301],
  CORNWALL:[41.839,-73.329],COVENTRY:[41.784,-72.351],DANBURY:[41.395,-73.454],
  DARIEN:[41.078,-73.469],DEEP_RIVER:[41.377,-72.434],DERBY:[41.327,-73.088],
  DURHAM:[41.489,-72.681],EAST_HADDAM:[41.457,-72.461],EAST_HAMPTON:[41.576,-72.503],
  EAST_HARTFORD:[41.782,-72.611],EAST_HAVEN:[41.276,-72.868],EAST_WINDSOR:[41.915,-72.612],
  EASTFORD:[41.897,-72.090],EASTON:[41.254,-73.296],ELLINGTON:[41.905,-72.452],
  ENFIELD:[41.976,-72.590],ESSEX:[41.349,-72.397],FAIRFIELD:[41.141,-73.264],
  FARMINGTON:[41.718,-72.832],FRANKLIN:[41.618,-72.166],GLASTONBURY:[41.702,-72.608],
  GRANBY:[41.961,-72.825],GREENWICH:[41.026,-73.628],GROTON:[41.350,-72.078],
  GUILFORD:[41.289,-72.682],HADDAM:[41.455,-72.501],HAMDEN:[41.396,-72.896],
  HARTFORD:[41.766,-72.673],HARWINTON:[41.755,-73.056],HEBRON:[41.663,-72.366],
  KENT:[41.728,-73.478],KILLINGLY:[41.833,-71.873],KILLINGWORTH:[41.366,-72.534],
  LEBANON:[41.637,-72.216],LEDYARD:[41.441,-72.004],LISBON:[41.589,-72.011],
  LITCHFIELD:[41.748,-73.188],LYME:[41.376,-72.363],MADISON:[41.279,-72.598],
  MANCHESTER:[41.776,-72.521],MANSFIELD:[41.777,-72.233],MARLBOROUGH:[41.633,-72.458],
  MERIDEN:[41.538,-72.807],MIDDLEBURY:[41.530,-73.113],MIDDLEFIELD:[41.512,-72.689],
  MIDDLETOWN:[41.562,-72.650],MILFORD:[41.223,-73.057],MONROE:[41.332,-73.210],
  MONTVILLE:[41.471,-72.150],MORRIS:[41.685,-73.191],NAUGATUCK:[41.486,-73.051],
  NEW_BRITAIN:[41.661,-72.779],NEW_CANAAN:[41.147,-73.495],NEW_FAIRFIELD:[41.468,-73.482],
  NEW_HARTFORD:[41.877,-72.976],NEW_HAVEN:[41.308,-72.928],NEW_MILFORD:[41.577,-73.408],
  NEWINGTON:[41.696,-72.723],NEWTOWN:[41.414,-73.309],NORFOLK:[41.993,-73.199],
  NORTH_BRANFORD:[41.331,-72.774],NORTH_CANAAN:[42.014,-73.333],NORTH_HAVEN:[41.392,-72.859],
  NORTH_STONINGTON:[41.434,-71.895],NORWICH:[41.524,-72.076],NORWALK:[41.118,-73.408],
  OLD_LYME:[41.315,-72.334],OLD_SAYBROOK:[41.296,-72.375],ORANGE:[41.279,-73.033],
  OXFORD:[41.433,-73.116],PLAINFIELD:[41.679,-71.917],PLAINVILLE:[41.673,-72.858],
  PLYMOUTH:[41.654,-73.030],POMFRET:[41.889,-71.965],PORTLAND:[41.573,-72.638],
  PROSPECT:[41.501,-72.978],PUTNAM:[41.907,-71.908],REDDING:[41.303,-73.387],
  RIDGEFIELD:[41.281,-73.498],ROCKY_HILL:[41.665,-72.650],ROXBURY:[41.553,-73.298],
  SALEM:[41.490,-72.270],SALISBURY:[41.987,-73.419],SCOTLAND:[41.700,-72.082],
  SEYMOUR:[41.395,-73.071],SHARON:[41.876,-73.480],SHELTON:[41.317,-73.088],
  SHERMAN:[41.582,-73.480],SIMSBURY:[41.876,-72.808],SOMERS:[41.983,-72.451],
  SOUTHBURY:[41.477,-73.213],SOUTHINGTON:[41.586,-72.878],SPRAGUE:[41.621,-72.056],
  STAFFORD:[41.978,-72.298],STAMFORD:[41.053,-73.539],STERLING:[41.708,-71.832],
  STONINGTON:[41.342,-71.920],STRATFORD:[41.184,-73.133],SUFFIELD:[41.982,-72.652],
  THOMASTON:[41.672,-73.071],THOMPSON:[41.971,-71.869],TOLLAND:[41.870,-72.366],
  TORRINGTON:[41.801,-73.122],TRUMBULL:[41.243,-73.201],UNION:[42.006,-72.156],
  VERNON:[41.834,-72.450],VOLUNTOWN:[41.573,-71.853],WALLINGFORD:[41.457,-72.823],
  WARREN:[41.741,-73.387],WASHINGTON:[41.630,-73.311],WATERBURY:[41.558,-73.052],
  WATERFORD:[41.360,-72.124],WATERTOWN:[41.601,-73.115],WESTBROOK:[41.288,-72.447],
  WEST_HARTFORD:[41.762,-72.742],WEST_HAVEN:[41.271,-72.947],WESTON:[41.200,-73.379],
  WESTPORT:[41.142,-73.358],WETHERSFIELD:[41.714,-72.652],WILLINGTON:[41.876,-72.266],
  WILTON:[41.195,-73.437],WINCHESTER:[41.929,-73.060],WINDHAM:[41.702,-72.156],
  WINDSOR:[41.852,-72.643],WINDSOR_LOCKS:[41.929,-72.627],WOLCOTT:[41.601,-72.980],
  WOODBRIDGE:[41.354,-73.003],WOODBURY:[41.549,-73.208],WOODSTOCK:[41.961,-71.973],
};
const outageColor = (pct: number) =>
  pct >= 20 ? "#dc2626" : pct >= 5 ? "#ef4444" : pct >= 1 ? "#f97316" : "#facc15";
const outageRadius = (n: number) =>
  n >= 200 ? 18 : n >= 50 ? 14 : n >= 10 ? 10 : 7;

const SERVICE_CFG: Record<string, { color: string; symbol: string }> = {
  fire_station: { color: "#ff4466", symbol: "▲" },
  hospital:     { color: "#22c55e", symbol: "+" },
  police:       { color: "#60a5fa", symbol: "★" },
  urgent_care:  { color: "#f59e0b", symbol: "+" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const degToCompass = (d: number) =>
  ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(d / 22.5) % 16];
const mpsToKnots = (v: number) => Math.round(v * 1.944);
const metersToFt = (m: number) => Math.round(m * 3.281);
const fmtHMS = (d: Date) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

function aircraftSVG(heading: number) {
  return `<div style="transform:rotate(${heading}deg);width:22px;height:22px;filter:drop-shadow(0 0 5px #a855f7aa)">
    <svg viewBox="0 0 32 32" fill="#a855f7" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 2C16 2 19 10 19 14L28 20L27 23L19 18L18 28L21 30L16 32L11 30L14 28L13 18L5 23L4 20L13 14C13 10 16 2 16 2Z"/>
    </svg>
  </div>`;
}
function issSVG() {
  return `<div style="width:26px;height:26px;filter:drop-shadow(0 0 6px #a78bfa)">
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <rect x="13" y="12" width="6" height="8" fill="#a78bfa" rx="1"/>
      <rect x="2" y="14" width="10" height="4" fill="#a78bfa" rx="1" opacity="0.7"/>
      <rect x="20" y="14" width="10" height="4" fill="#a78bfa" rx="1" opacity="0.7"/>
    </svg>
  </div>`;
}
function transitSVG(routeTag: string, heading: number) {
  const label = String(routeTag).slice(0, 3);
  return `<div style="width:26px;height:26px;position:relative;filter:drop-shadow(0 0 5px #60a5fa55)">
    <svg viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
      <circle cx="13" cy="13" r="11" fill="#0f1f3a" stroke="#60a5fa" stroke-width="1.5"/>
      <text x="13" y="17" text-anchor="middle" fill="#93c5fd" font-family="monospace" font-size="7" font-weight="700">${label}</text>
      <polygon points="13,2 11,6 15,6" fill="#60a5fa" transform="rotate(${heading},13,13)"/>
    </svg>
  </div>`;
}
function serviceSVG(amenity: string) {
  const s = SERVICE_CFG[amenity] ?? { color: "#5a7090", symbol: "•" };
  return `<div style="width:20px;height:20px;border-radius:${amenity==="fire_station"?"3px":"50%"};
    background:${s.color}18;border:1.5px solid ${s.color};
    display:flex;align-items:center;justify-content:center;
    font-size:9px;color:${s.color};font-weight:900;line-height:1;
    filter:drop-shadow(0 0 5px ${s.color}66)">${s.symbol}</div>`;
}
function trafficSVG(color = "#f59e0b") {
  return `<div style="width:15px;height:15px;transform:rotate(45deg);
    background:${color}15;border:2px solid ${color};
    filter:drop-shadow(0 0 4px ${color}66)"></div>`;
}
function dispatchSVG(callType: string) {
  const t = (callType ?? "").toLowerCase();
  const color = t.includes("fire") ? "#ff2244"
    : (t.includes("ems") || t.includes("medical") || t.includes("cardiac") || t.includes("chest") || t.includes("breath")) ? "#ff8c00"
    : t.includes("police") || t.includes("law") || t.includes("disturbance") || t.includes("assault") ? "#2a8bff"
    : "#ff4466";
  return `<div style="position:relative;width:22px;height:22px">
    <div style="position:absolute;inset:0;border-radius:50%;border:1.5px solid ${color};opacity:0.5;animation:tl-pulse 2s ease-out infinite"></div>
    <div style="position:absolute;inset:5px;border-radius:50%;background:${color};filter:drop-shadow(0 0 5px ${color})"></div>
  </div>`;
}
const fltColor = (cat: string) =>
  cat === "VFR" ? "#22c55e" : cat === "MVFR" ? "#60a5fa" : cat === "IFR" ? "#ef4444" : cat === "LIFR" ? "#a855f7" : "#5a7090";

function metarWxIcon(wxString: string | null, cover: string | null): string {
  const wx = (wxString ?? "").toUpperCase();
  if (wx.includes("TS")) return "⛈";
  if (wx.includes("SN") || wx.includes("GR") || wx.includes("PL")) return "❄";
  if (wx.includes("RA") || wx.includes("DZ")) return "🌧";
  if (wx.includes("FG") || wx.includes("BR") || wx.includes("HZ")) return "🌫";
  const sky = (cover ?? "").toUpperCase();
  if (sky === "OVC") return "☁";
  if (sky === "BKN") return "🌥";
  if (sky === "SCT") return "⛅";
  if (sky === "FEW") return "🌤";
  if (sky === "CLR" || sky === "SKC") return "☀";
  return "";
}
function metarCircleSVG(icao: string, fltcat: string, wspd: number | null, wdir: number | null, wxString: string | null = null, cover: string | null = null): string {
  const color = fltColor(fltcat);
  const cx = 40, cy = 42, r = 26;
  const ay1 = cy - r - 1, ay2 = cy - r - 14, hs = 3;
  const hasWind = wspd != null && wspd > 0 && wdir != null;
  const arrow = hasWind ? `
    <g transform="rotate(${wdir},${cx},${cy})">
      <line x1="${cx}" y1="${ay1}" x2="${cx}" y2="${ay2 + hs * 2}"
        stroke="${color}" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
      <polygon points="${cx - hs},${ay2 + hs * 2} ${cx},${ay2} ${cx + hs},${ay2 + hs * 2}"
        fill="${color}" opacity="0.8"/>
    </g>` : "";
  const spdTxt = wspd != null
    ? `<text x="${cx}" y="83" text-anchor="middle" font-family="Menlo,Consolas,monospace"
        font-size="8" fill="${color}" opacity="0.75" letter-spacing="0.04em">${wspd}kt</text>`
    : "";
  const wxIcon = metarWxIcon(wxString, cover);
  const icaoY = wxIcon ? cy - 8 : cy + 1;
  const iconTxt = wxIcon
    ? `<text x="${cx}" y="${cy + 10}" text-anchor="middle" dominant-baseline="central" font-size="15" fill="${color}" opacity="0.9">${wxIcon}</text>`
    : "";
  return `<svg width="80" height="88" viewBox="0 0 80 88" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
    <circle cx="${cx}" cy="${cy}" r="${r}" stroke="${color}" stroke-width="1.5" fill="rgba(7,9,15,0.18)" opacity="0.88"/>
    <text x="${cx}" y="${icaoY}" text-anchor="middle" dominant-baseline="central"
      font-family="Menlo,Consolas,monospace" font-size="11" font-weight="700"
      fill="${color}" letter-spacing="0.07em" opacity="0.95">${icao}</text>
    ${iconTxt}${arrow}${spdTxt}
  </svg>`;
}
function geoCenter(geom: any): [number, number] | null {
  if (!geom?.coordinates) return null;
  const pts: [number, number][] = [];
  const collect = (c: any): void => {
    if (typeof c[0] === "number") pts.push([c[1], c[0]]);
    else c.forEach(collect);
  };
  collect(geom.coordinates);
  if (!pts.length) return null;
  const lats = pts.map(p => p[0]), lngs = pts.map(p => p[1]);
  return [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2];
}
function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60), sec = s % 60;
  const hms = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return d > 0 ? `${d}d ${hms}` : hms;
}
function alertPingSVG(label: string, onsetMs: number) {
  const init = fmtElapsed(Date.now() - onsetMs);
  return `<div style="position:relative;width:52px;height:76px">
    <div style="position:absolute;top:4px;left:4px;right:4px;bottom:30px">
      <div style="position:absolute;inset:0;border-radius:50%;border:1.5px solid #f59e0b;animation:tl-alert-ring 2.6s ease-out infinite"></div>
      <div style="position:absolute;inset:0;border-radius:50%;border:1px solid #fbbf24;animation:tl-alert-ring 2.6s ease-out 0.87s infinite"></div>
      <div style="position:absolute;inset:0;border-radius:50%;border:1px solid #f59e0b;animation:tl-alert-ring 2.6s ease-out 1.73s infinite"></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
        width:9px;height:9px;border-radius:50%;background:#f59e0b;
        box-shadow:0 0 6px #f59e0b,0 0 18px rgba(245,158,11,0.7),0 0 36px rgba(245,158,11,0.25)"></div>
    </div>
    <div style="position:absolute;bottom:14px;left:0;right:0;text-align:center;
      font-family:Menlo,Consolas,monospace;font-size:7px;color:#fbbf24;
      letter-spacing:0.14em;white-space:nowrap;
      text-shadow:0 0 5px rgba(245,158,11,0.9),0 0 10px rgba(245,158,11,0.5)">${label}</div>
    <span data-tl-mkr-onset="${onsetMs}" style="position:absolute;bottom:1px;left:0;right:0;display:block;text-align:center;
      font-family:Menlo,Consolas,monospace;font-size:calc(9px * var(--tl-mk-scale,1));color:#f59e0bcc;
      font-variant-numeric:tabular-nums;letter-spacing:0.06em;white-space:nowrap">${init}</span>
  </div>`;
}
function marineSVG(type: "buoy" | "tide_gauge") {
  const color  = type === "buoy" ? "#06b6d4" : "#22d3ee";
  const symbol = type === "buoy" ? "⚓" : "≈";
  return `<div style="width:30px;height:30px;border-radius:50%;
    background:${color}18;border:2px solid ${color};
    display:flex;align-items:center;justify-content:center;
    font-size:14px;line-height:1;
    filter:drop-shadow(0 0 6px ${color}99);
    box-shadow:0 0 0 3px ${color}22">${symbol}</div>`;
}
function stormSVG(_icao: string, precip1hIn: number | null, _windKt: number | null, _windDir: number | null): string {
  const hasRain = precip1hIn != null && precip1hIn > 0.005;
  const color = hasRain ? "#38bdf8" : "#2a4a5a";
  return `<div style="width:7px;height:7px;border-radius:50%;background:${color};opacity:${hasRain ? 0.85 : 0.45};
    box-shadow:0 0 4px ${color}88;cursor:pointer"></div>`;
}
function popupWrap(inner: string, src?: string) {
  const built = Date.now();
  const srcBadge = src ? `<div style="color:#1a3050;font-size:7px;margin-top:5px;border-top:1px solid #0a1520;padding-top:3px;letter-spacing:0.09em">SRC · ${src}</div>` : "";
  const ageLine = `<div class="tl-popup-age" data-built="${built}" style="color:#1a3050;font-size:7px;margin-top:2px;letter-spacing:0.09em">DATA · <span class="tl-age-val">0s ago</span></div>`;
  return `<div style="font-family:Menlo,Consolas,monospace;font-size:11px;color:#d8e3f0;background:#07090fee;
    border:1px solid #1e2d44;border-radius:8px;padding:10px 14px;min-width:180px;line-height:1.9;
    backdrop-filter:blur(8px)">${inner}${srcBadge}${ageLine}</div>`;
}

function reticleHTML(scanning: boolean): string {
  const cls = scanning ? "tl-reticle-scan" : "tl-reticle-lock";
  return `<div class="tl-reticle ${cls}"><span class="tl-rc tl-rc-tl"></span><span class="tl-rc tl-rc-tr"></span><span class="tl-rc tl-rc-bl"></span><span class="tl-rc tl-rc-br"></span></div>`;
}
function trainMarkerSVG(): string {
  return `<div class="tl-train-icon" style="width:28px;height:10px;transform-origin:50% 50%">
    <svg viewBox="0 0 28 10" width="28" height="10" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="2" width="24" height="6" rx="1.5" fill="#4488ff" opacity="0.92"/>
      <rect x="22" y="2.5" width="3.5" height="5" rx="1" fill="#88aaff" opacity="0.95"/>
      <rect x="3.5" y="3.5" width="3" height="3" rx="0.5" fill="#07090f" opacity="0.55"/>
      <rect x="8"   y="3.5" width="3" height="3" rx="0.5" fill="#07090f" opacity="0.55"/>
      <rect x="13"  y="3.5" width="3" height="3" rx="0.5" fill="#07090f" opacity="0.55"/>
    </svg>
  </div>`;
}

function shipSVG(hdg: number, sog: number): string {
  const moving = sog >= 0.5;
  const color = moving ? "#0ea5e9" : "#475569";
  return `<div style="width:20px;height:20px;transform:rotate(${Math.round(hdg)}deg);transform-origin:center">
    <svg viewBox="0 0 20 20" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 1.5 L17.5 16.5 L10 13.5 L2.5 16.5 Z"
        fill="${color}" fill-opacity="0.82" stroke="${color}" stroke-width="0.8" stroke-linejoin="round"
        filter="url(#sv)"/>
      <defs><filter id="sv"><feDropShadow dx="0" dy="0" stdDeviation="1.5" flood-color="${color}" flood-opacity="0.6"/></filter></defs>
    </svg>
  </div>`;
}

// Animate the INNER wrapper div out (not the outer Leaflet positioning element,
// which uses translate3d — overwriting that transform would move markers off-screen).
function animateOut(g: any, cb: () => void) {
  const inners: Element[] = [];
  g.eachLayer?.((layer: any) => {
    const inner = layer.getElement?.()?.firstElementChild as Element | undefined;
    if (inner?.classList) { inner.classList.add("tl-anim-out"); inners.push(inner); }
  });
  if (!inners.length) { cb(); return; }
  setTimeout(cb, 250);
}

// ── Dead-reckoning helper ──────────────────────────────────────────────────────

function destPoint(lat: number, lon: number, bearingDeg: number, distM: number): [number, number] {
  const R = 6371000;
  const d = distM / R;
  const b = bearingDeg * Math.PI / 180;
  const φ1 = lat * Math.PI / 180;
  const λ1 = lon * Math.PI / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(b));
  const λ2 = λ1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
  return [φ2 * 180 / Math.PI, λ2 * 180 / Math.PI];
}

function wmoIcon(code: number): string {
  if (code === 0) return "☀";
  if (code <= 2)  return "⛅";
  if (code === 3) return "☁";
  if (code <= 49) return "🌫";
  if (code <= 57) return "🌦";
  if (code <= 67) return "🌧";
  if (code <= 77) return "❄";
  if (code <= 82) return "🌦";
  if (code <= 99) return "⛈";
  return "—";
}

function distToStamford(lat: number, lon: number, clat = 41.0534, clng = -73.5387): number {
  const dlat = (lat - clat) * 111320;
  const dlon = (lon - clng) * 111320 * Math.cos(clat * Math.PI / 180);
  return Math.sqrt(dlat * dlat + dlon * dlon);
}
function bearingStr(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  const dLon = (toLng - fromLng) * (Math.PI / 180);
  const lat1 = fromLat * (Math.PI / 180), lat2 = toLat * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const deg = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  return ["N","NE","E","SE","S","SW","W","NW","N"][Math.round(deg / 45)];
}
function fmtMi(meters: number): string {
  const mi = meters / 1609.34;
  return mi < 10 ? `${mi.toFixed(1)}mi` : `${Math.round(mi)}mi`;
}
function ssDistOpacity(distM: number): number {
  const MI10 = 16093, MI25 = 40233;
  if (distM <= MI10) return 1.0;
  if (distM >= MI25) return 0.15;
  return 1.0 - 0.85 * (distM - MI10) / (MI25 - MI10);
}

// ── MNR track geometry (hardcoded — ordered stop sequences per line) ───────────

const MNR_MAIN: [number, number][] = [
  [40.752998,-73.977056],[40.805157,-73.939149],
  [40.912161,-73.832185],[40.910321,-73.810242],[40.911605,-73.783807],
  [40.933394,-73.759792],[40.954061,-73.736125],[40.969432,-73.712964],
  [40.985922,-73.682553],[41.000732,-73.664700],[41.021277,-73.624621],
  [41.030171,-73.598306],[41.031682,-73.588173],[41.033817,-73.565859],
  [41.046611,-73.542846],[41.069041,-73.497880],[41.076913,-73.472966],
  [41.077456,-73.445527],[41.096730,-73.421132],[41.103996,-73.404588],
  [41.118928,-73.371413],[41.122265,-73.315408],[41.134844,-73.288970],
  [41.143077,-73.257742],[41.161000,-73.234336],[41.178677,-73.187076],
  [41.194255,-73.131532],[41.223231,-73.057647],[41.271420,-72.963488],
  [41.296501,-72.928290],[41.304979,-72.921747],
];
const MNR_NEWCANAAN: [number, number][] = [
  [41.046611,-73.542846],[41.070547,-73.520021],[41.088760,-73.517828],
  [41.116012,-73.498149],[41.146305,-73.495626],
];
const MNR_DANBURY: [number, number][] = [
  [41.096730,-73.421132],[41.146618,-73.427859],[41.196202,-73.432434],
  [41.216620,-73.426703],[41.267630,-73.441421],[41.325684,-73.433800],
  [41.376225,-73.418171],[41.396146,-73.448790],
];
const MNR_WATERBURY: [number, number][] = [
  [41.178677,-73.187076],[41.319718,-73.083548],[41.344156,-73.079892],
  [41.395139,-73.072499],[41.494204,-73.052655],[41.552728,-73.046126],
];
// Combined track per route (main line up to branch junction, then branch)
const TRACK_ROUTE: Record<string, [number,number][]> = {
  "3": MNR_MAIN,
  "4": [...MNR_MAIN.slice(0, 15), ...MNR_NEWCANAAN.slice(1)] as [number,number][],
  "5": [...MNR_MAIN.slice(0, 19), ...MNR_DANBURY.slice(1)] as [number,number][],
  "6": [...MNR_MAIN.slice(0, 26), ...MNR_WATERBURY.slice(1)] as [number,number][],
};

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.cos((lat1 + lat2) * Math.PI / 360);
  const dLat = lat2 - lat1;
  return (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
}
function distSqLL(a: [number,number], b: [number,number]): number {
  return (a[0]-b[0])**2 + (a[1]-b[1])**2;
}
function closestTrackIdx(track: [number,number][], pt: [number,number]): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < track.length; i++) {
    const d = distSqLL(track[i], pt);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
function interpolateOnTrack(
  track: [number,number][], prevPt: [number,number], nextPt: [number,number], t: number
): [number, number, number] {
  const i0 = closestTrackIdx(track, prevPt);
  const i1 = closestTrackIdx(track, nextPt);
  const seg: [number,number][] = [prevPt];
  if (i1 >= i0) { for (let i = i0+1; i <= i1; i++) seg.push(track[i]); }
  else           { for (let i = i0-1; i >= i1; i--) seg.push(track[i]); }
  seg.push(nextPt);
  let total = 0;
  const acc = [0];
  for (let i = 1; i < seg.length; i++) {
    total += Math.sqrt(distSqLL(seg[i], seg[i-1]));
    acc.push(total);
  }
  if (total === 0) return [prevPt[0], prevPt[1], bearingDeg(prevPt[0], prevPt[1], nextPt[0], nextPt[1])];
  const tgt = t * total;
  let si = 0;
  for (let i = 1; i < acc.length; i++) { if (acc[i] >= tgt) { si = i-1; break; } si = i-1; }
  const sLen = acc[si+1] - acc[si];
  const f = sLen > 0 ? Math.min(1, (tgt - acc[si]) / sLen) : 0;
  const a = seg[si], b = seg[Math.min(si+1, seg.length-1)];
  return [a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, bearingDeg(a[0], a[1], b[0], b[1])];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StamfordMap() {
  const mapRef       = useRef<HTMLDivElement>(null);
  const mapInst      = useRef<any>(null);
  const baseTileRef  = useRef<any>(null);
  const labelRef     = useRef<any>(null);
  const groupRefs    = useRef<Record<LayerKey, any>>({} as any);
  const intervals    = useRef<ReturnType<typeof setInterval>[]>([]);
  const lightningMarkersRef = useRef<{ marker: any; born: number }[]>([]);
  const lightningWsRef      = useRef<WebSocket | null>(null);
  const vesselWsRef         = useRef<WebSocket | null>(null);
  const vesselMarkersRef    = useRef<Map<number, any>>(new Map());
  const vesselLastSeenRef   = useRef<Map<number, number>>(new Map());
  const newVesselBatchRef   = useRef<string[]>([]);
  const strikeCountMinRef   = useRef(0);
  const wakeLockRef         = useRef<any>(null);
  const crosshairLatLngRef  = useRef(STAMFORD);
  const metarObsRef         = useRef<Record<string, number>>({});
  const ambiCanvasRef       = useRef<HTMLCanvasElement>(null);
  const ambiRafRef          = useRef<number>(0);
  const ssModeRef           = useRef(false);
  const ssKnownRef          = useRef<Set<string>>(new Set());
  const ssScanTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const reticleMarkerRef    = useRef<any>(null);
  const reticleSrcRef       = useRef<any>(null);
  const lRef                = useRef<any>(null);
  const ssTrackMarkerRef    = useRef<any>(null);
  const ssLastInputRef      = useRef<number>(Date.now());
  const ssIdleTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const ssTrackMsgTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trainScaleRef       = useRef<number>(1.0);

  const [baseKey,       setBaseKey]       = useState<BaseKey>("dark");
  const [enabled,       setEnabled]       = useState<Record<LayerKey, boolean>>({
    aircraft: true, radar: true, iss: true, alerts: true,
    lightning: true, transit: true, rail: true, services: true,
    traffic: true, dispatch: true, buildings: true, marine: true, vessels: true, metar: true, storm: true, outages: true,
    sector: true,
  });
  const [weather,       setWeather]       = useState<WeatherNow | null>(null);
  const [iss,           setIss]           = useState<ISSPos | null>(null);
  const [alertCount,    setAlertCount]    = useState(0);
  const [aircraftCount, setAircraftCount] = useState(0);
  const [transitCount,  setTransitCount]  = useState(0);
  const [servicesCount, setServicesCount] = useState(0);
  const [trafficCount,  setTrafficCount]  = useState(0);
  const [dispatchCount,  setDispatchCount]  = useState(0);
  const [buildingsCount, setBuildingsCount] = useState(0);
  const [marineCount,    setMarineCount]    = useState(0);
  const [vesselCount,    setVesselCount]    = useState(0);
  const [metarCount,    setMetarCount]    = useState(0);
  const [stormCount,    setStormCount]    = useState(0);
  const [outagesCount,  setOutagesCount]  = useState(0);
  const [outagesTotal,  setOutagesTotal]  = useState(0);
  const [railCount,     setRailCount]     = useState(0);
  const [alertTexts,    setAlertTexts]    = useState<string[]>([]);
  const [trafficTexts,  setTrafficTexts]  = useState<string[]>([]);
  const [marineTexts,   setMarineTexts]   = useState<string[]>([]);
  const [metarItems,    setMetarItems]    = useState<{ text: string; color: string }[]>([]);
  const [strikeCount,   setStrikeCount]   = useState(0);
  const [strikesPerMin, setStrikesPerMin] = useState(0);
  const [wsStatus,      setWsStatus]      = useState<"connecting" | "live" | "offline">("connecting");
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [ssMode,        setSsMode]        = useState(false);
  const [newsItems,     setNewsItems]     = useState<NewsItem[]>([]);
  const [hourlyForecast, setHourlyForecast] = useState<HourlyFc[]>([]);
  const [dailyForecast,  setDailyForecast]  = useState<DailyFc[]>([]);
  const [showControls,   setShowControls]   = useState(false);
  const [ssTrackMsg,     setSsTrackMsg]     = useState<SsTrackInfo | null>(null);
  const [isFullscreen,  setIsFullscreen]  = useState(false);
  const [milClock,      setMilClock]      = useState("");
  const [nowMs,         setNowMs]         = useState(Date.now());
  const [log,           setLog]           = useState<LogEntry[]>([]);
  const [termLog,       setTermLog]       = useState<TermEntry[]>([]);
  const [audioOpen,     setAudioOpen]     = useState(false);
  const [centerPx,      setCenterPx]      = useState<{ x: number; y: number } | null>(null);
  const [uiScale, setUiScale] = useState(() => {
    if (typeof window === "undefined") return 1.0;
    const s = parseFloat(localStorage.getItem("tl-ui-scale") ?? "1");
    return isNaN(s) || s < 0.5 || s > 2.5 ? 1.0 : s;
  });
  const applyScale = useCallback((v: number) => {
    setUiScale(v);
    if (typeof window !== "undefined") localStorage.setItem("tl-ui-scale", String(v));
  }, []);

  const [markerScale, setMarkerScale] = useState(() => {
    if (typeof window === "undefined") return 1.0;
    const s = parseFloat(localStorage.getItem("tl-mk-scale") ?? "1");
    return isNaN(s) || s < 0.5 || s > 3 ? 1.0 : s;
  });
  const applyMarkerScale = useCallback((v: number) => {
    setMarkerScale(v);
    document.documentElement.style.setProperty("--tl-mk-scale", String(v));
    if (typeof window !== "undefined") localStorage.setItem("tl-mk-scale", String(v));
  }, []);

  const [trainIconScale, setTrainIconScale] = useState(() => {
    if (typeof window === "undefined") return 1.0;
    const s = parseFloat(localStorage.getItem("tl-train-scale") ?? "1");
    return isNaN(s) || s < 0.5 || s > 3 ? 1.0 : s;
  });
  const applyTrainIconScale = useCallback((v: number) => {
    setTrainIconScale(v);
    trainScaleRef.current = v;
    if (typeof window !== "undefined") localStorage.setItem("tl-train-scale", String(v));
  }, []);

  const trackGroupRef      = useRef<any>(null);
  const trainMarkersRef    = useRef<Map<string, any>>(new Map());
  const trainStateRef      = useRef<Map<string, { prevLat: number; prevLon: number; prevDepMs: number; nextLat: number; nextLon: number; nextArrMs: number; track: [number,number][] }>>(new Map());
  const aircraftMarkersRef = useRef<Map<string, any>>(new Map());
  const aircraftStateRef   = useRef<Map<string, { lat: number; lon: number; heading: number; speedMs: number; lastMs: number }>>(new Map());
  const metarMarkersRef    = useRef<Map<string, any>>(new Map());
  const outagesTotalRef    = useRef<number>(0);
  const terminalRef        = useRef<HTMLDivElement>(null);
  const feedLastSeenRef    = useRef<Partial<Record<FeedKey, number>>>({});
  const [trackOpacity, setTrackOpacity] = useState(() => {
    if (typeof window === "undefined") return 0.35;
    const s = parseFloat(localStorage.getItem("tl-track-opacity") ?? "0.35");
    return isNaN(s) || s < 0 || s > 1 ? 0.35 : s;
  });
  const applyTrackOpacity = useCallback((v: number) => {
    setTrackOpacity(v);
    if (typeof window !== "undefined") localStorage.setItem("tl-track-opacity", String(v));
    trackGroupRef.current?.eachLayer((l: any) => {
      if (l.setStyle) l.setStyle({ opacity: v, fillOpacity: v * 0.85 });
    });
  }, []);
  const [radarOpacity, setRadarOpacity] = useState(() => {
    if (typeof window === "undefined") return 0.6;
    const s = parseFloat(localStorage.getItem("tl-radar-opacity") ?? "0.6");
    return isNaN(s) || s < 0 || s > 1 ? 0.6 : s;
  });
  const radarOpacityRef = useRef(0.6);
  radarOpacityRef.current = radarOpacity;
  const applyRadarOpacity = useCallback((v: number) => {
    setRadarOpacity(v);
    radarOpacityRef.current = v;
    if (typeof window !== "undefined") localStorage.setItem("tl-radar-opacity", String(v));
    groupRefs.current.radar?.eachLayer((layer: any) => {
      if (layer.setOpacity) layer.setOpacity(v);
    });
  }, []);

  const [ongoingItems, setOngoingItems] = useState<OngoingItem[]>([]);

  // ── Event log ─────────────────────────────────────────────────────────────

  // Sync marker text scale CSS var on mount and whenever it changes
  useEffect(() => {
    document.documentElement.style.setProperty("--tl-mk-scale", String(markerScale));
  }, [markerScale]);

  // Sync trainScaleRef on mount
  useEffect(() => { trainScaleRef.current = trainIconScale; }, [trainIconScale]);

  // Screensaver mode: scan for new vehicles entering 10mi sector, autotrack, idle pullback
  useEffect(() => {
    ssModeRef.current = ssMode;
    if (!ssMode) {
      if (ssScanTimerRef.current)  { clearInterval(ssScanTimerRef.current);  ssScanTimerRef.current  = null; }
      if (ssIdleTimerRef.current)  { clearInterval(ssIdleTimerRef.current);  ssIdleTimerRef.current  = null; }
      if (ssTrackMsgTimerRef.current) { clearTimeout(ssTrackMsgTimerRef.current); ssTrackMsgTimerRef.current = null; }
      ssKnownRef.current.clear();
      ssTrackMarkerRef.current = null;
      setSsTrackMsg(null);
      reticleSrcRef.current = null;
      // Restore full opacity on all moving markers
      aircraftMarkersRef.current.forEach(m => { try { m.setOpacity(1); } catch {} });
      trainMarkersRef.current.forEach(m   => { try { m.setOpacity(1); } catch {} });
      vesselMarkersRef.current.forEach(m  => { try { m.setOpacity(1); } catch {} });
      return;
    }

    // On enable: fly to TLS 20mi view (zoom 11)
    const map = mapInst.current;
    if (map) {
      const { lat, lng } = crosshairLatLngRef.current;
      map.flyTo([lat, lng], 11, { animate: true, duration: 2.5 });
    }
    ssLastInputRef.current = Date.now();

    // Seed known set with vehicles already within 10mi (don't pre-block distant fly-ins)
    const SS_SEED_M = 16093;
    const { lat: tlsLat0, lng: tlsLng0 } = crosshairLatLngRef.current;
    aircraftMarkersRef.current.forEach((m, id) => { try { if (distToStamford(m.getLatLng().lat, m.getLatLng().lng, tlsLat0, tlsLng0) <= SS_SEED_M) ssKnownRef.current.add(id); } catch {} });
    vesselMarkersRef.current.forEach((m, mmsi) => { try { if (distToStamford(m.getLatLng().lat, m.getLatLng().lng, tlsLat0, tlsLng0) <= SS_SEED_M) ssKnownRef.current.add(`ais-${mmsi}`); } catch {} });
    trainMarkersRef.current.forEach((m, id) => { try { if (distToStamford(m.getLatLng().lat, m.getLatLng().lng, tlsLat0, tlsLng0) <= SS_SEED_M) ssKnownRef.current.add(`train-${id}`); } catch {} });

    // Track user input to detect idle
    const mapEl = mapRef.current;
    const resetIdle = () => { ssLastInputRef.current = Date.now(); };
    const cancelTrack = () => { ssTrackMarkerRef.current = null; setSsTrackMsg(null); };
    if (mapEl) {
      mapEl.addEventListener("wheel", resetIdle, { passive: true });
      mapEl.addEventListener("touchstart", resetIdle, { passive: true });
    }
    map.on("dragstart", cancelTrack);
    map.on("zoomstart", cancelTrack);

    // Idle pullback: after 5s no input (and not actively tracking), fly back to TLS 20mi
    ssIdleTimerRef.current = setInterval(() => {
      if (!ssModeRef.current || !mapInst.current) return;
      if (ssTrackMarkerRef.current) return; // actively tracking, let it continue
      if (Date.now() - ssLastInputRef.current > 5000) {
        ssLastInputRef.current = Date.now();
        const { lat, lng } = crosshairLatLngRef.current;
        mapInst.current.flyTo([lat, lng], 11, { animate: true, duration: 2.0 });
      }
    }, 1000);

    const SS_M = 16093; // 10 miles
    ssScanTimerRef.current = setInterval(() => {
      if (!ssModeRef.current) return;
      const mapNow = mapInst.current;
      if (!mapNow) return;
      let newMarker: any = null;
      let newLat = 0, newLon = 0, newestMs = 0;
      let newType = "", newId = "", newDetail = "";
      const tlsLat = crosshairLatLngRef.current.lat;
      const tlsLng = crosshairLatLngRef.current.lng;

      aircraftMarkersRef.current.forEach((m, id) => {
        if (ssKnownRef.current.has(id)) return;
        const ll = m.getLatLng();
        if (distToStamford(ll.lat, ll.lng, tlsLat, tlsLng) > SS_M) return;
        const t = aircraftStateRef.current.get(id)?.lastMs ?? Date.now();
        if (t > newestMs) {
          newestMs = t; newMarker = m; newLat = ll.lat; newLon = ll.lng;
          newType = "AIRPLANE"; newId = m._tlMeta?.id ?? id; newDetail = m._tlMeta?.detail ?? "";
        }
      });
      vesselMarkersRef.current.forEach((m, mmsi) => {
        const id = `ais-${mmsi}`;
        if (ssKnownRef.current.has(id)) return;
        const ll = m.getLatLng();
        if (distToStamford(ll.lat, ll.lng, tlsLat, tlsLng) > SS_M) return;
        const t = vesselLastSeenRef.current.get(mmsi) ?? Date.now();
        if (t > newestMs) {
          newestMs = t; newMarker = m; newLat = ll.lat; newLon = ll.lng;
          newType = "VESSEL"; newId = m._tlMeta?.id ?? `MMSI ${mmsi}`; newDetail = m._tlMeta?.detail ?? "";
        }
      });
      trainMarkersRef.current.forEach((m, id) => {
        const tid = `train-${id}`;
        if (ssKnownRef.current.has(tid)) return;
        const ll = m.getLatLng();
        if (distToStamford(ll.lat, ll.lng, tlsLat, tlsLng) > SS_M) return;
        if (!newMarker) {
          newMarker = m; newLat = ll.lat; newLon = ll.lng;
          newType = "TRAIN"; newId = m._tlMeta?.id ?? `Train ${id}`; newDetail = m._tlMeta?.detail ?? "";
        }
      });

      // Mark only vehicles currently within 10mi as known (preserve fly-in detection for distant ones)
      aircraftMarkersRef.current.forEach((m, id) => { try { if (distToStamford(m.getLatLng().lat, m.getLatLng().lng, tlsLat, tlsLng) <= SS_M) ssKnownRef.current.add(id); } catch {} });
      vesselMarkersRef.current.forEach((m, mmsi) => { try { if (distToStamford(m.getLatLng().lat, m.getLatLng().lng, tlsLat, tlsLng) <= SS_M) ssKnownRef.current.add(`ais-${mmsi}`); } catch {} });
      trainMarkersRef.current.forEach((m, id) => { try { if (distToStamford(m.getLatLng().lat, m.getLatLng().lng, tlsLat, tlsLng) <= SS_M) ssKnownRef.current.add(`train-${id}`); } catch {} });

      if (newMarker) {
        ssTrackMarkerRef.current = newMarker;
        reticleSrcRef.current = newMarker;
        setSsTrackMsg({ type: newType, id: newId, detail: newDetail });
        if (ssTrackMsgTimerRef.current) clearTimeout(ssTrackMsgTimerRef.current);

        import("leaflet").then(mod => {
          const Lx = mod.default;
          if (reticleMarkerRef.current) { try { mapNow.removeLayer(reticleMarkerRef.current); } catch {} }
          reticleMarkerRef.current = Lx.marker([newLat, newLon], {
            icon: Lx.divIcon({ html: reticleHTML(true), className: "", iconSize: [44, 44], iconAnchor: [22, 22] }),
            interactive: false, keyboard: false, zIndexOffset: -1000,
          }).addTo(mapNow);
          // Lock reticle after scan animation, don't open full popup
          setTimeout(() => {
            const rEl = reticleMarkerRef.current?.getElement?.();
            const inner = rEl?.querySelector(".tl-reticle") as HTMLElement | null;
            if (inner) { inner.classList.remove("tl-reticle-scan"); inner.classList.add("tl-reticle-lock"); }
          }, 650);
        });
      }
    }, 6000);
    return () => {
      if (ssScanTimerRef.current)  { clearInterval(ssScanTimerRef.current);  ssScanTimerRef.current  = null; }
      if (ssIdleTimerRef.current)  { clearInterval(ssIdleTimerRef.current);  ssIdleTimerRef.current  = null; }
      if (mapEl) {
        mapEl.removeEventListener("wheel", resetIdle);
        mapEl.removeEventListener("touchstart", resetIdle);
      }
      map.off("dragstart", cancelTrack);
      map.off("zoomstart", cancelTrack);
    };
  }, [ssMode]);

  // Newest-on-top: always stay scrolled to top so fresh entries are visible
  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = 0;
  }, [termLog]);

  // serverNow: pass the server's Date.now() when the API response includes one,
  // so the timer is anchored to the server clock rather than the client's system time.
  const addLog = useCallback((icon: string, text: string, color: string, serverNow?: number) => {
    setLog(prev => [{ icon, text, color, loggedAt: serverNow ?? Date.now() }, ...prev].slice(0, 10));
  }, []);

  const addTerm = useCallback((cat: string, text: string, color: string) => {
    setTermLog(prev => [...prev, { ts: Date.now(), cat, text, color }].slice(-200));
  }, []);

  const touchFeed = useCallback((key: FeedKey) => {
    feedLastSeenRef.current[key] = Date.now();
  }, []);

  // ── Fetch functions ───────────────────────────────────────────────────────

  const fetchAircraft = useCallback((L: any) => {
    fetch("/api/map/aircraft").then(r => r.json()).then(data => {
      const g = groupRefs.current.aircraft;
      if (!g) return;
      const states: any[][] = data.states ?? [];
      setAircraftCount(states.length);
      touchFeed("aircraft");
      if (states.length) addLog("✈", `${states.length} aircraft in sector`, "#a855f7");

      const now = Date.now();
      const seenIds = new Set<string>();
      let addedCount = 0;

      states.forEach(s => {
        const [icao, callsign, , , , lon, lat, baroAlt, , vel, hdg, , , , , , geoAlt, acType, reg, ownOp] = s;
        if (lat == null || lon == null) return;
        const id = String(icao);
        seenIds.add(id);
        const alt = (baroAlt ?? geoAlt ?? 0) as number;
        const cs  = (callsign as string)?.trim() || String(icao);
        const heading = (hdg ?? 0) as number;
        const speedMs = (vel ?? 0) as number;
        const typeStr = ((acType ?? "") as string).trim();
        const regStr  = ((reg ?? "") as string).trim();
        const opStr   = ((ownOp ?? "") as string).trim();

        aircraftStateRef.current.set(id, { lat, lon, heading, speedMs, lastMs: now });

        const popupHtml = popupWrap(`<div style="font-size:13px;font-weight:700;color:#a855f7;margin-bottom:4px">${cs}${regStr && regStr !== cs ? `<span style="color:#a855f755;font-size:10px;margin-left:8px">${regStr}</span>` : ""}</div>
          ${opStr ? `<div style="color:#5a7090;font-size:9px;margin-bottom:3px;letter-spacing:.07em">${opStr}</div>` : ""}
          <div style="color:#5a7090;font-size:9px;margin-bottom:7px;letter-spacing:.06em">${typeStr || "—"} · ${String(icao).toUpperCase()}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 14px">
            <span style="color:#5a7090">ALT</span><span>${alt > 0 ? metersToFt(alt).toLocaleString() + " ft" : "—"}</span>
            <span style="color:#5a7090">SPD</span><span>${speedMs > 0 ? mpsToKnots(speedMs) + " kt" : "—"}</span>
            <span style="color:#5a7090">HDG</span><span>${heading}° ${degToCompass(heading)}</span>
          </div>`, "adsb.lol");

        const tlMeta = {
          type: "AIRPLANE", id: cs,
          detail: `${typeStr || "—"} · ${alt > 0 ? metersToFt(alt).toLocaleString() + "ft" : "gnd"} · ${speedMs > 0 ? mpsToKnots(speedMs) + "kt" : "—"}`,
          reg: regStr, op: opStr, acType: typeStr,
        };
        if (aircraftMarkersRef.current.has(id)) {
          const m = aircraftMarkersRef.current.get(id);
          // Update heading arrow without tl-anim (no fade-in on update)
          m.setIcon(L.divIcon({ html: `<div>${aircraftSVG(heading)}</div>`, className: "", iconSize: [22, 22], iconAnchor: [11, 11] }));
          m.getPopup()?.setContent(popupHtml);
          m._tlMeta = tlMeta;
        } else {
          const icon = L.divIcon({ html: `<div class="tl-anim">${aircraftSVG(heading)}</div>`, className: "", iconSize: [22, 22], iconAnchor: [11, 11] });
          const m = L.marker([lat, lon], { icon })
            .bindPopup(L.popup({ className: "tl-popup", maxWidth: 240, offset: [0, -4] }).setContent(popupHtml))
            .addTo(g);
          m._tlMeta = tlMeta;
          aircraftMarkersRef.current.set(id, m);
          addedCount++;
        }
      });

      // Remove aircraft that left the sector
      let removedCount = 0;
      aircraftMarkersRef.current.forEach((m, id) => {
        if (!seenIds.has(id)) {
          g.removeLayer(m);
          aircraftMarkersRef.current.delete(id);
          aircraftStateRef.current.delete(id);
          removedCount++;
        }
      });

      // One summary line per batch — not per aircraft
      if (states.length > 0 || removedCount > 0) {
        const net = addedCount - removedCount;
        const netStr = net > 0 ? ` (+${net})` : net < 0 ? ` (${net})` : "";
        addTerm("✈", `Air traffic: ${states.length} following${netStr}`, "#a855f7");
      }
    }).catch(() => {});
  }, [addLog, addTerm]);

  const fetchRadar = useCallback((L: any) => {
    const g = groupRefs.current.radar;
    if (!g) return;
    // RainViewer: fetch the latest radar timestamp, then load smoothly-interpolated tiles.
    // ~2 min update cycle, 250m resolution, transparent where no precip. Color scheme 6 = NEXRAD palette.
    fetch("https://api.rainviewer.com/public/weather-maps.json", { signal: AbortSignal.timeout(6000) })
      .then(r => r.json())
      .then((data: any) => {
        const frames: { time: number }[] = data?.radar?.past ?? [];
        const ts = frames[frames.length - 1]?.time;
        if (!ts) return;
        g.clearLayers();
        g.addLayer(L.tileLayer(
          `https://tilecache.rainviewer.com/v2/radar/${ts}/256/{z}/{x}/{y}/6/1_1.png`,
          { opacity: radarOpacityRef.current, maxZoom: 19, maxNativeZoom: 6, tileSize: 256, className: "tl-radar-tile" }
        ));
        touchFeed("radar");
      })
      .catch(() => {
        // Fall back to IEM composite if RainViewer is unreachable
        const v = Math.floor(Date.now() / 300_000);
        g.clearLayers();
        g.addLayer(L.tileLayer(
          `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png?_=${v}`,
          { opacity: radarOpacityRef.current, maxZoom: 19, maxNativeZoom: 10, className: "tl-radar-tile" }
        ));
      });
  }, [touchFeed]);

  const fetchISS = useCallback((L: any) => {
    fetch("https://api.wheretheiss.at/v1/satellites/25544").then(r => r.json()).then((d: ISSPos) => {
      setIss(d);
      touchFeed("iss");
      const g = groupRefs.current.iss;
      if (!g) return;
      animateOut(g, () => {
      g.clearLayers();
      const icon = L.divIcon({ html: `<div class="tl-anim">${issSVG()}</div>`, className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
      L.marker([d.latitude, d.longitude], { icon })
        .bindPopup(L.popup({ className: "tl-popup", maxWidth: 220, offset: [0, -4] }).setContent(
          popupWrap(`<div style="font-size:13px;font-weight:700;color:#a78bfa;margin-bottom:5px">ISS · Intl Space Station</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 14px">
            <span style="color:#5a7090">ALT</span><span>${Math.round(d.altitude)} km</span>
            <span style="color:#5a7090">SPD</span><span>${Math.round(d.velocity)} km/h</span>
            <span style="color:#5a7090">VIS</span><span>${d.visibility}</span>
          </div>`, "wheretheiss.at")))
        .addTo(g);
      }); // end animateOut
    }).catch(() => {});
  }, []);

  const fetchAlerts = useCallback((L: any) => {
    fetch("/api/map/alerts").then(r => r.json()).then(d => {
      const rawFeatures: any[] = d.features ?? [];
      // NWS issues one feature per county/zone covered by the same alert — deduplicate by headline
      const seenHeadlines = new Set<string>();
      const features = rawFeatures.filter((f: any) => {
        const key = f.properties.headline ?? f.properties.event ?? String(f.id);
        if (seenHeadlines.has(key)) return false;
        seenHeadlines.add(key);
        return true;
      });
      const serverNow: number = d.serverNow ?? Date.now();
      const fetchTime = Date.now();
      setAlertCount(features.length);
      touchFeed("alerts");
      setAlertTexts(features.map((f: any) =>
        [f.properties.event, f.properties.headline].filter(Boolean).join(" — ")
      ));
      setOngoingItems(prev => {
        const alertItems = features.map((f: any) => {
          const sent = f.properties.sent ?? f.properties.onset ?? f.properties.effective;
          const startMs = sent ? new Date(sent).getTime() : serverNow;
          const headline = f.properties.headline ?? f.properties.event ?? "Alert";
          return {
            id: String(f.id ?? startMs),
            evtType: (f.properties.event ?? "ALERT").toUpperCase(),
            detail: headline.replace(/\..*$/, "").slice(0, 60),
            color: "#f59e0b",
            startMs,
            serverNow,
            fetchTime,
          };
        });
        const nonAlerts = prev.filter(it => it.color !== "#f59e0b");
        return [...alertItems, ...nonAlerts];
      });
      if (features.length) addLog("⚠", `${features.length} NWS alert${features.length > 1 ? "s" : ""} active`, "#f59e0b", serverNow);
      const g = groupRefs.current.alerts;
      if (!g) return;
      g.clearLayers();
      features.forEach((f: any) => {
        // Subtle polygon fill for geographic context
        if (f.geometry) {
          L.geoJSON(f.geometry, {
            style: { color: "#f59e0b", weight: 0.5, opacity: 0.35, fillColor: "#f59e0b", fillOpacity: 0.04 },
          }).addTo(g);
        }
        // Animated ping at centroid
        const center = geoCenter(f.geometry);
        if (!center) return;
        const sent = f.properties.sent ?? f.properties.onset ?? f.properties.effective;
        const onsetMs = sent ? new Date(sent).getTime() : serverNow;
        const elapsedAtFetch = serverNow - onsetMs;
        const shortEvt = (f.properties.event ?? "ALERT").split(" ").pop()!.slice(0, 7).toUpperCase();
        const safeId = (f.id ?? `${center[0]}-${center[1]}`).replace(/[^a-z0-9]/gi, "");
        const sentLabel = sent ? new Date(sent).toUTCString().slice(5, 22) + "Z" : "—";
        const desc = (f.properties.description ?? "").replace(/\*/g, "").replace(/\n+/g, " ").trim();
        const buildPopup = () => popupWrap(`
          <div style="font-size:12px;font-weight:700;color:#f59e0b;margin-bottom:3px">${f.properties.event}</div>
          <div style="color:#5a7090;font-size:10px;margin-bottom:6px">${f.properties.areaDesc ?? ""}</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin-bottom:5px">
            <span style="color:#2a3a52;font-size:9px">ISSUED</span>
            <span style="color:#5a7090;font-size:9px">${sentLabel}</span>
            <span style="color:#2a3a52;font-size:9px">ELAPSED</span>
            <span id="tl-atimer-${safeId}" style="color:#f59e0b;font-weight:700;font-variant-numeric:tabular-nums;font-size:11px;letter-spacing:0.06em">
              ${fmtElapsed(elapsedAtFetch + (Date.now() - fetchTime))}
            </span>
          </div>
          ${desc ? `<div style="font-size:9px;color:#c8d8e8;border-top:1px solid #0d1a26;padding-top:6px;line-height:1.6;max-height:120px;overflow-y:auto;scrollbar-width:none">${desc}</div>` : ""}
        `, "NWS Alerts API");
        const icon = L.divIcon({ html: alertPingSVG(shortEvt, onsetMs), className: "", iconSize: [52, 76], iconAnchor: [26, 46] });
        const marker = L.marker(center, { icon })
          .bindPopup(L.popup({ className: "tl-popup", maxWidth: 340, offset: [0, -4] }).setContent(buildPopup()));
        let timerInt: ReturnType<typeof setInterval> | null = null;
        marker.on("popupopen", () => {
          timerInt = setInterval(() => {
            const el = document.getElementById(`tl-atimer-${safeId}`);
            if (el) el.textContent = fmtElapsed(elapsedAtFetch + (Date.now() - fetchTime));
          }, 1000);
        });
        marker.on("popupclose", () => { if (timerInt) { clearInterval(timerInt); timerInt = null; } });
        marker.addTo(g);
      });
    }).catch(() => {});
  }, [addLog]);

  const fetchTransit = useCallback((L: any) => {
    fetch("/api/map/transit").then(r => r.json()).then(data => {
      const vehicles: any[] = data.vehicles ?? [];
      setTransitCount(vehicles.length);
      touchFeed("transit");
      const g = groupRefs.current.transit;
      if (!g) return;
      animateOut(g, () => {
        g.clearLayers();
        if (vehicles.length) addLog("🚌", `${vehicles.length} CT Transit buses active`, "#60a5fa");
        vehicles.forEach(v => {
          const icon = L.divIcon({ html: `<div class="tl-anim">${transitSVG(v.routeTag, v.heading)}</div>`, className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
          L.marker([v.lat, v.lon], { icon })
            .bindPopup(L.popup({ className: "tl-popup", maxWidth: 220, offset: [0, -4] }).setContent(
              popupWrap(`<div style="font-size:13px;font-weight:700;color:#60a5fa;margin-bottom:5px">Route ${v.routeTag}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 14px">
                <span style="color:#5a7090">BUS</span><span>${v.id}</span>
                <span style="color:#5a7090">HDG</span><span>${v.heading}° ${degToCompass(v.heading)}</span>
                <span style="color:#5a7090">SPD</span><span>${v.speedKmHr} km/h</span>
              </div>`, "CT Transit GTFS")))
            .addTo(g);
        });
      });
    }).catch(() => {});
  }, [addLog]);

  // Metro-North stops for track overlay (from MTA GTFS static stops.txt)
  const MNR_STOPS = [
    { name: "Grand Central",        lat: 40.752998, lon: -73.977056 },
    { name: "Harlem-125 St",        lat: 40.805157, lon: -73.939149 },
    { name: "Mt Vernon East",       lat: 40.912161, lon: -73.832185 },
    { name: "Pelham",               lat: 40.910321, lon: -73.810242 },
    { name: "New Rochelle",         lat: 40.911605, lon: -73.783807 },
    { name: "Larchmont",            lat: 40.933394, lon: -73.759792 },
    { name: "Mamaroneck",           lat: 40.954061, lon: -73.736125 },
    { name: "Harrison",             lat: 40.969432, lon: -73.712964 },
    { name: "Rye",                  lat: 40.985922, lon: -73.682553 },
    { name: "Port Chester",         lat: 41.000732, lon: -73.664700 },
    { name: "Greenwich",            lat: 41.021277, lon: -73.624621 },
    { name: "Cos Cob",              lat: 41.030171, lon: -73.598306 },
    { name: "Riverside",            lat: 41.031682, lon: -73.588173 },
    { name: "Old Greenwich",        lat: 41.033817, lon: -73.565859 },
    { name: "Stamford",             lat: 41.046611, lon: -73.542846 },
    { name: "Glenbrook",            lat: 41.070547, lon: -73.520021 },
    { name: "Springdale",           lat: 41.088760, lon: -73.517828 },
    { name: "Talmadge Hill",        lat: 41.116012, lon: -73.498149 },
    { name: "New Canaan",           lat: 41.146305, lon: -73.495626 },
    { name: "Noroton Heights",      lat: 41.069041, lon: -73.497880 },
    { name: "Darien",               lat: 41.076913, lon: -73.472966 },
    { name: "Rowayton",             lat: 41.077456, lon: -73.445527 },
    { name: "South Norwalk",        lat: 41.096730, lon: -73.421132 },
    { name: "Merritt 7",            lat: 41.146618, lon: -73.427859 },
    { name: "Wilton",               lat: 41.196202, lon: -73.432434 },
    { name: "Cannondale",           lat: 41.216620, lon: -73.426703 },
    { name: "Branchville",          lat: 41.267630, lon: -73.441421 },
    { name: "Redding",              lat: 41.325684, lon: -73.433800 },
    { name: "Bethel",               lat: 41.376225, lon: -73.418171 },
    { name: "Danbury",              lat: 41.396146, lon: -73.448790 },
    { name: "East Norwalk",         lat: 41.103996, lon: -73.404588 },
    { name: "Westport",             lat: 41.118928, lon: -73.371413 },
    { name: "Green's Farms",        lat: 41.122265, lon: -73.315408 },
    { name: "Southport",            lat: 41.134844, lon: -73.288970 },
    { name: "Fairfield",            lat: 41.143077, lon: -73.257742 },
    { name: "Fairfield-Black Rock", lat: 41.161000, lon: -73.234336 },
    { name: "Bridgeport",           lat: 41.178677, lon: -73.187076 },
    { name: "Stratford",            lat: 41.194255, lon: -73.131532 },
    { name: "Milford",              lat: 41.223231, lon: -73.057647 },
    { name: "West Haven",           lat: 41.271420, lon: -72.963488 },
    { name: "New Haven",            lat: 41.296501, lon: -72.928290 },
    { name: "New Haven-State St",   lat: 41.304979, lon: -72.921747 },
  ];

  const fetchRailTrack = useCallback((L: any) => {
    const op = parseFloat(localStorage.getItem("tl-track-opacity") ?? "0.35");
    const g = L.layerGroup().addTo(mapInst.current);
    const lineStyle = { color: "#2255bb", weight: 2, opacity: op, interactive: false };

    // Hardcoded tracks draw instantly as fallback for the full line
    const fallbackGroup = L.layerGroup().addTo(g);
    [MNR_MAIN, MNR_NEWCANAAN, MNR_DANBURY, MNR_WATERBURY].forEach(seg => {
      L.polyline(seg, lineStyle).addTo(fallbackGroup);
    });

    // Station dots draw immediately
    MNR_STOPS.forEach(st => {
      L.circleMarker([st.lat, st.lon], {
        radius: 4, color: "#2255bb", fillColor: "#4488ee",
        fillOpacity: op * 0.85, opacity: op, weight: 1.5,
      }).bindPopup(L.popup({ className: "tl-popup", maxWidth: 200, offset: [0, -6] }).setContent(
        popupWrap(`<div style="font-size:13px;font-weight:700;color:#4488ff">${st.name}</div>
          <div style="color:#5a7090;font-size:10px;margin-top:2px">Metro-North Station</div>`, "Metro-North / MTA")
      )).addTo(g);
    });

    // Async: overlay accurate OSM geometry for Stamford metro area (replaces fallback if Overpass succeeds)
    const osmGroup = L.layerGroup().addTo(g);
    fetch("/api/map/railtrack").then(r => r.json()).then(data => {
      const ways: any[] = data.ways ?? [];
      if (ways.length > 0) {
        fallbackGroup.clearLayers();
        ways.forEach(w => L.polyline(w.coords, lineStyle).addTo(osmGroup));
      }
    }).catch(() => {});

    trackGroupRef.current = g;
  }, []);

  const fetchRail = useCallback((L: any) => {
    fetch("/api/map/transit-rail").then(r => r.json()).then(data => {
      const trains: any[] = data.trains ?? [];
      setRailCount(trains.length);
      touchFeed("rail");
      const g = groupRefs.current.rail;
      if (!g) return;
      if (trains.length) addLog("🚆", `${trains.length} Metro-North trains active`, "#4488ff");

      // Remove markers for trains no longer in the feed
      const incomingIds = new Set(trains.map((t: any) => String(t.id)));
      let removedCount = 0;
      trainMarkersRef.current.forEach((_marker, id) => {
        if (!incomingIds.has(id)) {
          g.removeLayer(trainMarkersRef.current.get(id));
          trainMarkersRef.current.delete(id);
          removedCount++;
        }
      });

      let addedCount = 0;
      trains.forEach(t => {
        const id = String(t.id);
        const depStr = t.depMs ? new Date(t.depMs).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "?";
        const popupContent = popupWrap(`<div style="font-size:13px;font-weight:700;color:#4488ff;margin-bottom:5px">Train ${t.tripId}</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 14px">
            <span style="color:#5a7090">LINE</span><span>${t.line}</span>
            <span style="color:#5a7090">DIR</span><span>${t.dir === "outbound" ? "→ New Haven" : "← Grand Central"}</span>
            <span style="color:#5a7090">NEXT</span><span>${t.stopName}</span>
            <span style="color:#5a7090">DEP</span><span>${depStr}</span>
          </div>`, "MTA Rail API");

        // Update interpolation state for animation loop
        if (t.prevLat != null && t.prevDepMs != null && t.nextArrMs > t.prevDepMs) {
          trainStateRef.current.set(id, {
            prevLat: t.prevLat, prevLon: t.prevLon, prevDepMs: t.prevDepMs,
            nextLat: t.nextLat, nextLon: t.nextLon, nextArrMs: t.nextArrMs,
            track: TRACK_ROUTE[t.routeId] ?? MNR_MAIN,
          });
        } else {
          trainStateRef.current.delete(id);
        }

        if (trainMarkersRef.current.has(id)) {
          const m = trainMarkersRef.current.get(id);
          // Position is handled by animation loop; only update popup
          if (!trainStateRef.current.has(id)) m.setLatLng([t.lat, t.lon]);
          m.getPopup()?.setContent(popupContent);
        } else {
          const icon = L.divIcon({
            html: `<div class="tl-anim">${trainMarkerSVG()}</div>`,
            className: "", iconSize: [28, 10], iconAnchor: [14, 5],
          });
          const marker = L.marker([t.lat, t.lon], { icon })
            .bindPopup(L.popup({ className: "tl-popup", maxWidth: 240, offset: [0, -4] }).setContent(popupContent))
            .addTo(g);
          marker._tlMeta = { type: "TRAIN", id: `Train ${t.tripId}`, detail: `${t.line} · ${t.stopName}` };
          trainMarkersRef.current.set(id, marker);
          addedCount++;
        }
      });

      // One batch summary line instead of per-train spam
      if (trains.length > 0 || removedCount > 0) {
        const net = addedCount - removedCount;
        const netStr = net > 0 ? ` (+${net})` : net < 0 ? ` (${net})` : "";
        addTerm("🚆", `Rail: ${trains.length} active${netStr}`, "#4488ff");
      }
    }).catch(() => {});
  }, [addLog, addTerm]);

  const fetchServices = useCallback((L: any) => {
    fetch("/api/map/services").then(r => r.json()).then(data => {
      const elements: any[] = data.elements ?? [];
      setServicesCount(elements.length);
      touchFeed("services");
      if (elements.length) addLog("📍", `${elements.length} city services mapped`, "#4ade80");
      const g = groupRefs.current.services;
      if (!g) return;
      g.clearLayers();
      elements.forEach(el => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (!lat || !lon) return;
        const amenity = el.tags?.amenity ?? "unknown";
        const name    = el.tags?.name ?? amenity.replace(/_/g, " ");
        const s       = SERVICE_CFG[amenity] ?? { color: "#5a7090", symbol: "•" };
        const addr    = [el.tags?.["addr:housenumber"], el.tags?.["addr:street"]].filter(Boolean).join(" ");
        const icon    = L.divIcon({ html: serviceSVG(amenity), className: "", iconSize: [20, 20], iconAnchor: [10, 10] });
        L.marker([lat, lon], { icon })
          .bindPopup(L.popup({ className: "tl-popup", maxWidth: 220, offset: [0, -4] }).setContent(
            popupWrap(`<div style="font-size:13px;font-weight:700;color:${s.color};margin-bottom:4px">${name}</div>
            <div style="color:#5a7090;text-transform:capitalize;font-size:10px">${amenity.replace(/_/g, " ")}</div>
            ${addr ? `<div style="color:#7a9ab0;font-size:10px;margin-top:3px">${addr}</div>` : ""}
            ${el.tags?.phone ? `<div style="color:#7a9ab0;font-size:10px">${el.tags.phone}</div>` : ""}`, "OpenStreetMap")))
          .addTo(g);
      });
    }).catch(() => {});
  }, [addLog]);

  const fetchTraffic = useCallback((L: any) => {
    fetch("/api/map/traffic").then(r => r.json()).then(data => {
      const events: any[] = data.events ?? [];
      const source: string = data.source ?? "overpass";
      setTrafficCount(events.length);
      touchFeed("traffic");
      setTrafficTexts(events.filter(ev => ev.lat && ev.lon).map(ev =>
        [ev.subtype || ev.type.replace(/_/g, " "), ev.road, ev.direction ? `(${ev.direction})` : null].filter(Boolean).join(" · ")
      ));
      const ft = Date.now();
      setOngoingItems(prev => {
        const trafficItems = events.map((ev: any, i: number) => ({
          id: `traffic-${ev.id || i}`,
          evtType: (ev.type ?? "TRAFFIC").replace(/_/g, " ").toUpperCase(),
          detail: [ev.subtype || ev.type.replace(/_/g, " "), ev.road, ev.direction ? `(${ev.direction})` : null].filter(Boolean).join(" · ").slice(0, 60),
          color: ev.color ?? "#f59e0b",
          startMs: ev.startMs ?? ft,
          fetchTime: ft,
        }));
        const nonTraffic = prev.filter(it => !it.id.startsWith("traffic-"));
        return [...nonTraffic, ...trafficItems];
      });
      const g = groupRefs.current.traffic;
      if (!g) return;
      animateOut(g, () => {
        g.clearLayers();
        if (events.length) {
          const label = source === "ct511" ? "CT 511" : "OSM";
          addLog("🚧", `${events.length} road event${events.length !== 1 ? "s" : ""} · ${label}`, "#f59e0b");
        }
        events.forEach(ev => {
          if (!ev.lat || !ev.lon) return;
          const typeLabel = ev.type.replace(/_/g, " ");
          const evStartMs: number | null = ev.startMs ?? null;
          const popupContent = popupWrap(
            `<div style="font-size:12px;font-weight:700;color:${ev.color};margin-bottom:4px">🚧 ${ev.subtype || typeLabel}</div>
            ${ev.road      ? `<div style="color:#7a9ab0">${ev.road}${ev.direction ? " · " + ev.direction : ""}</div>` : ""}
            ${ev.severity  ? `<div style="color:#5a7090;font-size:10px">Severity: ${ev.severity}</div>` : ""}
            ${ev.closure   ? `<div style="color:#ff2244;font-size:10px">&#9940; Full closure</div>` : ""}
            ${ev.description ? `<div style="color:#5a7090;font-size:10px;margin-top:3px">${ev.description}</div>` : ""}`,
            source === "ct511" ? "CT 511" : "OSM Overpass"
          );
          if (ev.roadCoords?.length >= 2) {
            // Draw highlighted road segment — orange
            L.polyline(ev.roadCoords, {
              color: "#f97316", weight: ev.closure ? 6 : 4,
              opacity: 0.82, dashArray: ev.closure ? undefined : "10 6",
              className: "tl-anim",
            }).bindPopup(L.popup({ className: "tl-popup", maxWidth: 240, offset: [0, -4] }).setContent(popupContent)).addTo(g);
            // Timer label below midpoint — no diamond
            const mid = ev.roadCoords[Math.floor(ev.roadCoords.length / 2)];
            if (evStartMs) {
              const timerHtml = `<span data-tl-mkr-onset="${evStartMs}" style="font-family:Menlo,Consolas,monospace;font-size:9px;color:#f97316cc;font-variant-numeric:tabular-nums;letter-spacing:0.06em;white-space:nowrap;text-shadow:0 0 4px #000">${fmtElapsed(Date.now() - evStartMs)}</span>`;
              L.marker(mid, {
                icon: L.divIcon({ html: timerHtml, className: "", iconSize: [60, 14], iconAnchor: [30, -4] }),
                interactive: false, keyboard: false,
              }).addTo(g);
            }
          } else if (ev.lat && ev.lon) {
            // Fallback: small orange dot (no diamond) for events with no road geometry
            const dotHtml = `<div style="width:7px;height:7px;border-radius:50%;background:#f97316;box-shadow:0 0 5px #f9731688;"></div>`;
            L.marker([ev.lat, ev.lon], {
              icon: L.divIcon({ html: dotHtml, className: "", iconSize: [7, 7], iconAnchor: [3, 3] }),
            }).bindPopup(L.popup({ className: "tl-popup", maxWidth: 240, offset: [0, -4] }).setContent(popupContent)).addTo(g);
          }
        });
      });
    }).catch(() => {});
  }, [addLog]);

  const drawSectors = useCallback((L: any) => {
    const g = groupRefs.current.sector;
    if (!g) return;
    g.clearLayers();
    const cx = crosshairLatLngRef.current.lat, cy = crosshairLatLngRef.current.lng;
    const RINGS_MI = [5, 10, 15, 20, 25];
    const OUTER_M  = 25 * 1609.344;

    // Concentric range rings
    RINGS_MI.forEach(mi => {
      const rm = mi * 1609.344;
      const pts: [number, number][] = Array.from({ length: 73 }, (_, i) => {
        const [la, lo] = destPoint(cx, cy, i * 5, rm);
        return [la, lo] as [number, number];
      });
      const isTen = mi === 10;
      L.polyline(pts, {
        color: "#22d3ee", weight: isTen ? 1 : 0.5,
        opacity: isTen ? 0.28 : 0.15,
        dashArray: isTen ? "6 9" : "2 14",
        interactive: false,
      }).addTo(g);
      // mi label just north of each ring
      const [lLat, lLon] = destPoint(cx, cy, 358, rm);
      L.marker([lLat, lLon], {
        icon: L.divIcon({
          html: `<span style="font-size:7.5px;color:#22d3ee90;font-family:Menlo,Consolas,monospace;font-weight:700;text-shadow:0 0 3px #000c">${mi}mi</span>`,
          className: "", iconSize: [28, 12], iconAnchor: [14, 12],
        }),
        interactive: false, keyboard: false,
      }).addTo(g);
    });

    // Bearing radials every 30°
    const LABEL: Record<number, string> = {
      0: "N", 30: "030", 60: "060", 90: "E",
      120: "120", 150: "150", 180: "S", 210: "210",
      240: "240", 270: "W", 300: "300", 330: "330",
    };
    for (let brg = 0; brg < 360; brg += 30) {
      const isMajor = brg % 90 === 0;
      const [rLat, rLon] = destPoint(cx, cy, brg, OUTER_M);
      L.polyline([[cx, cy], [rLat, rLon]], {
        color: "#22d3ee", weight: isMajor ? 0.8 : 0.4,
        opacity: isMajor ? 0.22 : 0.12,
        dashArray: "3 14",
        interactive: false,
      }).addTo(g);
      // Compass label beyond outer ring
      const [lbLat, lbLon] = destPoint(cx, cy, brg, OUTER_M * 1.14);
      L.marker([lbLat, lbLon], {
        icon: L.divIcon({
          html: `<span style="font-size:7px;color:#22d3ee80;font-family:Menlo,Consolas,monospace;text-shadow:0 0 3px #000c">${LABEL[brg]}</span>`,
          className: "", iconSize: [18, 12], iconAnchor: [9, 6],
        }),
        interactive: false, keyboard: false,
      }).addTo(g);
    }
  }, []);

  const fetchDispatch = useCallback((L: any) => {
    fetch("/api/map/dispatch").then(r => r.json()).then(data => {
      const incidents: any[] = data.incidents ?? [];
      setDispatchCount(incidents.length);
      touchFeed("dispatch");
      const dspFt = Date.now();
      setOngoingItems(prev => {
        const dspItems = incidents.map((inc: any, i: number) => ({
          id: `dispatch-${inc.id || i}`,
          evtType: "DISPATCH",
          detail: [inc.callType, inc.address].filter(Boolean).join(" · ").slice(0, 60),
          color: "#ff4466",
          startMs: inc.timestamp ? new Date(inc.timestamp).getTime() || dspFt : dspFt,
          fetchTime: dspFt,
        }));
        const nonDsp = prev.filter(it => !it.id.startsWith("dispatch-"));
        return [...nonDsp, ...dspItems];
      });
      const g = groupRefs.current.dispatch;
      if (!g) return;
      animateOut(g, () => {
        g.clearLayers();
        if (incidents.length) {
          addLog("🚨", `${incidents.length} active dispatch call${incidents.length !== 1 ? "s" : ""}`, "#ff4466");
          incidents.forEach(inc => {
            if (!inc.lat || !inc.lon) return;
            const icon = L.divIcon({ html: `<div class="tl-anim">${dispatchSVG(inc.callType)}</div>`, className: "", iconSize: [22, 22], iconAnchor: [11, 11] });
            L.marker([inc.lat, inc.lon], { icon })
              .bindPopup(L.popup({ className: "tl-popup", maxWidth: 220, offset: [0, -4] }).setContent(
                popupWrap(`<div style="font-size:12px;font-weight:700;color:#ff4466;margin-bottom:4px">🚨 ${inc.callType}</div>
                <div style="color:#7a9ab0">${inc.address}</div>
                ${inc.unit ? `<div style="color:#5a7090;font-size:10px">Unit: ${inc.unit}</div>` : ""}
                ${inc.timestamp ? `<div style="color:#5a7090;font-size:10px">${inc.timestamp}</div>` : ""}`, "911 Dispatch")))
              .addTo(g);
          });
        }
      });
    }).catch(() => {});
  }, [addLog]);

  const fetchMarine = useCallback((L: any) => {
    fetch("/api/map/marine").then(r => r.json()).then(data => {
      const stations: any[] = data.stations ?? [];
      setMarineCount(stations.length);
      touchFeed("marine");
      setMarineTexts(stations.map((st: any) => {
        const bits: string[] = [st.name];
        if (st.waterLevel != null) bits.push(`Tide ${st.waterLevel > 0 ? "+" : ""}${st.waterLevel}ft`);
        if (st.waterTemp  != null) bits.push(`Water ${st.waterTemp}°F`);
        if (st.windSpeed  != null) bits.push(`Wind ${st.windSpeed}kt${st.windDir != null ? " " + degToCompass(st.windDir) : ""}`);
        return bits.join(" · ");
      }));
      const g = groupRefs.current.marine;
      if (!g) return;
      animateOut(g, () => {
        g.clearLayers();
        if (!stations.length) return;
        addLog("⚓", `${stations.length} marine station${stations.length !== 1 ? "s" : ""} reporting`, "#06b6d4");
        stations.forEach(st => {
          const icon = L.divIcon({ html: `<div class="tl-anim">${marineSVG(st.type)}</div>`, className: "", iconSize: [30, 30], iconAnchor: [15, 15] });
          const rows = [
            st.waterLevel != null ? `<span style="color:#5a7090">TIDE</span><span>${st.waterLevel > 0 ? "+" : ""}${st.waterLevel} ft MLLW</span>` : "",
            st.waterTemp  != null ? `<span style="color:#5a7090">WTEMP</span><span>${st.waterTemp}°F</span>` : "",
            st.airTemp    != null ? `<span style="color:#5a7090">ATEMP</span><span>${st.airTemp}°F</span>` : "",
            st.windSpeed  != null ? `<span style="color:#5a7090">WIND</span><span>${st.windSpeed} kt${st.windGust != null ? " G" + st.windGust : ""}${st.windDir != null ? " " + degToCompass(st.windDir) : ""}</span>` : "",
            st.waveHeight != null ? `<span style="color:#5a7090">WAVE</span><span>${st.waveHeight} ft</span>` : "",
          ].filter(Boolean).join("");
          L.marker([st.lat, st.lon], { icon })
            .bindPopup(L.popup({ className: "tl-popup", maxWidth: 230, offset: [0, -4] }).setContent(
              popupWrap(`<div style="font-size:12px;font-weight:700;color:#06b6d4;margin-bottom:4px">${st.type === "buoy" ? "⚓" : "≈"} ${st.name}</div>
              <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 12px">${rows}</div>
              ${st.updated ? `<div style="color:#2a3a52;font-size:9px;margin-top:5px">${st.updated} UTC</div>` : ""}`, "NOAA NDBC")))
            .addTo(g);
        });
      });
    }).catch(() => {});
  }, [addLog]);

  const fetchBuildings = useCallback((L: any) => {
    fetch("/api/map/buildings").then(r => r.json()).then(data => {
      const buildings: number[][] = data.buildings ?? [];
      setBuildingsCount(buildings.length);
      if (!buildings.length) return;
      const g = groupRefs.current.buildings;
      if (!g) return;
      g.clearLayers();
      addLog("🏙", `${buildings.length.toLocaleString()} city lights mapped`, "#fbbf24");
      const canvas = L.canvas({ padding: 0.5 });
      buildings.forEach(([lat, lon]) => {
        L.circleMarker([lat, lon], {
          radius: 3,
          color: "#fbbf24",
          fillColor: "#fef3c7",
          fillOpacity: 0.85,
          opacity: 0.7,
          weight: 0,
          renderer: canvas,
        }).addTo(g);
      });
    }).catch(() => {});
  }, [addLog]);

  const fetchMetar = useCallback((L: any) => {
    fetch("/api/map/metar").then(r => r.json()).then(data => {
      const stations: any[] = data.stations ?? [];
      setMetarCount(stations.length);
      touchFeed("metar");
      const g = groupRefs.current.metar;
      if (!g) return;
      const items: { text: string; color: string }[] = [];
      const seenIds = new Set<string>();

      stations.forEach((st: any) => {
        const color = fltColor(st.fltCat ?? "");
        seenIds.add(st.icaoId);
        // Log only when the observation time changes (new METAR or SPECI received)
        const prev = metarObsRef.current[st.icaoId];
        const obsChanged = prev !== st.obsTime;
        if (obsChanged) {
          metarObsRef.current[st.icaoId] = st.obsTime;
          addLog("⛅", `${st.icaoId} ${st.fltCat ?? "?"} · ${st.wspd ?? 0}kt ${st.wdir != null ? degToCompass(st.wdir) : ""}`.trim(), color);
          addTerm("⛅", `${st.icaoId} ${st.fltCat ?? "?"} ${st.wspd ?? 0}kt ${st.wdir != null ? degToCompass(st.wdir) : ""} vis:${st.visib ?? "?"}SM`.trim(), color);
        }
        const cToF = (c: number | null) => c != null ? Math.round(c * 9 / 5 + 32) : null;
        const wind = st.wspd != null
          ? `${st.wdir ?? "VRB"}°/${st.wspd}${st.wgst ? "G" + st.wgst : ""}KT`
          : "CALM";
        const skyLayers = [
          st.cover  && st.cldBas1 != null ? `${st.cover} ${(st.cldBas1 * 100).toLocaleString()}ft`  : st.cover  ?? null,
          st.cover2 && st.cldBas2 != null ? `${st.cover2} ${(st.cldBas2 * 100).toLocaleString()}ft` : null,
          st.cover3 && st.cldBas3 != null ? `${st.cover3} ${(st.cldBas3 * 100).toLocaleString()}ft` : null,
        ].filter(Boolean).join(" · ") || "SKC";
        const obsZ = st.obsTime ? new Date(st.obsTime * 1000).toUTCString().slice(17, 22) + "Z" : "";
        const popup = popupWrap(`
          <div style="font-size:12px;font-weight:700;color:${color};margin-bottom:2px">${st.icaoId} · ${st.name ?? ""}</div>
          <div style="color:#2a3a52;font-size:8px;margin-bottom:6px">${obsZ}</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin-bottom:6px">
            <span style="color:#5a7090">CAT</span><span style="color:${color};font-weight:700">${st.fltCat ?? "?"}</span>
            <span style="color:#5a7090">WIND</span><span>${wind}</span>
            <span style="color:#5a7090">VIS</span><span>${st.visib != null ? st.visib + " SM" : "?"}</span>
            <span style="color:#5a7090">SKY</span><span>${skyLayers}</span>
            ${cToF(st.temp) != null ? `<span style="color:#5a7090">T/DP</span><span>${cToF(st.temp)}°F / ${cToF(st.dewp) ?? "?"}°F</span>` : ""}
            ${st.altim != null ? `<span style="color:#5a7090">ALT</span><span>${(st.altim * 0.02953).toFixed(2)} inHg</span>` : ""}
            ${st.wxString ? `<span style="color:#5a7090">WX</span><span>${st.wxString}</span>` : ""}
          </div>
          <div style="color:#2a3a52;font-size:7.5px;word-break:break-all;border-top:1px solid #0d1a26;padding-top:4px;line-height:1.6">${st.rawOb ?? ""}</div>
        `, "METAR / FAA");
        const icon = L.divIcon({
          html: `<div${obsChanged ? ' class="tl-anim"' : ""}>${metarCircleSVG(st.icaoId, st.fltCat ?? "?", st.wspd ?? null, st.wdir ?? null, st.wxString ?? null, st.cover ?? null)}</div>`,
          className: "", iconSize: [80, 88], iconAnchor: [40, 42],
        });

        if (metarMarkersRef.current.has(st.icaoId)) {
          const m = metarMarkersRef.current.get(st.icaoId);
          if (obsChanged) m.setIcon(icon);
          m.getPopup()?.setContent(popup);
        } else {
          const m = L.marker([st.lat, st.lon], { icon })
            .bindPopup(L.popup({ className: "tl-popup", maxWidth: 270, offset: [0, -4] }).setContent(popup))
            .addTo(g);
          metarMarkersRef.current.set(st.icaoId, m);
        }
        items.push({
          text: `⛅ ${st.icaoId} ${st.fltCat} · ${wind} · Vis ${st.visib ?? "?"}SM · ${skyLayers}${cToF(st.temp) != null ? ` · ${cToF(st.temp)}°F` : ""}`,
          color,
        });
      });

      // Remove stations no longer in the feed
      metarMarkersRef.current.forEach((m, id) => {
        if (!seenIds.has(id)) {
          g.removeLayer(m);
          metarMarkersRef.current.delete(id);
        }
      });
      setMetarItems(items);
    }).catch(() => {});
  }, [addLog, addTerm]);

  const fetchStorm = useCallback((L: any) => {
    fetch("/api/map/storm").then(r => r.json()).then(data => {
      const stations: any[] = data.stations ?? [];
      setStormCount(stations.length);
      touchFeed("storm");
      const g = groupRefs.current.storm;
      if (!g) return;
      const raining = stations.filter((s: any) => s.precip1hIn != null && s.precip1hIn > 0.005);
      if (raining.length) addLog("🌧", `Precip: ${raining.map((s: any) => `${s.id} ${s.precip1hIn.toFixed(2)}"`)  .join(", ")}`, "#38bdf8");
      animateOut(g, () => {
        g.clearLayers();
        stations.forEach((st: any) => {
          const color = (st.precip1hIn ?? 0) > 0.005 ? "#38bdf8" : "#4a7a8a";
          const precipStr = st.precip1hIn != null ? st.precip1hIn.toFixed(3) + '"' : "n/a";
          const precip6Str = st.precip6hIn != null ? st.precip6hIn.toFixed(2) + '"' : "n/a";
          const precip24Str = st.precip24hIn != null ? st.precip24hIn.toFixed(2) + '"' : "n/a";
          const windRow = st.windKt != null
            ? `${st.windKt}kt${st.windGustKt != null ? " G" + st.windGustKt : ""}${st.windDir != null ? " " + degToCompass(st.windDir) : ""}`
            : "calm";
          const obsStr = st.obsTime ? new Date(st.obsTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) + "Z" : "";
          const popup = popupWrap(`
            <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:2px">${st.id} · ${st.name}</div>
            <div style="color:#2a3a52;font-size:8px;margin-bottom:6px">${st.description ?? ""} ${obsStr}</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 12px">
              <span style="color:#5a7090">TEMP</span><span>${st.tempF != null ? st.tempF + "°F" : "—"}${st.dewpF != null ? " / Dp " + st.dewpF + "°F" : ""}</span>
              <span style="color:#5a7090">WIND</span><span>${windRow}</span>
              ${st.slpInHg != null ? `<span style="color:#5a7090">PRES</span><span>${st.slpInHg.toFixed(2)} inHg</span>` : ""}
              <span style="color:#5a7090">PCPN 1H</span><span style="color:${color}">${precipStr}</span>
              <span style="color:#5a7090">PCPN 6H</span><span>${precip6Str}</span>
              <span style="color:#5a7090">PCPN 24H</span><span>${precip24Str}</span>
              ${st.humidity != null ? `<span style="color:#5a7090">RH</span><span>${Math.round(st.humidity)}%</span>` : ""}
            </div>`, "ASOS / NOAA");
          const icon = L.divIcon({
            html: `<div class="tl-anim">${stormSVG(st.id, st.precip1hIn, st.windKt, st.windDir)}</div>`,
            className: "", iconSize: [7, 7], iconAnchor: [3, 3],
          });
          L.marker([st.lat, st.lon], { icon })
            .bindPopup(L.popup({ className: "tl-popup", maxWidth: 260, offset: [0, -4] }).setContent(popup))
            .addTo(g);
        });
      });
    }).catch(() => {});
  }, [addLog]);

  const fetchOutages = useCallback((L: any) => {
    fetch("/api/map/outages").then(r => r.json()).then(data => {
      const towns: any[] = data.outages ?? [];
      const summary = data.summary;
      const total: number = summary?.totalAffected ?? towns.reduce((s: number, t: any) => s + (t.custAffected ?? 0), 0);
      setOutagesCount(towns.length);
      touchFeed("outages");
      setOutagesTotal(total);
      const g = groupRefs.current.outages;
      if (!g) return;
      if (total > 0) addLog("⚡", `Eversource: ${total.toLocaleString()} customers without power (CT)`, "#facc15");
      const prevTotal = outagesTotalRef.current;
      const diff = total - prevTotal;
      outagesTotalRef.current = total;
      const diffStr = diff !== 0 ? ` (${diff > 0 ? "+" : ""}${diff.toLocaleString()})` : "";
      addTerm("⚡", `Outages: ${total.toLocaleString()} affected${diffStr}`, "#facc15");
      animateOut(g, () => {
        g.clearLayers();
        towns.forEach((t: any) => {
          // Normalize town name: replace spaces with underscores for lookup
          const key = (t.town as string).toUpperCase().replace(/ /g, "_");
          const coords = CT_TOWNS[key];
          if (!coords) return;
          const color = outageColor(t.pct ?? 0);
          const popup = popupWrap(`
            <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:4px">⚡ ${t.town}</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 12px">
              <span style="color:#5a7090">AFFECTED</span><span style="color:${color};font-weight:700">${(t.custAffected ?? 0).toLocaleString()}</span>
              <span style="color:#5a7090">SERVED</span><span>${(t.custServed ?? 0).toLocaleString()}</span>
              <span style="color:#5a7090">PCT OUT</span><span style="color:${color}">${t.pct ?? "?"}%</span>
            </div>`, "Eversource CT");
          L.circleMarker(coords, {
            radius: outageRadius(t.custAffected ?? 0),
            color, weight: 1.5, fillColor: color, fillOpacity: 0.25, opacity: 0.9,
          })
            .bindPopup(L.popup({ className: "tl-popup", maxWidth: 220, offset: [0, -4] }).setContent(popup))
            .addTo(g);
        });
      });
    }).catch(() => {});
  }, [addLog]);

  const fetchNews = useCallback(() => {
    fetch("/api/map/news")
      .then(r => r.json())
      .then(d => setNewsItems(d.items ?? []))
      .catch(() => {});
  }, []);

  const fetchWeather = useCallback(() => {
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${STAMFORD.lat}&longitude=${STAMFORD.lng}` +
      `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,cloud_cover,relative_humidity_2m,precipitation` +
      `&hourly=temperature_2m,weather_code,precipitation_probability&forecast_hours=24` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&forecast_days=7` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America/New_York`
    ).then(r => r.json()).then(d => {
      const c = d.current;
      setWeather({ temp: c.temperature_2m, wind_speed: c.wind_speed_10m, wind_dir: c.wind_direction_10m,
        humidity: c.relative_humidity_2m, cloud_cover: c.cloud_cover, precipitation: c.precipitation, code: c.weather_code });
      touchFeed("weather");
      // Parse hourly (next 8 hours from now)
      if (d.hourly?.time?.length) {
        const nowMs = Date.now();
        const hourly: HourlyFc[] = [];
        for (let i = 0; i < d.hourly.time.length && hourly.length < 8; i++) {
          if (new Date(d.hourly.time[i]).getTime() < nowMs - 30 * 60_000) continue;
          hourly.push({ hour: new Date(d.hourly.time[i]).getHours(), temp: Math.round(d.hourly.temperature_2m[i]), code: d.hourly.weather_code[i] ?? 0, precip: d.hourly.precipitation_probability[i] ?? 0 });
        }
        setHourlyForecast(hourly);
      }
      // Parse daily (7 days)
      if (d.daily?.time?.length) {
        setDailyForecast(d.daily.time.map((ds: string, i: number) => ({
          date: ds, max: Math.round(d.daily.temperature_2m_max[i]), min: Math.round(d.daily.temperature_2m_min[i]),
          code: d.daily.weather_code[i] ?? 0, precip: d.daily.precipitation_probability_max[i] ?? 0,
        })));
      }
    }).catch(() => {});
  }, []);

  // ── Lightning WebSocket ───────────────────────────────────────────────────

  const setupLightning = useCallback((L: any) => {
    const SERVERS = ["wss://ws1.blitzortung.org:3000/", "wss://ws2.blitzortung.org:3000/", "wss://ws3.blitzortung.org:3000/"];
    let idx = 0;
    function connect() {
      if (idx >= SERVERS.length) { setWsStatus("offline"); return; }
      setWsStatus("connecting");
      const ws = new WebSocket(SERVERS[idx]);
      lightningWsRef.current = ws;
      ws.onopen = () => { ws.send(JSON.stringify({ a: 111 })); setWsStatus("live"); touchFeed("lightning"); };
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data as string);
          let lat = d.lat, lon = d.lon;
          if (lat == null || lon == null) return;
          if (Math.abs(lat) > 90) { lat /= 1e7; lon /= 1e7; }
          if (lat < 38.5 || lat > 43.5 || lon < -76.5 || lon > -70.5) return;
          const g = groupRefs.current.lightning;
          if (!g) return;
          const local = lat > 40.9 && lat < 41.2 && lon > -73.7 && lon < -73.4;
          if (local) addLog("⚡", `Lightning strike at ${lat.toFixed(3)}°N`, "#ffe066");
          const marker = L.circleMarker([lat, lon], {
            radius: local ? 14 : 6,
            color: local ? "#ffffff" : "#ffe066",
            fillColor: local ? "#fffde0" : "#ffe066",
            fillOpacity: local ? 1 : 0.85,
            opacity: 1,
            weight: local ? 2.5 : 1,
          });
          marker.bindTooltip(`⚡ ${lat.toFixed(3)}, ${lon.toFixed(3)}`, { className: "tl-tt", sticky: true });
          g.addLayer(marker);
          lightningMarkersRef.current.push({ marker, born: Date.now() });
          touchFeed("lightning");
          strikeCountMinRef.current += 1;
        } catch {}
      };
      ws.onclose = () => { setWsStatus("offline"); idx++; setTimeout(connect, 4000); };
      ws.onerror = () => ws.close();
    }
    connect();
  }, [addLog]);

  // ── AIS stream WebSocket ─────────────────────────────────────────────────

  const setupAIS = useCallback((L: any) => {
    const apiKey = process.env.NEXT_PUBLIC_AISSTREAM_KEY;
    if (!apiKey) {
      addTerm("⛵", "AIS: key not configured (NEXT_PUBLIC_AISSTREAM_KEY)", "#ef4444");
      return;
    }

    const NAV_STATUS: Record<number, string> = {
      0: "Underway (engine)", 1: "At anchor", 2: "Not under command",
      3: "Restricted maneuv.", 4: "Constrained by draught", 5: "Moored",
      6: "Aground", 7: "Fishing", 8: "Underway (sailing)",
    };

    function placeVessel(mmsi: number, lat: number, lon: number, hdg: number, sog: number, name: string, status: string) {
      const g = groupRefs.current.vessels;
      if (!g) return;
      vesselLastSeenRef.current.set(mmsi, Date.now());
      const popupHtml = popupWrap(
        `<div style="font-size:13px;font-weight:700;color:#0ea5e9;margin-bottom:5px">${name}</div>
        <div style="color:#5a7090;font-size:10px;margin-bottom:8px">MMSI ${mmsi}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 14px">
          <span style="color:#5a7090">SOG</span><span>${sog.toFixed(1)} kt</span>
          <span style="color:#5a7090">HDG</span><span>${Math.round(hdg)}° ${degToCompass(Math.round(hdg))}</span>
          <span style="color:#5a7090">STATUS</span><span style="grid-column:span 1;font-size:9px">${status}</span>
        </div>`,
        "AIS / AISstream"
      );
      const makeIcon = (anim: boolean) => L.divIcon({
        html: `<div${anim ? ' class="tl-anim"' : ""}>${shipSVG(hdg, sog)}</div>`,
        className: "", iconSize: [20, 20], iconAnchor: [10, 10],
      });
      const vesselMeta = { type: "VESSEL", id: name, detail: `MMSI ${mmsi} · ${sog.toFixed(1)}kt · ${degToCompass(Math.round(hdg))}` };
      if (vesselMarkersRef.current.has(mmsi)) {
        const m = vesselMarkersRef.current.get(mmsi);
        m.setLatLng([lat, lon]);
        m.setIcon(makeIcon(false));
        m.getPopup()?.setContent(popupHtml);
        m._tlMeta = vesselMeta;
      } else {
        const m = L.marker([lat, lon], { icon: makeIcon(true) })
          .bindPopup(L.popup({ className: "tl-popup", maxWidth: 240, offset: [0, -4] }).setContent(popupHtml))
          .addTo(g);
        m._tlMeta = vesselMeta;
        vesselMarkersRef.current.set(mmsi, m);
        newVesselBatchRef.current.push(name);
      }
      setVesselCount(vesselMarkersRef.current.size);
    }

    let attempt = 0;
    function connect() {
      const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
      vesselWsRef.current = ws;

      ws.onopen = () => {
        attempt = 0; // reset only on clean open so backoff accumulates on rapid failures
        ws.send(JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: [[[-90, -180], [90, 180]]],
        }));
        addTerm("⛵", "AIS stream connected — LI Sound + NY Harbor", "#0ea5e9");
        touchFeed("vessels");
      };

      ws.onmessage = async (e) => {
        try {
          const text = e.data instanceof Blob ? await e.data.text() : (e.data as string);
          const msg = JSON.parse(text);
          const meta = msg.MetaData ?? {};
          const mmsi = meta.MMSI as number;
          const name = ((meta.ShipName ?? "") as string).trim() || `MMSI ${mmsi}`;

          let pos: any = null;
          if (msg.MessageType === "PositionReport") {
            pos = msg.Message?.PositionReport;
          } else if (msg.MessageType === "ClassBPositionReport") {
            pos = msg.Message?.ClassBPositionReport;
          }
          if (!pos || !mmsi) return;

          const lat = pos.Latitude  ?? meta.Latitude;
          const lon = pos.Longitude ?? meta.Longitude;
          if (lat == null || lon == null || Math.abs(lat) > 90) return;
          // Filter to LI Sound + NY Harbor region client-side
          if (lat < 40.3 || lat > 41.6 || lon < -74.5 || lon > -71.5) return;

          const hdg = (pos.TrueHeading != null && pos.TrueHeading < 360) ? pos.TrueHeading
            : (pos.Cog != null && pos.Cog < 360) ? pos.Cog : 0;
          const sog = (pos.Sog != null && pos.Sog < 102) ? pos.Sog : 0;
          const status = NAV_STATUS[pos.NavigationalStatus ?? 15] ?? "Unknown";

          placeVessel(mmsi, lat, lon, hdg, sog, name, status);
        } catch {}
      };

      ws.onclose = (ev) => {
        attempt++;
        const delayS = Math.min(10 * Math.pow(2, attempt - 1), 300); // 10s, 20s, 40s … 5min
        addTerm("⛵", `AIS disconnected (${ev.code}) — retry in ${delayS}s (#${attempt})`, "#94a3b8");
        setTimeout(connect, delayS * 1000);
      };
      ws.onerror = () => ws.close();
    }
    connect();
  }, [addTerm]);

  // ── Main init effect ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;

    import("leaflet").then(mod => {
      const L = mod.default;

      lRef.current = L;
      const map = L.map(mapRef.current!, { zoomControl: false, attributionControl: false, minZoom: 5, maxZoom: 19 });
      map.fitBounds(STAMFORD_BOUNDS, { padding: [0, 0] });

      // Base tile — dark default
      const baseDef = BASE_LAYERS.dark;
      baseTileRef.current = L.tileLayer(baseDef.url, { subdomains: baseDef.subdomains ?? "abc", minNativeZoom: baseDef.minNativeZoom, maxNativeZoom: baseDef.maxNativeZoom, maxZoom: 19, className: "tl-base-tile" }).addTo(map);

      map.on("zoomend", () => {
        const z = map.getZoom();
        mapRef.current?.setAttribute("data-zoom", String(Math.round(z)));
      });
      mapRef.current?.setAttribute("data-zoom", "12");

      // Popup age counter + targeting reticle
      map.on("popupopen", (e: any) => {
        // Start live age counter
        const ageEl = e.popup.getElement?.()?.querySelector(".tl-popup-age");
        const valEl = ageEl?.querySelector(".tl-age-val");
        if (ageEl && valEl) {
          const built = parseInt(ageEl.getAttribute("data-built") || "0");
          if (built) {
            const tick = () => { valEl.textContent = `${Math.round((Date.now() - built) / 1000)}s ago`; };
            tick();
            e.popup._tlAgeTimer = setInterval(tick, 1000);
          }
        }
        // Add locked reticle on the source marker (replaces scanning reticle if one exists)
        const src = e.popup.getSourceLayer?.() ?? e.popup._source;
        if (src?.getLatLng) {
          const ll = src.getLatLng();
          if (reticleMarkerRef.current) map.removeLayer(reticleMarkerRef.current);
          reticleMarkerRef.current = L.marker(ll, {
            icon: L.divIcon({ html: reticleHTML(false), className: "", iconSize: [44, 44], iconAnchor: [22, 22] }),
            interactive: false, keyboard: false, zIndexOffset: -1000,
          }).addTo(map);
          reticleSrcRef.current = src; // track source for position following
        }
      });
      map.on("popupclose", (e: any) => {
        if (e.popup._tlAgeTimer) { clearInterval(e.popup._tlAgeTimer); e.popup._tlAgeTimer = null; }
        reticleSrcRef.current = null;
        // Animate reticle out before removing
        if (reticleMarkerRef.current) {
          const rEl = reticleMarkerRef.current.getElement?.();
          const inner = rEl?.querySelector(".tl-reticle") as HTMLElement | null;
          if (inner) {
            inner.classList.remove("tl-reticle-lock", "tl-reticle-scan");
            inner.classList.add("tl-reticle-unlock");
          }
          const rm = reticleMarkerRef.current;
          reticleMarkerRef.current = null;
          setTimeout(() => { try { map.removeLayer(rm); } catch {} }, 220);
        }
      });

      // Data layer groups
      groupRefs.current = {
        aircraft:  L.layerGroup().addTo(map),
        radar:     L.layerGroup().addTo(map),
        iss:       L.layerGroup().addTo(map),
        alerts:    L.layerGroup().addTo(map),
        lightning: L.layerGroup().addTo(map),
        transit:   L.layerGroup().addTo(map),
        rail:      L.layerGroup().addTo(map),
        services:  L.layerGroup().addTo(map),
        traffic:   L.layerGroup().addTo(map),
        dispatch:  L.layerGroup().addTo(map),
        buildings: L.layerGroup().addTo(map),
        marine:    L.layerGroup().addTo(map),
        vessels:   L.layerGroup().addTo(map),
        metar:     L.layerGroup().addTo(map),
        storm:     L.layerGroup().addTo(map),
        outages:   L.layerGroup().addTo(map),
        sector:    L.layerGroup().addTo(map),
      };

      mapInst.current = map;

      // Stamford city boundary (glowing cyan line)
      fetch("/api/map/boundary").then(r => r.json()).then(data => {
        if (!data.geojson) return;
        // Outer glow pass (very faint)
        L.geoJSON(data.geojson, {
          style: { color: "#22d3ee", weight: 5, opacity: 0.04, fill: false },
        }).addTo(map);
        // Inner crisp line (subtle dashed)
        const boundaryLayer = L.geoJSON(data.geojson, {
          style: { color: "#22d3ee", weight: 1, opacity: 0.22, fill: true, fillColor: "#22d3ee", fillOpacity: 0.008, dashArray: "12 9" },
        }).addTo(map);
        boundaryLayer.eachLayer((layer: any) => {
          const el = layer.getElement?.();
          if (el) el.classList.add("stamford-boundary-path");
        });
        addLog("◈", "Stamford perimeter established", "#22d3ee");
      }).catch(() => {});

      // Center px tracking — follows crosshairLatLngRef (geocoded at startup)
      const updateCenterPx = () => {
        const pos = crosshairLatLngRef.current;
        const pt = map.latLngToContainerPoint([pos.lat, pos.lng]);
        setCenterPx({ x: pt.x, y: pt.y });
      };
      map.on("move zoom resize", updateCenterPx);
      updateCenterPx();

      // Geocode crosshair (37 Douglas Ave) then blue-dot (150 Butternut Ln)
      // Chained to respect Nominatim 1 req/sec rate limit
      const nominatim = (q: string) =>
        fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`, {
          headers: { "User-Agent": "ThunderLakeSystems/1.0 (tlevander.py@gmail.com)" },
        }).then(r => r.json()).then((d: any[]) => d[0] ? { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) } : null).catch(() => null);

      nominatim("37 Douglas Ave, Stamford, CT")
        .then(pos => {
          if (pos) {
            crosshairLatLngRef.current = pos;
            updateCenterPx();
            drawSectors(L); // redraw sector rings from TLS position
          }
          return new Promise<void>(res => setTimeout(res, 1200));
        })
        .then(() => nominatim("150 Butternut Lane, Stamford, CT"))
        .then(pos => {
          if (!pos) return;
          const bnHtml = `<div style="position:relative;width:34px;height:34px">
            <div style="position:absolute;top:50%;left:14px;width:14px;height:1px;background:rgba(255,255,255,0.7)"></div>
            <div style="position:absolute;top:50%;right:14px;width:14px;height:1px;background:rgba(255,255,255,0.7);transform:translateX(100%)"></div>
            <div style="position:absolute;left:50%;top:14px;width:1px;height:14px;background:rgba(255,255,255,0.7)"></div>
            <div style="position:absolute;left:50%;bottom:14px;width:1px;height:14px;background:rgba(255,255,255,0.7);transform:translateY(100%)"></div>
            <div style="position:absolute;top:50%;left:50%;width:6px;height:6px;border-radius:50%;background:#ffffff;transform:translate(-50%,-50%);box-shadow:0 0 6px rgba(255,255,255,0.9),0 0 14px rgba(255,255,255,0.3)"></div>
            <div style="position:absolute;top:calc(50% + 7px);left:calc(50% + 7px);font-family:Menlo,Consolas,monospace;font-size:9px;color:rgba(255,255,255,0.8);letter-spacing:0.14em;text-shadow:0 0 4px rgba(0,0,0,0.9)">BN</div>
          </div>`;
          const icon = L.divIcon({ html: bnHtml, className: "", iconSize: [34, 34], iconAnchor: [17, 17] });
          L.marker([pos.lat, pos.lng], { icon })
            .bindTooltip("150 Butternut Ln", { className: "tl-tt", sticky: true })
            .addTo(map);
        })
        .catch(() => {});

      // Initial fetches
      fetchAircraft(L); fetchRadar(L); fetchISS(L); fetchAlerts(L);
      fetchRailTrack(L);
      fetchTransit(L); fetchRail(L); fetchServices(L); fetchTraffic(L); fetchDispatch(L);
      drawSectors(L);
      fetchMarine(L); fetchBuildings(L); fetchMetar(L); fetchStorm(L); fetchOutages(L); // buildings: one-time load, 24h server cache

      // Polling
      intervals.current.push(setInterval(() => fetchAircraft(L), 15_000));
      intervals.current.push(setInterval(() => fetchISS(L), 6_000));
      intervals.current.push(setInterval(() => fetchRadar(L), 2 * 60_000));
      intervals.current.push(setInterval(() => fetchAlerts(L), 10 * 60_000));
      intervals.current.push(setInterval(() => fetchTransit(L), 30_000));
      intervals.current.push(setInterval(() => fetchRail(L), 30_000));
      intervals.current.push(setInterval(() => fetchServices(L), 15 * 60_000));
      intervals.current.push(setInterval(() => fetchTraffic(L), 5 * 60_000));
      intervals.current.push(setInterval(() => fetchDispatch(L), 30_000));
      intervals.current.push(setInterval(() => fetchMarine(L), 30 * 60_000));
      intervals.current.push(setInterval(() => fetchMetar(L), 60_000));
      intervals.current.push(setInterval(() => fetchStorm(L), 15 * 60_000));
      intervals.current.push(setInterval(() => fetchOutages(L), 15 * 60_000));

      // Animation: dead-reckon aircraft + interpolate trains between API polls
      intervals.current.push(setInterval(() => {
        const now = Date.now();
        aircraftStateRef.current.forEach((s, id) => {
          const m = aircraftMarkersRef.current.get(id);
          if (!m || s.speedMs < 20) return;
          const elapsedS = Math.min((now - s.lastMs) / 1000, 60);
          m.setLatLng(destPoint(s.lat, s.lon, s.heading, s.speedMs * elapsedS));
        });
        trainStateRef.current.forEach((s, id) => {
          const m = trainMarkersRef.current.get(id);
          if (!m) return;
          const span = s.nextArrMs - s.prevDepMs;
          if (span <= 0) return;
          const frac = Math.min(1, Math.max(0, (now - s.prevDepMs) / span));
          const [lat, lon, brg] = interpolateOnTrack(
            s.track, [s.prevLat, s.prevLon], [s.nextLat, s.nextLon], frac
          );
          m.setLatLng([lat, lon]);
          const inner = m._icon?.querySelector?.(".tl-train-icon") as HTMLElement | null;
          if (inner) inner.style.transform = `scale(${trainScaleRef.current}) rotate(${(brg - 90 + 360) % 360}deg)`;
        });
        // Apply scale to stationary trains not being interpolated above
        trainMarkersRef.current.forEach((m, id) => {
          if (trainStateRef.current.has(id)) return;
          const inner = m._icon?.querySelector?.(".tl-train-icon") as HTMLElement | null;
          if (inner && !inner.style.transform.includes("rotate")) inner.style.transform = `scale(${trainScaleRef.current})`;
        });
        // Reticle follows moving source marker
        if (reticleSrcRef.current && reticleMarkerRef.current) {
          try { reticleMarkerRef.current.setLatLng(reticleSrcRef.current.getLatLng()); } catch {}
        }
        // Autotrack: map continuously pans to follow tracked marker
        if (ssModeRef.current && ssTrackMarkerRef.current) {
          try {
            const map2 = mapInst.current;
            if (map2) map2.panTo(ssTrackMarkerRef.current.getLatLng(), { animate: true, duration: 0.12, easeLinearity: 1.0, noMoveStart: true });
          } catch {}
        }
        // Screensaver: distance-based opacity fade from TLS center
        if (ssModeRef.current) {
          const tlsLat = crosshairLatLngRef.current.lat;
          const tlsLng = crosshairLatLngRef.current.lng;
          aircraftMarkersRef.current.forEach(m => {
            try { const ll = m.getLatLng(); m.setOpacity(ssDistOpacity(distToStamford(ll.lat, ll.lng, tlsLat, tlsLng))); } catch {}
          });
          trainMarkersRef.current.forEach(m => {
            try { const ll = m.getLatLng(); m.setOpacity(ssDistOpacity(distToStamford(ll.lat, ll.lng, tlsLat, tlsLng))); } catch {}
          });
          vesselMarkersRef.current.forEach(m => {
            try { const ll = m.getLatLng(); m.setOpacity(ssDistOpacity(distToStamford(ll.lat, ll.lng, tlsLat, tlsLng))); } catch {}
          });
        }
      }, 100));

      // Lightning
      setupLightning(L);

      // AIS ship stream
      setupAIS(L);

      // Vessel expiry (5 min without update) + batch terminal log
      intervals.current.push(setInterval(() => {
        const now = Date.now();
        const g = groupRefs.current.vessels;
        vesselLastSeenRef.current.forEach((t, mmsi) => {
          if (now - t > 5 * 60_000) {
            const m = vesselMarkersRef.current.get(mmsi);
            if (m && g) g.removeLayer(m);
            vesselMarkersRef.current.delete(mmsi);
            vesselLastSeenRef.current.delete(mmsi);
          }
        });
        setVesselCount(vesselMarkersRef.current.size);
        if (vesselMarkersRef.current.size > 0) touchFeed("vessels");
        const batch = newVesselBatchRef.current.splice(0);
        if (batch.length > 0) {
          const total = vesselMarkersRef.current.size;
          const detail = batch.length === 1 ? batch[0] : `${batch.length} new (${total} total)`;
          addTerm("⛵", `AIS: ${detail}`, "#0ea5e9");
        }
      }, 15_000));

      // Strike fade
      intervals.current.push(setInterval(() => {
        const now = Date.now();
        lightningMarkersRef.current = lightningMarkersRef.current.filter(({ marker, born }) => {
          const age = now - born;
          if (age > 90_000) { groupRefs.current.lightning?.removeLayer(marker); return false; }
          const o = Math.max(0, 1 - age / 90_000);
          marker.setStyle({ fillOpacity: o * 0.9, opacity: o });
          return true;
        });
        setStrikeCount(lightningMarkersRef.current.length);
      }, 1000));

      // Strike rate
      intervals.current.push(setInterval(() => {
        setStrikesPerMin(strikeCountMinRef.current);
        strikeCountMinRef.current = 0;
      }, 60_000));
    });

    // Military clock + live elapsed timer + marker face timers
    const clockTick = () => {
      const n = new Date();
      const h = String(n.getUTCHours()).padStart(2, "0");
      const m = String(n.getUTCMinutes()).padStart(2, "0");
      const s = String(n.getUTCSeconds()).padStart(2, "0");
      setMilClock(`${h}${m}${s}Z`);
      const now = Date.now();
      setNowMs(now);
      // Update elapsed timers embedded in map marker faces
      document.querySelectorAll<HTMLElement>("[data-tl-mkr-onset]").forEach(el => {
        const onset = parseInt(el.dataset.tlMkrOnset ?? "0");
        if (onset) el.textContent = fmtElapsed(now - onset);
      });
    };
    clockTick();
    const clockId = setInterval(clockTick, 1000);

    return () => {
      clearInterval(clockId);
      intervals.current.forEach(clearInterval);
      lightningWsRef.current?.close();
      lightningWsRef.current = null;
      vesselWsRef.current?.close();
      vesselWsRef.current = null;
      mapInst.current?.remove();
      mapInst.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Ambient chromatic overlay — slow amoeba blobs + tactical glitch ────────
  useEffect(() => {
    const canvas = ambiCanvasRef.current;
    if (!canvas) return;
    const sync = () => {
      const w = canvas.clientWidth || canvas.offsetWidth;
      const h = canvas.clientHeight || canvas.offsetHeight;
      if (w && h && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w; canvas.height = h;
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);

    // 7 slow-drifting blobs on elliptical orbital paths, cyberpunk palette
    const B = [
      { cx:0.40,cy:0.48,rx:0.32,ry:0.24,rad:0.44,T:24700,ph:0.00,pT:8200, pPh:0.0,r:34, g:211,b:238,a:0.052 }, // cyan
      { cx:0.62,cy:0.52,rx:0.24,ry:0.30,rad:0.36,T:34100,ph:1.30,pT:11300,pPh:2.1,r:168,g:85, b:247,a:0.043 }, // violet
      { cx:0.48,cy:0.28,rx:0.28,ry:0.20,rad:0.40,T:43700,ph:2.60,pT:14600,pPh:1.3,r:6,  g:182,b:212,a:0.038 }, // teal
      { cx:0.26,cy:0.68,rx:0.22,ry:0.26,rad:0.32,T:38300,ph:0.90,pT:9100, pPh:3.8,r:217,g:70, b:239,a:0.036 }, // magenta
      { cx:0.72,cy:0.30,rx:0.26,ry:0.22,rad:0.38,T:31900,ph:3.90,pT:12700,pPh:0.9,r:59, g:130,b:246,a:0.033 }, // blue
      { cx:0.54,cy:0.76,rx:0.20,ry:0.28,rad:0.30,T:57100,ph:5.20,pT:16200,pPh:4.5,r:16, g:185,b:129,a:0.026 }, // emerald
      { cx:0.30,cy:0.36,rx:0.16,ry:0.18,rad:0.28,T:29300,ph:4.10,pT:7800, pPh:1.7,r:99, g:102,b:241,a:0.030 }, // indigo
    ];
    const draw = (now: number) => {
      const W = canvas.width, H = canvas.height;
      if (!W || !H) { ambiRafRef.current = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);

      // Amoeba blobs — overlapping radial gradients create organic merged shapes
      for (const b of B) {
        const t = now / b.T;
        const x = (b.cx + b.rx * Math.cos(t * Math.PI * 2 + b.ph)) * W;
        const y = (b.cy + b.ry * Math.sin(t * Math.PI * 2 + b.ph * 0.73)) * H;
        const r = (b.rad + 0.08 * Math.sin(now / b.pT + b.pPh)) * Math.min(W, H);
        const g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
        g2.addColorStop(0,    `rgba(${b.r},${b.g},${b.b},${b.a})`);
        g2.addColorStop(0.45, `rgba(${b.r},${b.g},${b.b},${b.a * 0.45})`);
        g2.addColorStop(1,    `rgba(${b.r},${b.g},${b.b},0)`);
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, W, H);
      }

      ambiRafRef.current = requestAnimationFrame(draw);
    };
    ambiRafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(ambiRafRef.current); ro.disconnect(); };
  }, []);

  // Weather
  useEffect(() => {
    fetchWeather();
    const id = setInterval(fetchWeather, 2 * 60_000);
    return () => clearInterval(id);
  }, [fetchWeather]);

  // News headlines
  useEffect(() => {
    fetchNews();
    const id = setInterval(fetchNews, 5 * 60_000);
    return () => clearInterval(id);
  }, [fetchNews]);


  // Fullscreen listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Base layer swap ───────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapInst.current;
    if (!map) return;
    import("leaflet").then(mod => {
      const L = mod.default;
      if (baseTileRef.current) map.removeLayer(baseTileRef.current);
      if (labelRef.current)    { map.removeLayer(labelRef.current); labelRef.current = null; }
      const def = BASE_LAYERS[baseKey];
      const opts: any = { minNativeZoom: def.minNativeZoom, maxNativeZoom: def.maxNativeZoom, maxZoom: 19, className: "tl-base-tile" };
      if (def.subdomains) opts.subdomains = def.subdomains;
      baseTileRef.current = L.tileLayer(def.url, opts).addTo(map);
      if (baseKey === "hybrid") {
        labelRef.current = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
          { maxNativeZoom: 16, maxZoom: 19, pane: "overlayPane", opacity: 0.9 }
        ).addTo(map);
      }
      Object.values(groupRefs.current).forEach(g => g?.bringToFront?.());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey]);

  // ── Layer toggle ──────────────────────────────────────────────────────────

  function toggleLayer(key: LayerKey) {
    const g = groupRefs.current[key], m = mapInst.current;
    if (!g || !m) return;
    enabled[key] ? m.removeLayer(g) : g.addTo(m);
    setEnabled(p => ({ ...p, [key]: !p[key] }));
  }

  // ── Fullscreen + wake lock ────────────────────────────────────────────────

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => {});
      try { wakeLockRef.current = await (navigator as any).wakeLock?.request("screen"); } catch {}
    } else {
      await document.exitFullscreen().catch(() => {});
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Override WMO code string with precipitation-based condition when actively raining —
  // Open-Meteo's weather_code can lag its precipitation field by 15+ minutes.
  const cond = weather
    ? weather.precipitation > 0.1  ? "Heavy rain"
    : weather.precipitation > 0.01 ? "Rain"
    : (WMO[weather.code] ?? "Unknown")
    : null;
  const panelW = 232;

  const clockDisplay = (() => {
    const n = new Date(nowMs);
    const uh = String(n.getUTCHours()).padStart(2, "0");
    const um = String(n.getUTCMinutes()).padStart(2, "0");
    const us = String(n.getUTCSeconds()).padStart(2, "0");
    const lh = String(n.getHours()).padStart(2, "0");
    const lm2 = String(n.getMinutes()).padStart(2, "0");
    const tz = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(n).find(p => p.type === "timeZoneName")?.value ?? "EST";
    const mode = Math.floor(nowMs / 2500) % 3;
    if (mode === 0) return `${uh}${um}${us}Z`;
    if (mode === 1) return `${uh}:${um}:${us} UTC`;
    return `${lh}${lm2} ${tz}`;
  })();

  const fmtFeedAge = (key: FeedKey) => {
    const t = feedLastSeenRef.current[key];
    if (!t) return "";
    const s = Math.floor((nowMs - t) / 1000);
    return ` [${s}s]`;
  };
  const tickerItems: { text: string; color: string }[] = [
    ...metarItems.map(t   => ({ text: `${t.text}${fmtFeedAge("metar")}`,   color: t.color })),
    ...alertTexts.map(t   => ({ text: `⚠ ${t}${fmtFeedAge("alerts")}`,    color: "#f59e0b" })),
    ...trafficTexts.map(t => ({ text: `🚧 ${t}${fmtFeedAge("traffic")}`,   color: "#fb923c" })),
    ...marineTexts.map(t  => ({ text: `⚓ ${t}${fmtFeedAge("marine")}`,    color: "#22d3ee" })),
  ];

  const layerBadge: Partial<Record<LayerKey, string>> = {
    aircraft:  aircraftCount  > 0 ? String(aircraftCount)  : undefined,
    alerts:    alertCount     > 0 ? String(alertCount)     : undefined,
    lightning: strikeCount    > 0 ? String(strikeCount)    : undefined,
    transit:   transitCount   > 0 ? String(transitCount)   : undefined,
    rail:      railCount      > 0 ? String(railCount)      : undefined,
    services:  servicesCount  > 0 ? String(servicesCount)  : undefined,
    traffic:   trafficCount   > 0 ? String(trafficCount)   : undefined,
    dispatch:  dispatchCount  > 0 ? String(dispatchCount)  : "◉",
    buildings: buildingsCount > 0 ? buildingsCount.toLocaleString() : undefined,
    marine:    marineCount    > 0 ? String(marineCount)    : undefined,
    vessels:   vesselCount    > 0 ? String(vesselCount)    : undefined,
    metar:     metarCount     > 0 ? String(metarCount)     : undefined,
    storm:     stormCount     > 0 ? String(stormCount)     : undefined,
    outages:   outagesTotal   > 0 ? outagesTotal.toLocaleString() : undefined,
  };

  // Burn-in prevention: Lissajous pixel orbit (±4px), only in fullscreen
  const _t = nowMs / 1000;
  const orbitX = isFullscreen ? +(4 * Math.sin(2 * Math.PI * _t / 210)).toFixed(2) : 0;
  const orbitY = isFullscreen ? +(4 * Math.sin(2 * Math.PI * _t / 282 + Math.PI / 2)).toFixed(2) : 0;

  return (
    <div className="relative w-full overflow-hidden tl-fullvp"
      style={{ background: "#07090f", transform: `translate(${orbitX}px,${orbitY}px)`, transition: "transform 1s linear" }}>
      {/* Map canvas */}
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* ── Ambient chromatic overlay — amoeba blobs + glitch ─────────────── */}
      <canvas ref={ambiCanvasRef} className="absolute inset-0 z-1 pointer-events-none"
        style={{ width: "100%", height: "100%", mixBlendMode: "screen" }} />

      {/* ── CRT scanline overlay ───────────────────────────────────────────── */}
      <div className="absolute inset-0 z-5 pointer-events-none" style={{
        background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 3px)",
        mixBlendMode: "multiply",
      }} />

      {/* ── Radar sweep + city overlays ────────────────────────────────────── */}
      {centerPx && (
        <div className="absolute inset-0 z-6 pointer-events-none overflow-hidden">
          {/* Crosshair at city center */}
          <div style={{ position: "absolute", left: centerPx.x, top: centerPx.y }}>
            {/* Horizontal bars */}
            <div style={{ position: "absolute", top: -0.5, left: 14, width: 26, height: 1, background: "rgba(255,255,255,0.7)" }} />
            <div style={{ position: "absolute", top: -0.5, right: 14, width: 26, height: 1, background: "rgba(255,255,255,0.7)", transform: "translateX(100%)" }} />
            {/* Vertical bars */}
            <div style={{ position: "absolute", left: -0.5, top: 14, width: 1, height: 26, background: "rgba(255,255,255,0.7)" }} />
            <div style={{ position: "absolute", left: -0.5, bottom: 14, width: 1, height: 26, background: "rgba(255,255,255,0.7)", transform: "translateY(100%)" }} />
            {/* Center dot */}
            <div style={{ position: "absolute", width: 8, height: 8, borderRadius: "50%", background: "#ffffff",
              transform: "translate(-50%,-50%)", boxShadow: "0 0 8px rgba(255,255,255,0.9), 0 0 20px rgba(255,255,255,0.3)" }} />
          </div>

          {/* "TLS" label near crosshair */}
          <div style={{
            position: "absolute",
            left: centerPx.x + 16,
            top: centerPx.y + 10,
            fontFamily: "Menlo,Consolas,monospace",
            fontSize: 11,
            color: "rgba(255,255,255,0.85)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            pointerEvents: "none",
            textShadow: "0 0 6px rgba(0,0,0,0.9)",
          }}>
            TLS
          </div>
        </div>
      )}

      {/* ── Screensaver map fade-to-black overlay ───────────────────────────── */}
      {ssMode && centerPx && (
        <div className="absolute inset-0 pointer-events-none" style={{
          zIndex: 9,
          background: `radial-gradient(circle at ${centerPx.x}px ${centerPx.y}px, transparent 0%, transparent 14%, rgba(7,9,15,0.25) 34%, rgba(7,9,15,0.72) 58%, rgba(7,9,15,0.93) 84%)`,
        }} />
      )}

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-3 py-2"
        style={{ background: "linear-gradient(to bottom, rgba(7,9,15,0.97) 0%, transparent 100%)", overflow: "hidden" }}>

        <button onClick={toggleFullscreen} className="flex items-center gap-1.5 shrink-0"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#39d97a", display: "inline-block", animation: "tl-blink 1.4s ease-in-out infinite" }} />
          <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: Math.round(9 * uiScale), color: "#39d97a", letterSpacing: "0.16em" }}>LIVE</span>
        </button>
        <div className="flex items-center gap-1 shrink-0 tl-mob-hide">
          <span style={{ fontSize: Math.round(10 * uiScale), color: wsStatus === "live" ? "#ffe066" : "#2a3a52" }}>⚡</span>
          <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: Math.round(9 * uiScale), color: wsStatus === "live" ? "#ffe066" : "#2a3a52", letterSpacing: "0.1em" }}>
            {wsStatus === "live" ? (strikesPerMin > 0 ? `${strikesPerMin}/min` : "live") : wsStatus}
          </span>
        </div>
        {weather ? (
          <>
            <span className="shrink-0" style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: Math.round(11 * uiScale), color: "#e2ecff" }}>{Math.round(weather.temp)}°F</span>
            <span className="shrink-0" style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: Math.round(11 * uiScale), color: "#5a7090" }}>{cond}</span>
            <span className="shrink-0 tl-mob-hide" style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: Math.round(11 * uiScale), color: "#5a7090" }}>{Math.round(weather.wind_speed)} mph {degToCompass(weather.wind_dir)}</span>
            <span className="shrink-0 tl-mob-hide" style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: Math.round(11 * uiScale), color: "#5a7090" }}>{weather.humidity}% RH</span>
          </>
        ) : null}
        {alertCount > 0 && (
          <span className="shrink-0" style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: Math.round(9 * uiScale), color: "#f59e0b",
            background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.28)",
            borderRadius: 4, padding: "1px 6px", letterSpacing: "0.08em" }}>
            {alertCount} ALERT{alertCount !== 1 ? "S" : ""}
          </span>
        )}

        {/* Hourly + daily forecast — between conditions and clock */}
        <div style={{ flex: 1 }} />
        {hourlyForecast.length > 0 && (
          <div className="tl-mob-hide" style={{ display: "flex", gap: 6, alignItems: "center", borderLeft: "1px solid #1e2d4430", paddingLeft: 10 }}>
            {hourlyForecast.slice(0, 7).map((h, i) => {
              const ampm = h.hour === 0 ? "12a" : h.hour < 12 ? `${h.hour}a` : h.hour === 12 ? "12p" : `${h.hour - 12}p`;
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                  <span style={{ fontSize: 6, color: "#1e3050", fontFamily: "Menlo,Consolas,monospace" }}>{ampm}</span>
                  <span style={{ fontSize: 9, lineHeight: 1 }}>{wmoIcon(h.code)}</span>
                  <span style={{ fontSize: 6, color: "#5a7090", fontFamily: "Menlo,Consolas,monospace", fontVariantNumeric: "tabular-nums" }}>{h.temp}°</span>
                </div>
              );
            })}
          </div>
        )}
        {dailyForecast.length > 0 && (
          <div className="tl-mob-hide" style={{ display: "flex", gap: 6, alignItems: "center", borderLeft: "1px solid #1e2d4430", paddingLeft: 10 }}>
            {dailyForecast.slice(0, 6).map((d, i) => {
              const dayName = i === 0 ? "TOD" : new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }).toUpperCase().slice(0, 3);
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                  <span style={{ fontSize: 6, color: "#1e3050", fontFamily: "Menlo,Consolas,monospace" }}>{dayName}</span>
                  <span style={{ fontSize: 9, lineHeight: 1 }}>{wmoIcon(d.code)}</span>
                  <span style={{ fontSize: 6, color: "#5a7090", fontFamily: "Menlo,Consolas,monospace", fontVariantNumeric: "tabular-nums" }}>{d.max}°/{d.min}°</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Clock — cycles Zulu / UTC / local every 2.5s */}
        <span key={Math.floor(nowMs / 2500) % 3} className="tl-clock-flip shrink-0" style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: Math.round(13 * uiScale), color: "#39d97a", letterSpacing: "0.12em", fontWeight: 700, borderLeft: "1px solid #1e2d4430", paddingLeft: 10 }}>
          {clockDisplay}
        </span>
      </div>

      {/* ── Feed orbs ──────────────────────────────────────────────────────── */}
      <div className="absolute z-10 left-0 right-0 flex justify-center"
        style={{ top: 92, gap: 6, padding: "0 10px", pointerEvents: "none" }}>
        {FEED_ORDER.map(key => {
          const meta   = FEED_META[key];
          const layerKey = FEED_LAYER[key];
          const active = layerKey ? enabled[layerKey] : true;
          const lastSeen = feedLastSeenRef.current[key];
          const ageMs  = lastSeen ? nowMs - lastSeen : null;
          const ageSec = ageMs !== null ? Math.floor(ageMs / 1000) : null;
          const progress = ageSec === null ? 0 : Math.max(0, 1 - ageSec / meta.maxAge);
          const stale  = ageSec !== null && ageSec > meta.maxAge;
          const aging  = ageSec !== null && ageSec > meta.maxAge * 0.55 && !stale;
          const fresh  = ageSec !== null && !aging && !stale;
          const ringColor = !active || ageSec === null ? "#182232"
            : stale ? "#ef4444" : aging ? "#f59e0b" : meta.color;
          const timeStr = ageSec === null ? "—"
            : ageSec < 5    ? "now"
            : ageSec < 60   ? `${ageSec}s`
            : ageSec < 3600 ? `${Math.floor(ageSec / 60)}m`
            : `${Math.floor(ageSec / 3600)}h`;
          const countVal = layerKey ? layerBadge[layerKey] : undefined;
          const ageStr = ageSec === null ? "No data yet"
            : ageSec < 5    ? "Just now"
            : ageSec < 60   ? `${ageSec}s ago`
            : ageSec < 3600 ? `${Math.floor(ageSec / 60)}m ${ageSec % 60}s ago`
            : `${Math.floor(ageSec / 3600)}h ago`;
          const statusStr = ageSec === null ? "Waiting" : stale ? "Stale" : aging ? "Aging" : "Fresh";
          const maxAgeStr = meta.maxAge >= 3600 ? `${meta.maxAge/3600}h` : meta.maxAge >= 60 ? `${meta.maxAge/60}m` : `${meta.maxAge}s`;
          return (
            <div key={key} className="tl-orb-wrap" style={{
              position: "relative", width: 44, height: 72,
              flexShrink: 0, pointerEvents: "auto", cursor: "default",
              opacity: active ? (ssMode ? 0.22 : 1) : 0.14,
              background: active && fresh && !ssMode
                ? `linear-gradient(180deg, ${meta.color}14 0%, #030508 100%)`
                : "linear-gradient(180deg, #080c14 0%, #030508 100%)",
              border: `1px solid ${active && fresh && !ssMode ? meta.color + "44" : "#0c1520"}`,
              borderRadius: 1,
              boxShadow: active && fresh && !ssMode ? `0 0 8px ${meta.color}18, inset 0 0 8px ${meta.color}07` : "none",
              transition: "border-color 0.8s, box-shadow 0.8s, opacity 1.4s, background 0.8s",
            }}>
              {/* Corner brackets */}
              {([
                { top: 2, left: 2, borderTop: `1px solid ${active && fresh && !ssMode ? meta.color + "aa" : meta.color + "28"}`, borderLeft: `1px solid ${active && fresh && !ssMode ? meta.color + "aa" : meta.color + "28"}` } as React.CSSProperties,
                { top: 2, right: 2, borderTop: `1px solid ${active && fresh && !ssMode ? meta.color + "aa" : meta.color + "28"}`, borderRight: `1px solid ${active && fresh && !ssMode ? meta.color + "aa" : meta.color + "28"}` } as React.CSSProperties,
                { bottom: 2, left: 2, borderBottom: `1px solid ${active && fresh && !ssMode ? meta.color + "aa" : meta.color + "28"}`, borderLeft: `1px solid ${active && fresh && !ssMode ? meta.color + "aa" : meta.color + "28"}` } as React.CSSProperties,
                { bottom: 2, right: 2, borderBottom: `1px solid ${active && fresh && !ssMode ? meta.color + "aa" : meta.color + "28"}`, borderRight: `1px solid ${active && fresh && !ssMode ? meta.color + "aa" : meta.color + "28"}` } as React.CSSProperties,
              ]).map((s, i) => (
                <div key={i} style={{ position: "absolute", width: 5, height: 5, ...s }} />
              ))}
              {/* Callsign zone — monospace signal code, no emoji */}
              <div style={{ height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{
                  fontFamily: "Menlo,Consolas,monospace",
                  fontSize: meta.short.length > 3 ? 6 : 7,
                  letterSpacing: "0.10em",
                  color: active && fresh && !ssMode ? meta.color : meta.color + "44",
                  border: `1px solid ${active && fresh && !ssMode ? meta.color + "55" : meta.color + "18"}`,
                  padding: "2px 3px", lineHeight: 1.2, userSelect: "none",
                  textShadow: active && fresh && !ssMode ? `0 0 6px ${meta.color}88` : "none",
                  transition: "all 0.8s",
                }}>{meta.short}</span>
              </div>
              {/* Progress bar */}
              <div style={{ height: 18, position: "relative", background: "rgba(255,255,255,0.035)",
                borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0,
                  width: `${progress * 100}%`, background: ringColor, opacity: 0.55,
                  transition: "width 1s linear, background 0.6s" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
                  justifyContent: "center", fontFamily: "Menlo,Consolas,monospace",
                  fontSize: 8, color: "#cdd8ec", letterSpacing: "0.05em", zIndex: 1,
                  textShadow: "0 0 4px rgba(0,0,0,0.9)" }}>{timeStr}</div>
              </div>
              {/* Count / label zone */}
              <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "Menlo,Consolas,monospace",
                  fontSize: countVal ? (String(countVal).length > 5 ? 7 : String(countVal).length > 3 ? 9 : 11) : 7,
                  fontWeight: 700,
                  color: countVal ? (active && fresh ? meta.color : meta.color + "99") : "#1e3050",
                  letterSpacing: "0.03em", lineHeight: 1,
                  textShadow: countVal && active && fresh ? `0 0 8px ${meta.color}55` : "none",
                  transition: "color 0.6s, text-shadow 0.6s" }}>
                  {countVal ?? meta.short}
                </span>
              </div>
              <div className="tl-orb-tip">
                <div style={{ color: meta.color, fontWeight: 700, marginBottom: 4 }}>{meta.label}</div>
                <div><span style={{ color: "#475569" }}>Updated: </span><span style={{ color: "#e2ecff" }}>{ageStr}</span></div>
                <div><span style={{ color: "#475569" }}>Status: </span><span style={{ color: ringColor }}>{statusStr}</span></div>
                {layerKey && <div><span style={{ color: "#475569" }}>Layer: </span><span style={{ color: active ? "#4ade80" : "#475569" }}>{active ? "On" : "Off"}</span></div>}
                <div style={{ color: "#2a3a4a", marginTop: 3 }}>Refresh window: {maxAgeStr}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Panel toggle tab ───────────────────────────────────────────────── */}
      <button onClick={() => setPanelOpen(p => !p)}
        className="absolute z-20 top-1/2 -translate-y-1/2 transition-all duration-300 tl-panel-hide"
        style={{ left: panelOpen ? panelW : 0,
          background: "rgba(7,9,15,0.88)", border: "1px solid #1e2d44", borderLeft: "none",
          borderRadius: "0 6px 6px 0", padding: "10px 4px", cursor: "pointer" }}>
        <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
          <path d={panelOpen ? "M7 2L3 8L7 14" : "M3 2L7 8L3 14"} stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div className="absolute top-0 bottom-0 left-0 z-10 flex flex-col transition-transform duration-300 tl-panel-hide"
        style={{ width: panelW, transform: panelOpen ? "translateX(0)" : `translateX(-${panelW}px)`,
          background: "rgba(7,9,15,0.92)", backdropFilter: "blur(18px)", borderRight: "1px solid #0f1d2e" }}>

        {/* Header */}
        <div className="px-5 pt-12 pb-4" style={{ borderBottom: "1px solid #0d1520" }}>
          <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 8, color: "#22d3ee", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4, opacity: 0.7 }}>
            THUNDER LAKE SYSTEMS ◈ CTF
          </div>
          <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 16, color: "#e2ecff", fontWeight: 700, letterSpacing: "-0.01em" }}>
            Stamford Intel
          </div>
          <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#2a3a52", letterSpacing: "0.06em", marginTop: 2 }}>
            {milClock} · LIVE SURVEILLANCE
          </div>
        </div>

        {/* Base map */}
        <div className="px-5 py-3" style={{ borderBottom: "1px solid #0d1520" }}>
          <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 8, color: "#2a3a52", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>Base Map</div>
          <div className="flex gap-1.5">
            {(["dark", "satellite", "hybrid"] as BaseKey[]).map(k => {
              const active = baseKey === k;
              const accent = k === "dark" ? "#22d3ee" : k === "satellite" ? "#4ade80" : "#c4b5fd";
              return (
                <button key={k} onClick={() => setBaseKey(k)}
                  style={{ flex: 1, padding: "5px 0", fontSize: 8, borderRadius: 4, cursor: "pointer",
                    fontFamily: "Menlo,Consolas,monospace", letterSpacing: "0.08em", textTransform: "uppercase",
                    background: active ? accent + "14" : "transparent",
                    border: `1px solid ${active ? accent + "55" : "#0f1d2e"}`,
                    color: active ? accent : "#2a3a52", transition: "all 0.15s" }}>
                  {k}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick stats */}
        <div className="px-5 py-3 flex gap-4" style={{ borderBottom: "1px solid #0d1520" }}>
          {[
            { val: aircraftCount, label: "Aircraft", color: "#a855f7" },
            { val: transitCount,  label: "Buses",    color: "#60a5fa" },
            { val: strikeCount,   label: "⚡",       color: "#ffe066" },
          ].map(({ val, label, color }) => (
            <div key={label}>
              <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 20, fontWeight: 700, color, lineHeight: 1,
                textShadow: `0 0 12px ${color}66` }}>{val}</div>
              <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 8, color: "#1e2d44", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ISS */}
        {iss && (
          <div className="px-5 py-2.5" style={{ borderBottom: "1px solid #0d1520" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#a78bfa", fontSize: 11 }}>◈</span>
              <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#5a7090", lineHeight: 1.8 }}>
                <span style={{ color: "#a78bfa70" }}>ISS</span>
                <span style={{ marginLeft: 8 }}>{iss.latitude.toFixed(2)}° {iss.latitude >= 0 ? "N" : "S"}</span>
                <span style={{ color: "#2a3a52", margin: "0 4px" }}>·</span>
                <span>{Math.abs(iss.longitude).toFixed(2)}° {iss.longitude >= 0 ? "E" : "W"}</span>
                <span style={{ color: "#2a3a52", margin: "0 4px" }}>·</span>
                <span style={{ color: "#3a3a52" }}>{Math.round(iss.altitude)} km</span>
              </div>
            </div>
          </div>
        )}

        {/* Layer toggles */}
        <div className="flex-1 overflow-y-auto py-3" style={{ scrollbarWidth: "none" }}>
          {SECTIONS.map(({ key: sectionKey, label: sectionLabel }) => {
            const layers = (Object.entries(LAYER_META) as [LayerKey, LayerMeta][]).filter(([, m]) => m.section === sectionKey);
            return (
              <div key={sectionKey} className="px-5 mb-5">
                <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 8, color: "#1e2d44", letterSpacing: "0.16em",
                  textTransform: "uppercase", marginBottom: 10, paddingBottom: 5, borderBottom: "1px solid #080f18" }}>
                  {sectionLabel}
                </div>
                <div className="flex flex-col gap-3">
                  {layers.map(([key, { label, color }]) => {
                    const on  = enabled[key];
                    const cnt = layerBadge[key];
                    return (
                      <button key={key} onClick={() => toggleLayer(key)}
                        className="flex items-center gap-3 text-left"
                        style={{ opacity: on ? 1 : 0.3, cursor: "pointer", background: "none", border: "none", padding: 0, transition: "opacity .15s" }}>
                        <div style={{ width: 30, height: 16, borderRadius: 8, flexShrink: 0, position: "relative",
                          background: on ? color + "20" : "#080f18", border: `1px solid ${on ? color + "50" : "#0f1d2e"}`, transition: "all .2s" }}>
                          <div style={{ position: "absolute", top: 2, width: 12, height: 12, borderRadius: "50%",
                            background: on ? color : "#1e2d44", left: on ? 14 : 2, transition: "all .2s",
                            boxShadow: on ? `0 0 6px ${color}99` : "none" }} />
                        </div>
                        <span style={{ fontFamily: "system-ui", fontSize: 11, color: on ? "#c0d0e8" : "#1e2d44", flex: 1 }}>{label}</span>
                        {cnt && (
                          <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 8, color, background: color + "14",
                            border: `1px solid ${color}30`, borderRadius: 3, padding: "1px 5px" }}>
                            {cnt}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Fullscreen button */}
        <div className="px-5 pb-5 pt-2" style={{ borderTop: "1px solid #0d1520" }}>
          <button onClick={toggleFullscreen}
            style={{ width: "100%", padding: "8px 0", fontFamily: "Menlo,Consolas,monospace", fontSize: 9,
              letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", borderRadius: 5,
              color: isFullscreen ? "#39d97a" : "#22d3ee",
              background: isFullscreen ? "rgba(57,217,122,0.08)" : "rgba(34,211,238,0.07)",
              border: `1px solid ${isFullscreen ? "#39d97a33" : "#22d3ee33"}`,
              transition: "all 0.2s",
            }}>
            {isFullscreen ? "⊠ EXIT FULLSCREEN" : "⊡ FULLSCREEN · WATCH MODE"}
          </button>
          <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 8, color: "#111a27", textAlign: "center", marginTop: 5, lineHeight: 1.6 }}>
            AC 15s · ISS 6s · Bus 30s · Dsp 30s · Radar 5m
          </div>
        </div>
      </div>

      {/* ── Live ticker — bottom of map ───────────────────────────────────── */}
      {tickerItems.length > 0 && (
        <div className="tl-ticker-wrap" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
          overflow: "hidden", pointerEvents: "none",
          borderTop: "1px solid #0d1a26",
          background: "rgba(7,9,15,0.92)", display: "flex", alignItems: "center",
          height: Math.round(28 * uiScale) }}>
          {/* Label */}
          <div style={{ flexShrink: 0, height: "100%", padding: "0 10px",
            display: "flex", alignItems: "center", gap: 5,
            borderRight: "1px solid #0d1a26" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#39d97a",
              display: "inline-block", animation: "tl-blink 1.4s ease-in-out infinite" }} />
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: Math.round(8 * uiScale), color: "#39d97a", letterSpacing: "0.16em" }}>
              INTEL
            </span>
          </div>
          {/* Scrolling strip */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ display: "flex", width: "max-content",
              animation: `tl-ticker ${Math.max(tickerItems.length * 10, 20)}s linear infinite` }}>
              {[...tickerItems, ...tickerItems].map((item, i) => (
                <span key={i} style={{
                  fontFamily: "Menlo,Consolas,monospace", fontSize: Math.round(9.5 * uiScale),
                  color: item.color, padding: "0 32px", letterSpacing: "0.045em", whiteSpace: "nowrap",
                }}>
                  {item.text}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Left column — terminal feed ────────────────────────────────────── */}
      <div className="absolute" style={{
        left: panelOpen ? panelW + 10 : 10,
        top: 92, bottom: tickerItems.length > 0 ? 28 : 0,
        zIndex: 15, width: 320, pointerEvents: "none",
        fontFamily: "Menlo,Consolas,monospace",
        display: "flex", flexDirection: "column",
        transition: "left 0.3s",
      }}>
        {/* Sector intel — live contacts by distance ring */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "none", padding: "2px 0",
          maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 100%)" }}>
          {(() => {
            const S10: Array<{ type: string; name: string; info: string; age: number; color: string }> = [];
            const S20: typeof S10 = [];
            const tlsLat = crosshairLatLngRef.current.lat;
            const tlsLng = crosshairLatLngRef.current.lng;
            const MI10 = 16093, MI20 = 32186;
            if (mapInst.current) {
              aircraftMarkersRef.current.forEach((m, id) => {
                try {
                  const ll = m.getLatLng();
                  const d = distToStamford(ll.lat, ll.lng, tlsLat, tlsLng);
                  if (d > MI20) return;
                  const st = aircraftStateRef.current?.get(id);
                  const age = st?.lastMs ? Math.round((nowMs - st.lastMs) / 1000) : 0;
                  const meta = (m as any)._tlMeta;
                  (d <= MI10 ? S10 : S20).push({ type: "AIR", name: meta?.id ?? id, info: meta?.detail ?? "", age, color: "#a855f7" });
                } catch {}
              });
              trainMarkersRef.current.forEach((m, id) => {
                try {
                  const ll = m.getLatLng();
                  const d = distToStamford(ll.lat, ll.lng, tlsLat, tlsLng);
                  if (d > MI20) return;
                  const rts = feedLastSeenRef.current["rail"];
                  const age = rts ? Math.round((nowMs - rts) / 1000) : 0;
                  const meta = (m as any)._tlMeta;
                  (d <= MI10 ? S10 : S20).push({ type: "TRAIN", name: meta?.id ?? String(id), info: meta?.detail ?? "", age, color: "#4488ff" });
                } catch {}
              });
              vesselMarkersRef.current.forEach((m, mmsi) => {
                try {
                  const ll = m.getLatLng();
                  const d = distToStamford(ll.lat, ll.lng, tlsLat, tlsLng);
                  if (d > MI20) return;
                  const vts = vesselLastSeenRef.current.get(mmsi);
                  const age = vts ? Math.round((nowMs - vts) / 1000) : 0;
                  const meta = (m as any)._tlMeta;
                  (d <= MI10 ? S10 : S20).push({ type: "AIS", name: meta?.id ?? String(mmsi), info: meta?.detail ?? "", age, color: "#0ea5e9" });
                } catch {}
              });
              S10.sort((a, b) => a.age - b.age);
              S20.sort((a, b) => a.age - b.age);
            }
            const sz = Math.round(7 * uiScale);
            const sz2 = Math.round(6 * uiScale);
            return (
              <>
                <div style={{ fontSize: sz2, color: "#22d3ee40", letterSpacing: "0.12em", marginBottom: 3, fontVariantNumeric: "tabular-nums" }}>─ 10mi</div>
                {S10.length > 0 ? (() => {
                  const trainCount10 = S10.filter(e => e.type === "TRAIN").length;
                  const nonTrain10   = S10.filter(e => e.type !== "TRAIN");
                  return (<>
                    {nonTrain10.map((e, i) => (
                      <div key={i} style={{ display: "flex", gap: 4, fontSize: sz, marginBottom: 2, lineHeight: 1.3 }}>
                        <span style={{ color: e.color + "70", flexShrink: 0, minWidth: 30, fontSize: sz2, letterSpacing: "0.06em" }}>{e.type}</span>
                        <span style={{ color: "#e2ecff70", flexShrink: 0, maxWidth: 62, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                        <span style={{ color: "#5a709055", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: sz2 }}>{e.info}</span>
                        <span style={{ color: "#1e305088", flexShrink: 0, fontSize: sz2, fontVariantNumeric: "tabular-nums" }}>[{e.age}s]</span>
                      </div>
                    ))}
                    {trainCount10 > 0 && (
                      <div style={{ display: "flex", gap: 4, fontSize: sz, marginBottom: 2, lineHeight: 1.3 }}>
                        <span style={{ color: "#4488ff70", flexShrink: 0, minWidth: 30, fontSize: sz2, letterSpacing: "0.06em" }}>TRAIN</span>
                        <span style={{ color: "#e2ecff55" }}>× {trainCount10}</span>
                      </div>
                    )}
                  </>);
                })() : <div style={{ fontSize: sz2, color: "#1e3050", marginBottom: 2 }}>NO CONTACTS</div>}
                <div style={{ fontSize: sz2, color: "#22d3ee30", letterSpacing: "0.12em", marginTop: 7, marginBottom: 3 }}>─ 20mi</div>
                {S20.length > 0 ? S20.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: 4, fontSize: sz, marginBottom: 2, lineHeight: 1.3 }}>
                    <span style={{ color: e.color + "70", flexShrink: 0, minWidth: 30, fontSize: sz2, letterSpacing: "0.06em" }}>{e.type}</span>
                    <span style={{ color: "#e2ecff70", flexShrink: 0, maxWidth: 62, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                    <span style={{ color: "#5a709055", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: sz2 }}>{e.info}</span>
                    <span style={{ color: "#1e305088", flexShrink: 0, fontSize: sz2, fontVariantNumeric: "tabular-nums" }}>[{e.age}s]</span>
                  </div>
                )) : <div style={{ fontSize: sz2, color: "#1e3050", marginBottom: 2 }}>NO CONTACTS</div>}
              </>
            );
          })()}
        </div>
      </div>

      {/* ── Right column — gear controls + news ────────────────────────── */}
      <div className="absolute" style={{
        right: 10, top: 92, bottom: tickerItems.length > 0 ? 28 : 0,
        zIndex: 15, width: 228, pointerEvents: "none",
        fontFamily: "Menlo,Consolas,monospace",
        display: "flex", flexDirection: "column",
      }}>
        {/* Gear button — standalone at top of column */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 6, flexShrink: 0 }}>
          <button onClick={() => setShowControls(p => !p)} style={{
            background: showControls ? "rgba(34,211,238,0.1)" : "none",
            border: showControls ? "1px solid #22d3ee33" : "1px solid transparent",
            borderRadius: 3, width: 18, height: 18, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "auto", transition: "all 0.2s", padding: 0,
          }}>
            <svg width="11" height="11" viewBox="0 0 11 11" style={{ opacity: showControls ? 0.7 : 0.3, fill: "#22d3ee" }}>
              <path d="M5.5 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM.7 6.4l.9.2c.1.4.3.7.5 1L1.6 9l1.4 1.4 1.3-.5c.3.2.6.4 1 .5l.2.9h2l.2-.9c.4-.1.7-.3 1-.5l1.3.5L11 8.9l-.5-1.3c.2-.3.4-.7.5-1l.9-.2v-2l-.9-.2c-.1-.4-.3-.7-.5-1L11 2l-1.4-1.4-1.3.5c-.3-.2-.6-.4-1-.5L7.1.7h-2l-.2.9c-.4.1-.7.3-1 .5L2.6.6 1.1 2l.5 1.3c-.2.3-.4.6-.5 1L.7 4.4v2z"/>
            </svg>
          </button>
        </div>

        {/* Sliders — behind gear toggle */}
        {showControls && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, pointerEvents: "auto", flexShrink: 0, marginBottom: 8 }}>
            {([
              { label: "RADAR", val: Math.round(radarOpacity * 100), min: 0,  max: 100, fn: (v: number) => applyRadarOpacity(v / 100),    color: "#22d3ee" },
              { label: "SCALE", val: Math.round(uiScale * 100),      min: 50, max: 250, fn: (v: number) => applyScale(v / 100),            color: "#22d3ee" },
              { label: "MARKS", val: Math.round(markerScale * 100),  min: 50, max: 300, fn: (v: number) => applyMarkerScale(v / 100),      color: "#f59e0b" },
              { label: "TRAIN", val: Math.round(trainIconScale * 100), min: 50, max: 300, fn: (v: number) => applyTrainIconScale(v / 100), color: "#4488ff" },
            ] as const).map(({ label, val, min, max, fn, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 7, color: color + "55", letterSpacing: "0.1em", minWidth: 36 }}>{label}</span>
                <input
                  type="range" min={min} max={max} step="5"
                  value={val}
                  onChange={e => fn(Number(e.target.value))}
                  style={{ width: 52, cursor: "pointer", accentColor: color, opacity: 0.5 }}
                  title={`${label} ${val}%`}
                />
              </div>
            ))}
          </div>
        )}

        {/* News terminal */}
        {newsItems.length > 0 && (
          <div style={{ flex: "0 1 auto", minHeight: 0, display: "flex", flexDirection: "column", marginBottom: 6 }}>
            <div style={{ fontSize: Math.round(6.5 * uiScale), color: "#22d3ee33", letterSpacing: "0.16em", marginBottom: 3, flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#22d3ee", display: "inline-block", animation: "tl-blink 2.2s ease-in-out infinite" }} />
              NEWS FEED
            </div>
            <div style={{
              flex: "0 1 auto", overflowY: "auto", scrollbarWidth: "none",
              maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
            }}>
              {newsItems.slice(0, 20).map((item, i) => {
                const nd = new Date(item.ts);
                const hm = `${String(nd.getHours()).padStart(2,"0")}:${String(nd.getMinutes()).padStart(2,"0")}`;
                const pubShort = item.pub === "Stamford Advocate" ? "SA" : item.pub === "CT Mirror" ? "CTM" : item.pub.slice(0, 4).toUpperCase();
                return (
                  <div key={i} style={{ fontSize: Math.round(7 * uiScale), marginBottom: 3, lineHeight: 1.4 }}>
                    <span style={{ color: "#22d3ee77", fontVariantNumeric: "tabular-nums" }}>[{hm}</span>
                    <span style={{ color: "#22d3ee55" }}> · {pubShort} · </span>
                    <span style={{ color: "#94a3b8" }}>{item.headline}]</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Nearest vehicles — inline below news feed */}
        {(() => {
          if (!mapInst.current) return null;
          const tlsNLat = crosshairLatLngRef.current.lat;
          const tlsNLng = crosshairLatLngRef.current.lng;
          const NMI20 = 32186;
          const nearby2: Array<{ distM: number; brg: string; sig: string; name: string }> = [];
          aircraftMarkersRef.current.forEach((m) => {
            try {
              const ll = m.getLatLng();
              const d = distToStamford(ll.lat, ll.lng, tlsNLat, tlsNLng);
              if (d > NMI20) return;
              const meta2 = (m as any)._tlMeta;
              nearby2.push({ distM: d, brg: bearingStr(tlsNLat, tlsNLng, ll.lat, ll.lng), sig: "AIR", name: meta2?.id ?? "?" });
            } catch {}
          });
          trainMarkersRef.current.forEach((m) => {
            try {
              const ll = m.getLatLng();
              const d = distToStamford(ll.lat, ll.lng, tlsNLat, tlsNLng);
              if (d > NMI20) return;
              const meta2 = (m as any)._tlMeta;
              nearby2.push({ distM: d, brg: bearingStr(tlsNLat, tlsNLng, ll.lat, ll.lng), sig: "RWY", name: meta2?.id ?? "?" });
            } catch {}
          });
          vesselMarkersRef.current.forEach((m) => {
            try {
              const ll = m.getLatLng();
              const d = distToStamford(ll.lat, ll.lng, tlsNLat, tlsNLng);
              if (d > NMI20) return;
              const meta2 = (m as any)._tlMeta;
              nearby2.push({ distM: d, brg: bearingStr(tlsNLat, tlsNLng, ll.lat, ll.lng), sig: "AIS", name: meta2?.id ?? "?" });
            } catch {}
          });
          nearby2.sort((a, b) => a.distM - b.distM);
          if (nearby2.length === 0) return null;
          const sz = Math.round(7 * uiScale);
          const sz2 = Math.round(6 * uiScale);
          return (
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: sz2, color: "#22d3ee33", letterSpacing: "0.16em", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#22d3ee55", display: "inline-block" }} />
                NEAREST
              </div>
              {nearby2.slice(0, 10).map((v, i) => (
                <div key={i} style={{ display: "flex", gap: 5, fontSize: sz, lineHeight: 1.5, marginBottom: 1 }}>
                  <span style={{ color: "#22d3ee66", flexShrink: 0, minWidth: 46, fontVariantNumeric: "tabular-nums", fontSize: sz2 }}>{fmtMi(v.distM)} {v.brg}</span>
                  <span style={{ color: "#4488ff55", flexShrink: 0, fontSize: sz2, letterSpacing: "0.06em" }}>{v.sig}</span>
                  <span style={{ color: "#e2ecff77", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* ── Screensaver tracking overlay ─────────────────────────────────────── */}
      {ssMode && ssTrackMsg && (
        <div className="absolute" style={{
          bottom: tickerItems.length > 0 ? 42 : 14, left: "50%", transform: "translateX(-50%)",
          zIndex: 22, pointerEvents: "none",
          animation: "tl-track-msg-in 0.28s cubic-bezier(0.22,1,0.36,1) both",
          fontFamily: "Menlo,Consolas,monospace",
        }}>
          <div style={{
            background: "rgba(7,9,15,0.90)",
            border: "1px solid #22d3ee28",
            borderRadius: 2, padding: "5px 14px",
            display: "flex", alignItems: "center", gap: 9,
            whiteSpace: "nowrap",
            boxShadow: "0 0 18px rgba(34,211,238,0.06), inset 0 0 12px rgba(34,211,238,0.03)",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22d3ee", flexShrink: 0, animation: "tl-blink 1s ease-in-out infinite", display: "inline-block" }} />
            <span style={{ fontSize: 7, color: "#22d3ee55", letterSpacing: "0.2em" }}>TRACKING</span>
            <span style={{ fontSize: 8, color: "#22d3ee99", letterSpacing: "0.16em" }}>{ssTrackMsg.type}</span>
            <span style={{ fontSize: 9, color: "#e2ecff", letterSpacing: "0.12em", fontWeight: 700 }}>{ssTrackMsg.id}</span>
            <span style={{ fontSize: 7, color: "#5a7090", letterSpacing: "0.08em" }}>{ssTrackMsg.detail}</span>
          </div>
        </div>
      )}

      {/* ── Screensaver toggle ───────────────────────────────────────────────── */}
      <div className="absolute" style={{ right: 10, bottom: tickerItems.length > 0 ? 78 : 50, zIndex: 20, fontFamily: "Menlo,Consolas,monospace" }}>
        <button onClick={() => setSsMode(p => !p)} title="Screensaver mode" style={{
          background: ssMode ? "rgba(34,211,238,0.12)" : "rgba(7,9,15,0.88)",
          border: `1px solid ${ssMode ? "#22d3ee66" : "#0d1a2688"}`,
          borderRadius: 4, padding: "5px 10px", cursor: "pointer",
          fontSize: 8, color: ssMode ? "#22d3ee" : "#22d3ee44", letterSpacing: "0.14em",
          boxShadow: ssMode ? "0 0 14px #22d3ee2a, inset 0 0 6px #22d3ee12" : "none",
          transition: "all 0.3s", display: "flex", alignItems: "center", gap: 5,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: ssMode ? "#22d3ee" : "#1e2d44", display: "inline-block",
            boxShadow: ssMode ? "0 0 6px #22d3ee" : "none", transition: "all 0.3s", flexShrink: 0 }} />
          <span>SAVER</span>
        </button>
      </div>

      {/* ── Scanner / audio feeds ─────────────────────────────────────────── */}
      <div className="absolute" style={{ right: 10, bottom: tickerItems.length > 0 ? 38 : 10, zIndex: 20, fontFamily: "Menlo,Consolas,monospace" }}>
        {audioOpen ? (
          <div style={{ position: "relative", background: "rgba(7,9,15,0.94)", border: "1px solid #0d1a26", borderRadius: 6, padding: "8px 10px", width: 240 }}>
            <button onClick={() => setAudioOpen(false)} style={{ position: "absolute", top: 6, right: 8, background: "none", border: "none", color: "#2a3a52", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>✕</button>
            <div style={{ fontSize: 8, color: "#22d3ee", letterSpacing: "0.16em", marginBottom: 7 }}>◈ SCANNER FEEDS</div>
            <div style={{ fontSize: 8, color: "#4488ff", letterSpacing: "0.1em", marginBottom: 4 }}>STAMFORD FIRE / EMS</div>
            <iframe
              src="https://www.broadcastify.com/webPlayer/27204"
              style={{ width: "100%", height: 46, border: "none", borderRadius: 3 }}
              scrolling="no"
              allow="autoplay"
            />
            <div style={{ fontSize: 7, color: "#1e2d44", marginTop: 5, lineHeight: 1.5 }}>
              Free Broadcastify account required to play
            </div>
          </div>
        ) : (
          <button onClick={() => setAudioOpen(true)} style={{
            background: "rgba(7,9,15,0.88)", border: "1px solid #0d1a2688",
            borderRadius: 4, padding: "4px 9px", cursor: "pointer",
            fontSize: 8, color: "#4488ffaa", letterSpacing: "0.12em",
          }}>
            📡 FEEDS
          </button>
        )}
      </div>

      {/* ── Global CSS ─────────────────────────────────────────────────────── */}
      <style>{`
        /* Full viewport — svh accounts for mobile browser chrome */
        .tl-fullvp { height: 100vh; height: 100svh; }

        /* Fullscreen: hide side panel and suppress all scrollbars */
        :fullscreen .tl-panel-hide { display: none !important; }
        :-webkit-full-screen .tl-panel-hide { display: none !important; }
        :fullscreen ::-webkit-scrollbar { display: none; }
        :-webkit-full-screen ::-webkit-scrollbar { display: none; }

        /* Ongoing overlay */
        .tl-ongoing { text-shadow: 0 0 8px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1); }

        /* Soften blocky NEXRAD tiles with bilinear blur */
        .tl-radar-tile { image-rendering: auto; }
        .tl-orb-tip {
          display: none; position: absolute; top: calc(100% + 8px); left: 50%;
          transform: translateX(-50%);
          background: rgba(7,9,15,0.96); border: 1px solid #1a2d44;
          border-radius: 8px; padding: 8px 12px; white-space: nowrap;
          pointer-events: none; z-index: 9999;
          font-size: 11px; font-family: Menlo,Consolas,monospace;
          color: #cbd5e1; line-height: 1.75; min-width: 160px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.7);
        }
        .tl-orb-wrap:hover .tl-orb-tip { display: block; }

        /* Ticker: 28px content area + safe-area inset for Android/iOS nav bars */
        .tl-ticker-wrap {
          height: calc(28px + env(safe-area-inset-bottom, 0px));
          padding-bottom: env(safe-area-inset-bottom, 0px);
          align-items: flex-start !important;
          padding-top: 5px;
        }

        /* Hide secondary top-bar items on narrow screens */
        @media (max-width: 540px) { .tl-mob-hide { display: none !important; } }

        /* Base tile */
        .tl-base-tile {}

        @keyframes tl-alert-ring {
          0%   { transform: scale(0.25); opacity: 1; }
          100% { transform: scale(3.2);  opacity: 0; }
        }
        @keyframes tl-ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes tl-pulse {
          0%   { transform: translate(-50%,-50%) scale(0); opacity: 0.9; }
          100% { transform: translate(-50%,-50%) scale(1); opacity: 0; }
        }
        @keyframes tl-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
        @keyframes tl-slide-in {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        /* ── Marker appear / disappear (applied to inner wrapper, not Leaflet position div) */
        @keyframes tl-pop-in {
          0%   { transform: scale(0.1) translateY(10px); opacity: 0; }
          50%  { transform: scale(1.2) translateY(-3px); opacity: 1; }
          75%  { transform: scale(0.93) translateY(1px); opacity: 1; }
          100% { transform: scale(1) translateY(0);      opacity: 1; }
        }
        @keyframes tl-pop-out {
          0%   { transform: scale(1) translateY(0);    opacity: 1; }
          40%  { transform: scale(1.15) translateY(-2px); opacity: 0.7; }
          100% { transform: scale(0) translateY(8px);  opacity: 0; }
        }
        .tl-anim {
          animation: tl-pop-in 0.44s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .tl-anim-out {
          animation: tl-pop-out 0.22s ease-in both;
          pointer-events: none;
        }

        /* Leaflet popup reset */
        .tl-popup .leaflet-popup-content-wrapper,
        .tl-popup .leaflet-popup-tip { background: transparent !important; box-shadow: none !important; padding: 0 !important; }
        .tl-popup .leaflet-popup-content { margin: 0 !important; }
        .leaflet-popup-close-button { color: #5a7090 !important; right: 8px !important; top: 8px !important; font-size: 14px !important; }

        /* Tooltip */
        .tl-tt.leaflet-tooltip { background: rgba(7,9,15,0.9) !important; border: 1px solid #1e2d44 !important; color: #ffe066 !important; font-family: Menlo,monospace !important; font-size: 10px !important; border-radius: 4px !important; box-shadow: none !important; }
        .tl-tt.leaflet-tooltip::before { display: none !important; }

        /* Map base */
        .leaflet-container { background: #07090f; }
        .leaflet-bar { border: 1px solid #1e2d44 !important; box-shadow: none !important; }
        /* Hide Leaflet attribution control (attributionControl:false at init) */
        .leaflet-control-attribution { display: none !important; }

        /* Stamford boundary glow */
        .stamford-boundary-path { filter: drop-shadow(0 0 3px rgba(34,211,238,0.6)); }

        /* Zoom-out density: scale icons down at low zoom so marker overlap is less jarring */
        [data-zoom="9"] .leaflet-marker-icon { transform-origin: center; filter: opacity(0.75); }
        [data-zoom="8"] .leaflet-marker-icon { transform-origin: center; filter: opacity(0.6); }
        [data-zoom="7"] .leaflet-marker-icon, [data-zoom="6"] .leaflet-marker-icon,
        [data-zoom="5"] .leaflet-marker-icon { transform-origin: center; filter: opacity(0.4); }

        /* Targeting reticle corner brackets */
        .tl-reticle { position:relative; width:44px; height:44px; }
        .tl-rc { position:absolute; width:9px; height:9px; border-color:#22d3ee; border-style:solid; }
        .tl-rc-tl { top:0; left:0; border-width:1.5px 0 0 1.5px; }
        .tl-rc-tr { top:0; right:0; border-width:1.5px 1.5px 0 0; }
        .tl-rc-bl { bottom:0; left:0; border-width:0 0 1.5px 1.5px; }
        .tl-rc-br { bottom:0; right:0; border-width:0 1.5px 1.5px 0; }
        @keyframes tl-rc-lock { from { opacity:0; transform:scale(1.4); } to { opacity:0.9; transform:scale(1); } }
        .tl-reticle-lock .tl-rc { animation:tl-rc-lock 0.18s ease both; }
        .tl-reticle-lock .tl-rc-tl { animation-delay:0ms; }
        .tl-reticle-lock .tl-rc-tr { animation-delay:25ms; }
        .tl-reticle-lock .tl-rc-bl { animation-delay:50ms; }
        .tl-reticle-lock .tl-rc-br { animation-delay:75ms; }
        @keyframes tl-rc-scan {
          0%   { opacity:0; transform:scale(2.2); }
          45%  { opacity:1; transform:scale(1.05); }
          75%  { transform:scale(0.94); }
          100% { opacity:0.9; transform:scale(1); }
        }
        .tl-reticle-scan .tl-rc { animation:tl-rc-scan 0.55s cubic-bezier(0.34,1.56,0.64,1) both; }
        .tl-reticle-scan .tl-rc-tl { animation-delay:0ms; }
        .tl-reticle-scan .tl-rc-tr { animation-delay:55ms; }
        .tl-reticle-scan .tl-rc-bl { animation-delay:110ms; }
        .tl-reticle-scan .tl-rc-br { animation-delay:165ms; }
        @keyframes tl-rc-unlock { from { opacity:0.9; transform:scale(1); } to { opacity:0; transform:scale(1.6) translateY(-2px); } }
        .tl-reticle-unlock .tl-rc { animation:tl-rc-unlock 0.22s ease-out both; }
        .tl-reticle-unlock .tl-rc-tl { animation-delay:0ms; }
        .tl-reticle-unlock .tl-rc-tr { animation-delay:15ms; }
        .tl-reticle-unlock .tl-rc-bl { animation-delay:30ms; }
        .tl-reticle-unlock .tl-rc-br { animation-delay:45ms; }

        /* Clock mode flip */
        @keyframes tl-clock-flip {
          0%   { opacity: 0; transform: translateY(-4px) skewX(-5deg); filter: brightness(2); }
          55%  { opacity: 1; transform: translateY(0) skewX(0); filter: brightness(1.4); }
          100% { opacity: 1; transform: translateY(0) skewX(0); filter: brightness(1); }
        }
        .tl-clock-flip { animation: tl-clock-flip 0.26s ease-out both; }

        /* Tracking overlay slide-up */
        @keyframes tl-track-msg-in {
          from { opacity:0; transform:translateX(-50%) translateY(6px); }
          to   { opacity:1; transform:translateX(-50%) translateY(0); }
        }

        /* Screensaver popup tactical lock-on animation */
        @keyframes tl-ss-lock {
          0%   { clip-path: inset(100% 0 0 0); opacity: 0; }
          25%  { clip-path: inset(0% 0 65% 0); opacity: 1; }
          55%  { clip-path: inset(0% 0 25% 0); opacity: 1; }
          75%  { clip-path: inset(0%); opacity: 1; transform: scale(1.02); }
          88%  { clip-path: inset(0%); opacity: 1; transform: scale(0.98); }
          100% { clip-path: inset(0%); opacity: 1; transform: scale(1); }
        }
        .tl-ss-popup .leaflet-popup-content-wrapper {
          animation: tl-ss-lock 0.52s cubic-bezier(0.4, 0, 0.2, 1) both;
        }
      `}</style>
    </div>
  );
}

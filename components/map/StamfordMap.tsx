"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type LayerKey = "aircraft" | "radar" | "iss" | "alerts";
type BaseKey  = "satellite" | "hybrid" | "dark";

interface WeatherNow {
  temp: number; wind_speed: number; wind_dir: number;
  humidity: number; cloud_cover: number; precipitation: number; code: number;
}
interface ISSPos {
  latitude: number; longitude: number; altitude: number;
  velocity: number; visibility: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Stamford CT city boundary — Long Island Sound to north border
const STAMFORD_BOUNDS: [[number,number],[number,number]] = [[40.990, -73.657], [41.125, -73.432]];
const STAMFORD = { lat: 41.0534, lng: -73.5387 };

// Base layers — all free, no API key
const BASE_LAYERS: Record<BaseKey, { label: string; url: string; subdomains?: string; maxNativeZoom: number }> = {
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxNativeZoom: 19,
  },
  hybrid: {
    label: "Hybrid",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxNativeZoom: 19,
  },
  dark: {
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    maxNativeZoom: 18,
  },
};

const WMO: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Icy fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Showers", 81: "Heavy showers", 82: "Violent showers",
  85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "T-storm + hail", 99: "Severe T-storm",
};

const LAYER_META: Record<LayerKey, { label: string; color: string }> = {
  aircraft: { label: "Aircraft",   color: "#2a8bff" },
  radar:    { label: "Radar",      color: "#39d97a" },
  iss:      { label: "ISS",        color: "#a78bfa" },
  alerts:   { label: "NWS Alerts", color: "#f59e0b" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function degToCompass(d: number) {
  return ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(d / 22.5) % 16];
}
function mpsToKnots(v: number) { return Math.round(v * 1.944); }
function metersToFt(m: number) { return Math.round(m * 3.281); }
function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function aircraftSVG(heading: number) {
  return `<div style="transform:rotate(${heading}deg);width:22px;height:22px;filter:drop-shadow(0 0 5px #2a8bffaa)">
    <svg viewBox="0 0 32 32" fill="#2a8bff" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 2 C16 2 19 10 19 14 L28 20 L27 23 L19 18 L18 28 L21 30 L16 32 L11 30 L14 28 L13 18 L5 23 L4 20 L13 14 C13 10 16 2 16 2Z"/>
    </svg>
  </div>`;
}

function issSVG() {
  return `<div style="width:26px;height:26px;filter:drop-shadow(0 0 6px #a78bfa)">
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <rect x="13" y="12" width="6" height="8" fill="#a78bfa" rx="1"/>
      <rect x="2"  y="14" width="10" height="4" fill="#a78bfa" rx="1" opacity="0.7"/>
      <rect x="20" y="14" width="10" height="4" fill="#a78bfa" rx="1" opacity="0.7"/>
      <rect x="5"  y="9"  width="4"  height="2" fill="#a78bfa" rx="0.5" opacity="0.5"/>
      <rect x="23" y="9"  width="4"  height="2" fill="#a78bfa" rx="0.5" opacity="0.5"/>
    </svg>
  </div>`;
}

function popupWrap(inner: string) {
  return `<div style="font-family:Menlo,Consolas,monospace;font-size:11px;color:#d8e3f0;background:#07090fee;border:1px solid #1e2d44;border-radius:8px;padding:10px 14px;min-width:180px;line-height:1.9;backdrop-filter:blur(8px)">${inner}</div>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StamfordMap() {
  const mapRef       = useRef<HTMLDivElement>(null);
  const mapInst      = useRef<any>(null);
  const baseTileRef  = useRef<any>(null);
  const labelTileRef = useRef<any>(null);
  const groupRefs    = useRef<Record<LayerKey, any>>({} as any);
  const intervals    = useRef<ReturnType<typeof setInterval>[]>([]);

  const [baseKey,       setBaseKey]       = useState<BaseKey>("satellite");
  const [enabled,       setEnabled]       = useState<Record<LayerKey, boolean>>({ aircraft: true, radar: true, iss: true, alerts: true });
  const [weather,       setWeather]       = useState<WeatherNow | null>(null);
  const [iss,           setIss]           = useState<ISSPos | null>(null);
  const [alertCount,    setAlertCount]    = useState(0);
  const [aircraftCount, setAircraftCount] = useState(0);
  const [lastUpdate,    setLastUpdate]    = useState<Date | null>(null);
  const [panelOpen,     setPanelOpen]     = useState(true);

  // ── Map init ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;

    import("leaflet").then((mod) => {
      const L = mod.default;

      const map = L.map(mapRef.current!, {
        zoomControl: false,
        attributionControl: false,
        maxZoom: 19,
      });

      // Fit to Stamford city bounds
      map.fitBounds(STAMFORD_BOUNDS, { padding: [0, 0] });

      // Initial base layer — satellite
      const base = BASE_LAYERS.satellite;
      baseTileRef.current = L.tileLayer(base.url, { maxNativeZoom: base.maxNativeZoom, maxZoom: 19 }).addTo(map);

      // Attribution
      L.control.attribution({ prefix: false, position: "bottomright" })
        .addAttribution('<span style="color:#2a3a52;font-size:10px">© ESRI · OpenStreetMap · CartoDB · OpenSky · NWS · RainViewer</span>')
        .addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Data layer groups (all added on top of base)
      groupRefs.current = {
        aircraft: L.layerGroup().addTo(map),
        radar:    L.layerGroup().addTo(map),
        iss:      L.layerGroup().addTo(map),
        alerts:   L.layerGroup().addTo(map),
      };

      mapInst.current = map;

      // Initial fetches
      fetchAircraft(L);
      fetchRadar(L);
      fetchISS(L);
      fetchAlerts(L);
    });

    return () => {
      intervals.current.forEach(clearInterval);
      mapInst.current?.remove();
      mapInst.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Base layer swap ───────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapInst.current;
    if (!map) return;

    import("leaflet").then((mod) => {
      const L = mod.default;

      // Remove existing base + label layers
      if (baseTileRef.current)  map.removeLayer(baseTileRef.current);
      if (labelTileRef.current) { map.removeLayer(labelTileRef.current); labelTileRef.current = null; }

      const def = BASE_LAYERS[baseKey];
      const opts: any = { maxNativeZoom: def.maxNativeZoom, maxZoom: 19 };
      if (def.subdomains) opts.subdomains = def.subdomains;

      const newBase = L.tileLayer(def.url, opts);
      newBase.addTo(map);

      // For hybrid: satellite base + dark labels on top
      if (baseKey === "hybrid") {
        const labels = L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
          { subdomains: "abcd", maxNativeZoom: 18, maxZoom: 19, pane: "overlayPane", opacity: 0.85 }
        );
        labels.addTo(map);
        labelTileRef.current = labels;
      }

      baseTileRef.current = newBase;

      // Re-raise all data layer groups so they sit above the new base
      Object.values(groupRefs.current).forEach((g) => g?.bringToFront?.());
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey]);

  // ── Aircraft ──────────────────────────────────────────────────────────────

  const fetchAircraft = useCallback((L: any) => {
    fetch("/api/map/aircraft")
      .then((r) => r.json())
      .then((data) => {
        const group: any = groupRefs.current.aircraft;
        if (!group) return;
        group.clearLayers();
        const states: any[][] = data.states ?? [];
        setAircraftCount(states.length);
        setLastUpdate(new Date());

        states.forEach((s) => {
          const [icao, callsign, country, , , lon, lat, baroAlt, , vel, hdg, , , , , , geoAlt] = s;
          if (lat == null || lon == null) return;
          const alt  = baroAlt ?? geoAlt ?? 0;
          const cs   = (callsign as string)?.trim() || icao;

          const icon = L.divIcon({ html: aircraftSVG(hdg ?? 0), className: "", iconSize: [22, 22], iconAnchor: [11, 11] });
          const marker = L.marker([lat, lon], { icon });

          marker.bindPopup(L.popup({ className: "tl-popup", maxWidth: 240, offset: [0, -4] }).setContent(
            popupWrap(`
              <div style="font-size:13px;font-weight:700;color:#2a8bff;margin-bottom:5px;letter-spacing:.04em">${cs}</div>
              <div style="color:#5a7090;font-size:10px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em">${country ?? "Unknown"} · ${icao}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 14px">
                <span style="color:#5a7090">ALT</span><span>${alt > 0 ? metersToFt(alt).toLocaleString() + " ft" : "—"}</span>
                <span style="color:#5a7090">SPD</span><span>${vel > 0 ? mpsToKnots(vel) + " kt" : "—"}</span>
                <span style="color:#5a7090">HDG</span><span>${hdg ?? 0}° ${degToCompass(hdg ?? 0)}</span>
              </div>`)
          ));
          group.addLayer(marker);
        });
      })
      .catch(() => {});
  }, []);

  // ── Radar ─────────────────────────────────────────────────────────────────

  const fetchRadar = useCallback((L: any) => {
    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then((r) => r.json())
      .then((data) => {
        const frames: any[] = data.radar?.past ?? [];
        if (!frames.length) return;
        const latest = frames[frames.length - 1];
        const url = `https://tilecache.rainviewer.com${latest.path}/256/{z}/{x}/{y}/4/1_1.png`;
        const group: any = groupRefs.current.radar;
        group?.clearLayers();
        group?.addLayer(L.tileLayer(url, { opacity: 0.6, maxNativeZoom: 8, maxZoom: 19 }));
      })
      .catch(() => {});
  }, []);

  // ── ISS ───────────────────────────────────────────────────────────────────

  const fetchISS = useCallback((L: any) => {
    fetch("https://api.wheretheiss.at/v1/satellites/25544")
      .then((r) => r.json())
      .then((d: ISSPos) => {
        setIss(d);
        const group: any = groupRefs.current.iss;
        if (!group) return;
        group.clearLayers();
        const icon = L.divIcon({ html: issSVG(), className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
        const marker = L.marker([d.latitude, d.longitude], { icon });
        marker.bindPopup(L.popup({ className: "tl-popup", maxWidth: 220, offset: [0, -4] }).setContent(
          popupWrap(`
            <div style="font-size:13px;font-weight:700;color:#a78bfa;margin-bottom:5px">ISS · Intl Space Station</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 14px">
              <span style="color:#5a7090">LAT</span><span>${d.latitude.toFixed(3)}°</span>
              <span style="color:#5a7090">LON</span><span>${d.longitude.toFixed(3)}°</span>
              <span style="color:#5a7090">ALT</span><span>${Math.round(d.altitude)} km</span>
              <span style="color:#5a7090">SPD</span><span>${Math.round(d.velocity)} km/h</span>
              <span style="color:#5a7090">VIS</span><span>${d.visibility}</span>
            </div>`)
        ));
        group.addLayer(marker);
      })
      .catch(() => {});
  }, []);

  // ── NWS Alerts ────────────────────────────────────────────────────────────

  const fetchAlerts = useCallback((L: any) => {
    fetch("https://api.weather.gov/alerts/active?area=CT", {
      headers: { "User-Agent": "ThunderLakeSystems/1.0 (tlevander.py@gmail.com)" },
    })
      .then((r) => r.json())
      .then((d) => {
        const features = d.features ?? [];
        setAlertCount(features.length);
        const group: any = groupRefs.current.alerts;
        if (!group) return;
        group.clearLayers();
        features.forEach((f: any) => {
          if (!f.geometry) return;
          const layer = L.geoJSON(f.geometry, {
            style: { color: "#f59e0b", weight: 1.5, opacity: 0.9, fillColor: "#f59e0b", fillOpacity: 0.07 },
          });
          layer.bindPopup(popupWrap(`
            <div style="font-size:12px;font-weight:700;color:#f59e0b;margin-bottom:4px">${f.properties.event}</div>
            <div style="color:#5a7090;margin-bottom:4px">${f.properties.areaDesc}</div>
            <div style="font-size:10px;color:#7a9ab0">${f.properties.headline ?? ""}</div>`));
          group.addLayer(layer);
        });
      })
      .catch(() => {});
  }, []);

  // ── Weather ───────────────────────────────────────────────────────────────

  const fetchWeather = useCallback(() => {
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${STAMFORD.lat}&longitude=${STAMFORD.lng}` +
      `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,cloud_cover,relative_humidity_2m,precipitation` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America/New_York`
    )
      .then((r) => r.json())
      .then((d) => {
        const c = d.current;
        setWeather({ temp: c.temperature_2m, wind_speed: c.wind_speed_10m, wind_dir: c.wind_direction_10m,
          humidity: c.relative_humidity_2m, cloud_cover: c.cloud_cover, precipitation: c.precipitation, code: c.weather_code });
      })
      .catch(() => {});
  }, []);

  // ── Polling ───────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchWeather();
    intervals.current.push(setInterval(fetchWeather, 5 * 60 * 1000));
  }, [fetchWeather]);

  useEffect(() => {
    if (!mapInst.current) return;
    import("leaflet").then((mod) => {
      const L = mod.default;
      intervals.current.push(setInterval(() => fetchAircraft(L), 15_000));
      intervals.current.push(setInterval(() => fetchISS(L), 6_000));
      intervals.current.push(setInterval(() => fetchRadar(L), 5 * 60 * 1000));
      intervals.current.push(setInterval(() => fetchAlerts(L), 10 * 60 * 1000));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Layer toggle ──────────────────────────────────────────────────────────

  function toggleLayer(key: LayerKey) {
    const group = groupRefs.current[key];
    const map   = mapInst.current;
    if (!group || !map) return;
    enabled[key] ? map.removeLayer(group) : group.addTo(map);
    setEnabled((p) => ({ ...p, [key]: !p[key] }));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const cond = weather ? (WMO[weather.code] ?? "Unknown") : null;

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: "#07090f" }}>
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* ── Top strip ──────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-5 px-5 py-2.5"
        style={{ background: "linear-gradient(to bottom, rgba(7,9,15,0.9) 0%, transparent 100%)" }}>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-[#39d97a] animate-pulse" />
          <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#39d97a", letterSpacing: "0.12em" }}>LIVE</span>
        </div>
        {weather ? (
          <>
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#e2ecff" }}>{Math.round(weather.temp)}°F</span>
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#5a7090" }}>{cond}</span>
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#5a7090" }}>{Math.round(weather.wind_speed)} mph {degToCompass(weather.wind_dir)}</span>
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#5a7090" }}>{weather.humidity}% RH</span>
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#5a7090" }}>{weather.cloud_cover}% cloud</span>
            {weather.precipitation > 0 && (
              <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#39d97a" }}>{weather.precipitation} mm</span>
            )}
          </>
        ) : (
          <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 10, color: "#2a3a52" }}>Loading…</span>
        )}
        {alertCount > 0 && (
          <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 10, color: "#f59e0b",
            background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)",
            borderRadius: 4, padding: "1px 6px", letterSpacing: "0.08em" }}>
            {alertCount} NWS ALERT{alertCount !== 1 ? "S" : ""}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#2a3a52" }}>
          STAMFORD CT · 41.05°N 73.54°W
        </span>
      </div>

      {/* ── Panel toggle tab ───────────────────────────────────────────────── */}
      <button onClick={() => setPanelOpen(p => !p)}
        className="absolute z-20 top-1/2 -translate-y-1/2 transition-all duration-300"
        style={{ left: panelOpen ? 228 : 0, background: "rgba(7,9,15,0.88)",
          border: "1px solid #1e2d44", borderLeft: "none", borderRadius: "0 6px 6px 0",
          padding: "10px 4px", cursor: "pointer" }}>
        <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
          <path d={panelOpen ? "M7 2L3 8L7 14" : "M3 2L7 8L3 14"} stroke="#2a8bff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div className="absolute top-0 bottom-0 left-0 z-10 flex flex-col transition-transform duration-300"
        style={{ width: 228, transform: panelOpen ? "translateX(0)" : "translateX(-228px)",
          background: "rgba(7,9,15,0.88)", backdropFilter: "blur(14px)",
          borderRight: "1px solid #1e2d44" }}>

        {/* Header */}
        <div className="px-5 pt-14 pb-4" style={{ borderBottom: "1px solid #111a27" }}>
          <div style={{ fontFamily: "system-ui", fontSize: 10, color: "#2a3a52", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 3 }}>
            Stamford Command
          </div>
          <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 18, color: "#e2ecff", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Live View
          </div>
        </div>

        {/* Base layer switcher */}
        <div className="px-5 py-4" style={{ borderBottom: "1px solid #111a27" }}>
          <div style={{ fontFamily: "system-ui", fontSize: 10, color: "#2a3a52", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
            Base Map
          </div>
          <div className="flex gap-1.5">
            {(["satellite", "hybrid", "dark"] as BaseKey[]).map((k) => (
              <button key={k} onClick={() => setBaseKey(k)}
                style={{
                  flex: 1, padding: "5px 0", fontSize: 10, borderRadius: 5, cursor: "pointer",
                  fontFamily: "system-ui", letterSpacing: "0.04em", textTransform: "capitalize",
                  background: baseKey === k ? (k === "satellite" ? "#1a2e1a" : k === "hybrid" ? "#1a1a2e" : "#1a2432") : "transparent",
                  border: `1px solid ${baseKey === k ? (k === "satellite" ? "#39d97a44" : k === "hybrid" ? "#a78bfa44" : "#2a8bff44") : "#1e2d44"}`,
                  color: baseKey === k ? (k === "satellite" ? "#39d97a" : k === "hybrid" ? "#a78bfa" : "#2a8bff") : "#5a7090",
                }}>
                {BASE_LAYERS[k].label}
              </button>
            ))}
          </div>
        </div>

        {/* Airspace count */}
        <div className="px-5 py-4" style={{ borderBottom: "1px solid #111a27" }}>
          <div style={{ fontFamily: "system-ui", fontSize: 10, color: "#2a3a52", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            Airspace
          </div>
          <div className="flex items-baseline gap-2">
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 28, fontWeight: 700, color: "#2a8bff", lineHeight: 1 }}>{aircraftCount}</span>
            <span style={{ fontFamily: "system-ui", fontSize: 11, color: "#5a7090" }}>aircraft tracked</span>
          </div>
          {lastUpdate && (
            <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#2a3a52", marginTop: 3 }}>{fmtTime(lastUpdate)}</div>
          )}
        </div>

        {/* ISS */}
        {iss && (
          <div className="px-5 py-4" style={{ borderBottom: "1px solid #111a27" }}>
            <div style={{ fontFamily: "system-ui", fontSize: 10, color: "#2a3a52", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              ISS
            </div>
            <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#a78bfa", lineHeight: 1.9 }}>
              <div>{iss.latitude.toFixed(2)}° {iss.latitude >= 0 ? "N" : "S"} · {Math.abs(iss.longitude).toFixed(2)}° {iss.longitude >= 0 ? "E" : "W"}</div>
              <div style={{ color: "#5a7090" }}>{Math.round(iss.altitude)} km · {Math.round(iss.velocity)} km/h</div>
            </div>
          </div>
        )}

        {/* Layer toggles */}
        <div className="px-5 py-4 flex-1">
          <div style={{ fontFamily: "system-ui", fontSize: 10, color: "#2a3a52", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
            Layers
          </div>
          <div className="flex flex-col gap-3">
            {(Object.keys(LAYER_META) as LayerKey[]).map((key) => {
              const { label, color } = LAYER_META[key];
              const on = enabled[key];
              return (
                <button key={key} onClick={() => toggleLayer(key)}
                  className="flex items-center gap-3 text-left"
                  style={{ opacity: on ? 1 : 0.4, cursor: "pointer", background: "none", border: "none", padding: 0 }}>
                  <div style={{ width: 34, height: 18, borderRadius: 9, flexShrink: 0, position: "relative", transition: "all .2s",
                    background: on ? color + "28" : "#1e2d44", border: `1px solid ${on ? color + "55" : "#1e2d44"}` }}>
                    <div style={{ position: "absolute", top: 2, width: 14, height: 14, borderRadius: "50%",
                      background: on ? color : "#2a3a52", left: on ? 16 : 2, transition: "all .2s",
                      boxShadow: on ? `0 0 6px ${color}88` : "none" }} />
                  </div>
                  <span style={{ fontFamily: "system-ui", fontSize: 12, color: on ? "#d8e3f0" : "#5a7090" }}>{label}</span>
                  {key === "alerts" && alertCount > 0 && (
                    <span style={{ marginLeft: "auto", fontFamily: "Menlo,Consolas,monospace", fontSize: 9,
                      color: "#f59e0b", background: "rgba(245,158,11,0.15)", borderRadius: 3, padding: "1px 5px" }}>
                      {alertCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3" style={{ borderTop: "1px solid #111a27" }}>
          <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#1e2d44", lineHeight: 1.8 }}>
            Aircraft 15s · ISS 6s · Radar 5m · Weather 5m
          </div>
        </div>
      </div>

      {/* Leaflet overrides */}
      <style>{`
        .tl-popup .leaflet-popup-content-wrapper,
        .tl-popup .leaflet-popup-tip { background: transparent !important; box-shadow: none !important; padding: 0 !important; }
        .tl-popup .leaflet-popup-content { margin: 0 !important; }
        .leaflet-popup-close-button { color: #5a7090 !important; right: 8px !important; top: 8px !important; font-size: 14px !important; }
        .leaflet-container { background: #07090f; }
        .leaflet-control-zoom a { background: rgba(7,9,15,0.88) !important; border-color: #1e2d44 !important; color: #5a7090 !important; }
        .leaflet-control-zoom a:hover { color: #e2ecff !important; }
        .leaflet-bar { border: 1px solid #1e2d44 !important; box-shadow: none !important; }
        .leaflet-tile-pane { image-rendering: -webkit-optimize-contrast; }
      `}</style>
    </div>
  );
}

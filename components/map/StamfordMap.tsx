"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type LayerKey = "aircraft" | "radar" | "iss" | "alerts";

interface WeatherNow {
  temp: number;
  wind_speed: number;
  wind_dir: number;
  humidity: number;
  cloud_cover: number;
  precipitation: number;
  code: number;
}

interface ISSPos {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  visibility: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STAMFORD = { lat: 41.0534, lng: -73.5387 };

const WMO: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Icy fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Showers", 81: "Heavy showers", 82: "Violent showers",
  85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "T-storm + hail", 99: "Severe T-storm",
};

const LAYER_META: Record<LayerKey, { label: string; color: string; dot?: string }> = {
  aircraft: { label: "Aircraft",    color: "#2a8bff" },
  radar:    { label: "Radar",       color: "#39d97a" },
  iss:      { label: "ISS",         color: "#a78bfa" },
  alerts:   { label: "NWS Alerts",  color: "#f59e0b" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function degToCompass(deg: number) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function mpsToKnots(mps: number) { return Math.round(mps * 1.944); }
function metersToFt(m: number)   { return Math.round(m * 3.281); }
function fmtTime(d: Date)        { return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); }

function aircraftSVG(heading: number, color = "#2a8bff") {
  return `<div style="transform:rotate(${heading}deg);width:22px;height:22px;filter:drop-shadow(0 0 4px ${color}88)">
    <svg viewBox="0 0 32 32" fill="${color}" xmlns="http://www.w3.org/2000/svg">
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

// ── Main component ────────────────────────────────────────────────────────────

export default function StamfordMap() {
  const mapRef        = useRef<HTMLDivElement>(null);
  const mapInst       = useRef<any>(null);
  const groupRefs     = useRef<Record<LayerKey, any>>({} as any);
  const radarLayer    = useRef<any>(null);
  const intervalsRef  = useRef<ReturnType<typeof setInterval>[]>([]);

  const [enabled, setEnabled] = useState<Record<LayerKey, boolean>>({
    aircraft: true, radar: true, iss: true, alerts: true,
  });
  const [weather,       setWeather]       = useState<WeatherNow | null>(null);
  const [iss,           setIss]           = useState<ISSPos | null>(null);
  const [alertCount,    setAlertCount]    = useState(0);
  const [aircraftCount, setAircraftCount] = useState(0);
  const [lastAircraftAt, setLastAircraftAt] = useState<Date | null>(null);
  const [panelOpen,     setPanelOpen]     = useState(true);

  // ── Map init ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;

    import("leaflet").then((mod) => {
      const L = mod.default;

      const map = L.map(mapRef.current!, {
        center: [STAMFORD.lat, STAMFORD.lng],
        zoom: 11,
        zoomControl: false,
        attributionControl: false,
      });

      // Dark base tiles (CartoDB Dark Matter)
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { subdomains: "abcd", maxZoom: 18 }
      ).addTo(map);

      // Attribution (subtle, bottom-right)
      L.control.attribution({ prefix: false, position: "bottomright" })
        .addAttribution('<span style="color:#2a3a52;font-size:10px">© OpenStreetMap · CartoDB · OpenSky · Open-Meteo · NWS · RainViewer</span>')
        .addTo(map);

      // Zoom control (bottom-right)
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Layer groups
      const aircraft = L.layerGroup().addTo(map);
      const radar    = L.layerGroup().addTo(map);
      const iss      = L.layerGroup().addTo(map);
      const alerts   = L.layerGroup().addTo(map);

      groupRefs.current = { aircraft, radar, iss, alerts };
      mapInst.current = map;

      // Initial data fetches
      fetchAircraft(L);
      fetchRadar(L);
      fetchISS(L);
      fetchAlerts(L);
    });

    return () => {
      intervalsRef.current.forEach(clearInterval);
      mapInst.current?.remove();
      mapInst.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Aircraft ──────────────────────────────────────────────────────────────

  const fetchAircraft = useCallback((L: any) => {
    fetch("/api/map/aircraft")
      .then((r) => r.json())
      .then((data) => {
        const group = groupRefs.current.aircraft;
        if (!group) return;
        group.clearLayers();

        const states: any[][] = data.states ?? [];
        setAircraftCount(states.length);
        setLastAircraftAt(new Date());

        states.forEach((s) => {
          const [icao, callsign, country, , , lon, lat, baroAlt, , vel, hdg, , , , , , geoAlt] = s;
          if (lat == null || lon == null) return;

          const alt   = baroAlt ?? geoAlt ?? 0;
          const speed = vel ?? 0;
          const head  = hdg ?? 0;
          const cs    = (callsign as string)?.trim() || icao;

          const icon = L.divIcon({
            html: aircraftSVG(head),
            className: "",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });

          const marker = L.marker([lat, lon], { icon });

          const popup = L.popup({ className: "ac-popup", maxWidth: 240, offset: [0, -4] }).setContent(`
            <div style="font-family:Menlo,Consolas,monospace;font-size:11px;color:#d8e3f0;background:#0e1219;border:1px solid #1e2d44;border-radius:8px;padding:10px 14px;min-width:180px;line-height:1.9">
              <div style="font-size:13px;font-weight:700;color:#2a8bff;margin-bottom:6px;letter-spacing:.04em">${cs}</div>
              <div style="color:#5a7090;font-size:10px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em">${country ?? "Unknown"} · ${icao}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px">
                <span style="color:#5a7090">ALT</span><span>${alt > 0 ? metersToFt(alt).toLocaleString() + " ft" : "—"}</span>
                <span style="color:#5a7090">SPD</span><span>${speed > 0 ? mpsToKnots(speed) + " kt" : "—"}</span>
                <span style="color:#5a7090">HDG</span><span>${head}° ${degToCompass(head)}</span>
              </div>
            </div>
          `);

          marker.bindPopup(popup);
          group.addLayer(marker);
        });
      })
      .catch(() => {});
  }, []);

  // ── Radar (RainViewer) ────────────────────────────────────────────────────

  const fetchRadar = useCallback((L: any) => {
    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then((r) => r.json())
      .then((data) => {
        const frames: any[] = data.radar?.past ?? [];
        if (!frames.length) return;

        const latest = frames[frames.length - 1];
        const tileUrl = `https://tilecache.rainviewer.com${latest.path}/256/{z}/{x}/{y}/4/1_1.png`;

        const layer = L.tileLayer(tileUrl, { opacity: 0.55, maxZoom: 18 });

        const group = groupRefs.current.radar;
        group?.clearLayers();
        group?.addLayer(layer);
        radarLayer.current = layer;
      })
      .catch(() => {});
  }, []);

  // ── ISS ───────────────────────────────────────────────────────────────────

  const fetchISS = useCallback((L: any) => {
    fetch("https://api.wheretheiss.at/v1/satellites/25544")
      .then((r) => r.json())
      .then((d: ISSPos) => {
        setIss(d);
        const group = groupRefs.current.iss;
        if (!group) return;
        group.clearLayers();

        const icon = L.divIcon({
          html: issSVG(),
          className: "",
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        const marker = L.marker([d.latitude, d.longitude], { icon });
        const popup = L.popup({ className: "ac-popup", maxWidth: 220, offset: [0, -4] }).setContent(`
          <div style="font-family:Menlo,Consolas,monospace;font-size:11px;color:#d8e3f0;background:#0e1219;border:1px solid #1e2d44;border-radius:8px;padding:10px 14px;line-height:1.9">
            <div style="font-size:13px;font-weight:700;color:#a78bfa;margin-bottom:6px">ISS</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px">
              <span style="color:#5a7090">LAT</span><span>${d.latitude.toFixed(3)}°</span>
              <span style="color:#5a7090">LON</span><span>${d.longitude.toFixed(3)}°</span>
              <span style="color:#5a7090">ALT</span><span>${Math.round(d.altitude)} km</span>
              <span style="color:#5a7090">SPD</span><span>${Math.round(d.velocity)} km/h</span>
              <span style="color:#5a7090">VIS</span><span>${d.visibility}</span>
            </div>
          </div>
        `);

        marker.bindPopup(popup);
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

        const group = groupRefs.current.alerts;
        if (!group) return;
        group.clearLayers();

        features.forEach((f: any) => {
          const props = f.properties;
          const geo   = f.geometry;
          if (!geo) return;

          const style = {
            color: "#f59e0b", weight: 1.5, opacity: 0.9,
            fillColor: "#f59e0b", fillOpacity: 0.08,
          };

          const layer = L.geoJSON(geo, { style });
          layer.bindPopup(`
            <div style="font-family:system-ui;font-size:11px;color:#d8e3f0;background:#0e1219;border:1px solid #1e2d44;border-radius:8px;padding:10px 14px;max-width:220px;line-height:1.6">
              <div style="font-size:12px;font-weight:700;color:#f59e0b;margin-bottom:4px">${props.event}</div>
              <div style="color:#5a7090;margin-bottom:6px">${props.areaDesc}</div>
              <div style="font-size:10px;color:#7a9ab0">${props.headline ?? ""}</div>
            </div>
          `);
          group.addLayer(layer);
        });
      })
      .catch(() => {});
  }, []);

  // ── Weather (Open-Meteo) ──────────────────────────────────────────────────

  const fetchWeather = useCallback(() => {
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${STAMFORD.lat}&longitude=${STAMFORD.lng}` +
      `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,cloud_cover,relative_humidity_2m,precipitation` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America/New_York`
    )
      .then((r) => r.json())
      .then((d) => {
        const c = d.current;
        setWeather({
          temp:          c.temperature_2m,
          wind_speed:    c.wind_speed_10m,
          wind_dir:      c.wind_direction_10m,
          humidity:      c.relative_humidity_2m,
          cloud_cover:   c.cloud_cover,
          precipitation: c.precipitation,
          code:          c.weather_code,
        });
      })
      .catch(() => {});
  }, []);

  // ── Polling intervals ─────────────────────────────────────────────────────

  useEffect(() => {
    fetchWeather();
    intervalsRef.current.push(setInterval(fetchWeather, 5 * 60 * 1000));
  }, [fetchWeather]);

  useEffect(() => {
    if (!mapInst.current) return;
    import("leaflet").then((mod) => {
      const L = mod.default;
      intervalsRef.current.push(setInterval(() => fetchAircraft(L), 15_000));
      intervalsRef.current.push(setInterval(() => fetchISS(L), 6_000));
      intervalsRef.current.push(setInterval(() => fetchRadar(L), 5 * 60 * 1000));
      intervalsRef.current.push(setInterval(() => fetchAlerts(L), 10 * 60 * 1000));
    });
  // only want this once after map is ready
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Layer toggle ──────────────────────────────────────────────────────────

  function toggleLayer(key: LayerKey) {
    const group = groupRefs.current[key];
    const map   = mapInst.current;
    if (!group || !map) return;
    if (enabled[key]) {
      map.removeLayer(group);
    } else {
      group.addTo(map);
    }
    setEnabled((p) => ({ ...p, [key]: !p[key] }));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const cond = weather ? (WMO[weather.code] ?? "Unknown") : null;

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: "#07090f" }}>
      {/* Map canvas */}
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* ── Top weather strip ─────────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center gap-6 px-5 py-2.5"
        style={{ background: "linear-gradient(to bottom, rgba(7,9,15,0.92) 0%, rgba(7,9,15,0) 100%)", backdropFilter: "blur(2px)" }}
      >
        {/* Live pulse */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-[#39d97a] animate-pulse" />
          <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#39d97a", letterSpacing: "0.12em" }}>LIVE</span>
        </div>

        {weather ? (
          <>
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#e2ecff" }}>
              {Math.round(weather.temp)}°F
            </span>
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#5a7090" }}>
              {cond}
            </span>
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#5a7090" }}>
              {Math.round(weather.wind_speed)} mph {degToCompass(weather.wind_dir)}
            </span>
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#5a7090" }}>
              {weather.humidity}% RH
            </span>
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#5a7090" }}>
              {weather.cloud_cover}% cloud
            </span>
            {weather.precipitation > 0 && (
              <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#39d97a" }}>
                {weather.precipitation} mm precip
              </span>
            )}
          </>
        ) : (
          <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 10, color: "#2a3a52" }}>Loading weather…</span>
        )}

        {alertCount > 0 && (
          <span
            style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 10, color: "#f59e0b",
              background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)",
              borderRadius: 4, padding: "1px 6px", letterSpacing: "0.08em" }}
          >
            {alertCount} NWS ALERT{alertCount !== 1 ? "S" : ""}
          </span>
        )}

        <span style={{ marginLeft: "auto", fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#2a3a52" }}>
          STAMFORD CT · 41.05°N 73.54°W
        </span>
      </div>

      {/* ── Side panel toggle (tab) ────────────────────────────────────────── */}
      <button
        onClick={() => setPanelOpen((p) => !p)}
        className="absolute z-20 top-1/2 -translate-y-1/2 transition-all duration-300"
        style={{
          left: panelOpen ? 228 : 0,
          background: "rgba(13,17,23,0.9)",
          border: "1px solid #1e2d44",
          borderLeft: panelOpen ? "1px solid #1e2d44" : "none",
          borderRadius: panelOpen ? "0 6px 6px 0" : "0 6px 6px 0",
          padding: "10px 4px",
          color: "#2a3a52",
          cursor: "pointer",
        }}
        aria-label={panelOpen ? "Close panel" : "Open panel"}
      >
        <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
          <path d={panelOpen ? "M7 2L3 8L7 14" : "M3 2L7 8L3 14"} stroke="#2a8bff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* ── Left control panel ─────────────────────────────────────────────── */}
      <div
        className="absolute top-0 bottom-0 left-0 z-10 flex flex-col transition-transform duration-300"
        style={{
          width: 228,
          transform: panelOpen ? "translateX(0)" : "translateX(-228px)",
          background: "rgba(7,9,15,0.85)",
          backdropFilter: "blur(12px)",
          borderRight: "1px solid #1e2d44",
        }}
      >
        {/* Panel header */}
        <div className="px-5 pt-14 pb-4" style={{ borderBottom: "1px solid #121a27" }}>
          <div style={{ fontFamily: "system-ui", fontSize: 11, color: "#2a3a52", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
            Stamford Command
          </div>
          <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 18, color: "#e2ecff", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Live View
          </div>
        </div>

        {/* Aircraft count */}
        <div className="px-5 py-4" style={{ borderBottom: "1px solid #121a27" }}>
          <div style={{ fontFamily: "system-ui", fontSize: 10, color: "#2a3a52", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            Airspace
          </div>
          <div className="flex items-baseline gap-2">
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 28, fontWeight: 700, color: "#2a8bff", lineHeight: 1 }}>
              {aircraftCount}
            </span>
            <span style={{ fontFamily: "system-ui", fontSize: 11, color: "#5a7090" }}>aircraft tracked</span>
          </div>
          {lastAircraftAt && (
            <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#2a3a52", marginTop: 4 }}>
              {fmtTime(lastAircraftAt)}
            </div>
          )}
        </div>

        {/* ISS status */}
        {iss && (
          <div className="px-5 py-4" style={{ borderBottom: "1px solid #121a27" }}>
            <div style={{ fontFamily: "system-ui", fontSize: 10, color: "#2a3a52", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              ISS Position
            </div>
            <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#a78bfa", lineHeight: 1.8 }}>
              <div>{iss.latitude.toFixed(2)}° {iss.latitude >= 0 ? "N" : "S"}</div>
              <div>{Math.abs(iss.longitude).toFixed(2)}° {iss.longitude >= 0 ? "E" : "W"}</div>
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
              const meta = LAYER_META[key];
              const on   = enabled[key];
              return (
                <button
                  key={key}
                  onClick={() => toggleLayer(key)}
                  className="flex items-center gap-3 text-left transition-opacity"
                  style={{ opacity: on ? 1 : 0.4, cursor: "pointer", background: "none", border: "none", padding: 0 }}
                >
                  {/* Toggle track */}
                  <div
                    style={{
                      width: 34, height: 18, borderRadius: 9, flexShrink: 0,
                      background: on ? meta.color + "33" : "#1e2d44",
                      border: `1px solid ${on ? meta.color + "66" : "#1e2d44"}`,
                      position: "relative", transition: "all .2s",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute", top: 2, width: 14, height: 14, borderRadius: "50%",
                        background: on ? meta.color : "#2a3a52",
                        left: on ? 16 : 2, transition: "all .2s",
                        boxShadow: on ? `0 0 6px ${meta.color}88` : "none",
                      }}
                    />
                  </div>
                  <span style={{ fontFamily: "system-ui", fontSize: 12, color: on ? "#d8e3f0" : "#5a7090" }}>
                    {meta.label}
                  </span>
                  {key === "alerts" && alertCount > 0 && (
                    <span style={{
                      marginLeft: "auto", fontFamily: "Menlo,Consolas,monospace", fontSize: 9,
                      color: "#f59e0b", background: "rgba(245,158,11,0.15)", borderRadius: 3,
                      padding: "1px 5px",
                    }}>
                      {alertCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel footer */}
        <div className="px-5 py-3" style={{ borderTop: "1px solid #121a27" }}>
          <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#1e2d44", lineHeight: 1.7 }}>
            Aircraft · 15s refresh<br />
            ISS · 6s refresh<br />
            Radar · 5m refresh<br />
            Weather · 5m refresh
          </div>
        </div>
      </div>

      {/* ── Leaflet popup override styles ──────────────────────────────────── */}
      <style>{`
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .leaflet-popup-content { margin: 0 !important; }
        .leaflet-container { background: #07090f; }
        .leaflet-control-zoom a {
          background: rgba(13,17,23,0.9) !important;
          border-color: #1e2d44 !important;
          color: #5a7090 !important;
        }
        .leaflet-control-zoom a:hover { color: #e2ecff !important; }
        .leaflet-bar { border: 1px solid #1e2d44 !important; box-shadow: none !important; }
        .leaflet-popup-close-button { color: #5a7090 !important; right: 6px !important; top: 6px !important; }
      `}</style>
    </div>
  );
}

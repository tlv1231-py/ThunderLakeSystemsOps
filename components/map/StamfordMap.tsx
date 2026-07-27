"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type LayerKey = "aircraft" | "radar" | "iss" | "alerts" | "lightning" | "transit" | "services";
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

const STAMFORD_BOUNDS: [[number, number], [number, number]] = [[40.990, -73.657], [41.125, -73.432]];
const STAMFORD = { lat: 41.0534, lng: -73.5387 };

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
  45: "Fog", 51: "Light drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 80: "Showers", 95: "Thunderstorm",
};

interface LayerMeta { label: string; color: string; section: "overhead" | "atmospheric" | "city" }

const LAYER_META: Record<LayerKey, LayerMeta> = {
  aircraft:  { label: "Aircraft",   color: "#2a8bff", section: "overhead"    },
  iss:       { label: "ISS",        color: "#a78bfa", section: "overhead"    },
  radar:     { label: "Radar",      color: "#39d97a", section: "atmospheric" },
  lightning: { label: "Lightning",  color: "#ffe066", section: "atmospheric" },
  alerts:    { label: "NWS Alerts", color: "#f59e0b", section: "atmospheric" },
  transit:   { label: "Transit",    color: "#60a5fa", section: "city"        },
  services:  { label: "Services",   color: "#4ade80", section: "city"        },
};

const SECTIONS: { key: "overhead" | "atmospheric" | "city"; label: string }[] = [
  { key: "overhead",    label: "Overhead"    },
  { key: "atmospheric", label: "Atmospheric" },
  { key: "city",        label: "City Intel"  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const degToCompass = (d: number) =>
  ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(d / 22.5) % 16];
const mpsToKnots = (v: number) => Math.round(v * 1.944);
const metersToFt = (m: number) => Math.round(m * 3.281);
const fmtTime   = (d: Date) =>
  d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

function aircraftSVG(heading: number) {
  return `<div style="transform:rotate(${heading}deg);width:22px;height:22px;filter:drop-shadow(0 0 5px #2a8bffaa)">
    <svg viewBox="0 0 32 32" fill="#2a8bff" xmlns="http://www.w3.org/2000/svg">
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
      <text x="13" y="17" text-anchor="middle" fill="#93c5fd" font-family="Menlo,monospace" font-size="7" font-weight="700">${label}</text>
      <polygon points="13,2 11,6 15,6" fill="#60a5fa" transform="rotate(${heading},13,13)"/>
    </svg>
  </div>`;
}

const SERVICE_CFG: Record<string, { color: string; symbol: string }> = {
  fire_station: { color: "#ff4466", symbol: "▲" },
  hospital:     { color: "#22c55e", symbol: "+" },
  police:       { color: "#60a5fa", symbol: "★" },
  urgent_care:  { color: "#f59e0b", symbol: "+" },
  pharmacy:     { color: "#a78bfa", symbol: "Rx" },
  school:       { color: "#64748b", symbol: "■" },
};

function serviceSVG(amenity: string) {
  const s = SERVICE_CFG[amenity] ?? { color: "#5a7090", symbol: "•" };
  const round = amenity === "fire_station" ? "3px" : "50%";
  return `<div style="width:20px;height:20px;border-radius:${round};
    background:${s.color}18;border:1.5px solid ${s.color};
    display:flex;align-items:center;justify-content:center;
    font-size:${amenity === "pharmacy" ? "6px" : "9px"};
    color:${s.color};font-weight:900;line-height:1;
    filter:drop-shadow(0 0 4px ${s.color}55)">${s.symbol}</div>`;
}

function popupWrap(inner: string) {
  return `<div style="font-family:Menlo,Consolas,monospace;font-size:11px;color:#d8e3f0;background:#07090fee;
    border:1px solid #1e2d44;border-radius:8px;padding:10px 14px;min-width:180px;line-height:1.9;
    backdrop-filter:blur(8px)">${inner}</div>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StamfordMap() {
  const mapRef      = useRef<HTMLDivElement>(null);
  const mapInst     = useRef<any>(null);
  const baseTileRef = useRef<any>(null);
  const labelRef    = useRef<any>(null);
  const groupRefs   = useRef<Record<LayerKey, any>>({} as any);
  const intervals   = useRef<ReturnType<typeof setInterval>[]>([]);

  // Lightning-specific refs
  const lightningMarkersRef  = useRef<{ marker: any; born: number }[]>([]);
  const lightningWsRef       = useRef<WebSocket | null>(null);
  const strikeCountMinRef    = useRef(0);

  const [baseKey,       setBaseKey]       = useState<BaseKey>("satellite");
  const [enabled,       setEnabled]       = useState<Record<LayerKey, boolean>>({
    aircraft: true, radar: true, iss: true, alerts: true,
    lightning: true, transit: true, services: true,
  });
  const [weather,       setWeather]       = useState<WeatherNow | null>(null);
  const [iss,           setIss]           = useState<ISSPos | null>(null);
  const [alertCount,    setAlertCount]    = useState(0);
  const [aircraftCount, setAircraftCount] = useState(0);
  const [transitCount,  setTransitCount]  = useState(0);
  const [servicesCount, setServicesCount] = useState(0);
  const [strikeCount,   setStrikeCount]   = useState(0);
  const [strikesPerMin, setStrikesPerMin] = useState(0);
  const [lastUpdate,    setLastUpdate]    = useState<Date | null>(null);
  const [panelOpen,     setPanelOpen]     = useState(true);
  const [wsStatus,      setWsStatus]      = useState<"connecting" | "live" | "offline">("connecting");

  // ── Fetch functions ───────────────────────────────────────────────────────

  const fetchAircraft = useCallback((L: any) => {
    fetch("/api/map/aircraft")
      .then(r => r.json())
      .then(data => {
        const g = groupRefs.current.aircraft;
        if (!g) return;
        g.clearLayers();
        const states: any[][] = data.states ?? [];
        setAircraftCount(states.length);
        setLastUpdate(new Date());
        states.forEach(s => {
          const [icao, callsign, country, , , lon, lat, baroAlt, , vel, hdg, , , , , , geoAlt] = s;
          if (lat == null || lon == null) return;
          const alt = baroAlt ?? geoAlt ?? 0;
          const cs  = (callsign as string)?.trim() || icao;
          const icon = L.divIcon({ html: aircraftSVG(hdg ?? 0), className: "", iconSize: [22, 22], iconAnchor: [11, 11] });
          L.marker([lat, lon], { icon })
            .bindPopup(L.popup({ className: "tl-popup", maxWidth: 240, offset: [0, -4] }).setContent(
              popupWrap(`<div style="font-size:13px;font-weight:700;color:#2a8bff;margin-bottom:5px">${cs}</div>
              <div style="color:#5a7090;font-size:10px;margin-bottom:8px;text-transform:uppercase">${country ?? "?"} · ${icao}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 14px">
                <span style="color:#5a7090">ALT</span><span>${alt > 0 ? metersToFt(alt).toLocaleString() + " ft" : "—"}</span>
                <span style="color:#5a7090">SPD</span><span>${vel > 0 ? mpsToKnots(vel) + " kt" : "—"}</span>
                <span style="color:#5a7090">HDG</span><span>${hdg ?? 0}° ${degToCompass(hdg ?? 0)}</span>
              </div>`)))
            .addTo(g);
        });
      })
      .catch(() => {});
  }, []);

  const fetchRadar = useCallback((L: any) => {
    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then(r => r.json())
      .then(data => {
        const frames: any[] = data.radar?.past ?? [];
        if (!frames.length) return;
        const url = `https://tilecache.rainviewer.com${frames[frames.length - 1].path}/256/{z}/{x}/{y}/4/1_1.png`;
        const g = groupRefs.current.radar;
        g?.clearLayers();
        g?.addLayer(L.tileLayer(url, { opacity: 0.6, maxNativeZoom: 8, maxZoom: 19 }));
      })
      .catch(() => {});
  }, []);

  const fetchISS = useCallback((L: any) => {
    fetch("https://api.wheretheiss.at/v1/satellites/25544")
      .then(r => r.json())
      .then((d: ISSPos) => {
        setIss(d);
        const g = groupRefs.current.iss;
        if (!g) return;
        g.clearLayers();
        const icon = L.divIcon({ html: issSVG(), className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
        L.marker([d.latitude, d.longitude], { icon })
          .bindPopup(L.popup({ className: "tl-popup", maxWidth: 220, offset: [0, -4] }).setContent(
            popupWrap(`<div style="font-size:13px;font-weight:700;color:#a78bfa;margin-bottom:5px">ISS · Intl Space Station</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 14px">
              <span style="color:#5a7090">ALT</span><span>${Math.round(d.altitude)} km</span>
              <span style="color:#5a7090">SPD</span><span>${Math.round(d.velocity)} km/h</span>
              <span style="color:#5a7090">VIS</span><span>${d.visibility}</span>
            </div>`)))
          .addTo(g);
      })
      .catch(() => {});
  }, []);

  const fetchAlerts = useCallback((L: any) => {
    fetch("https://api.weather.gov/alerts/active?area=CT", {
      headers: { "User-Agent": "ThunderLakeSystems/1.0 (tlevander.py@gmail.com)" },
    })
      .then(r => r.json())
      .then(d => {
        const features = d.features ?? [];
        setAlertCount(features.length);
        const g = groupRefs.current.alerts;
        if (!g) return;
        g.clearLayers();
        features.forEach((f: any) => {
          if (!f.geometry) return;
          L.geoJSON(f.geometry, {
            style: { color: "#f59e0b", weight: 1.5, opacity: 0.9, fillColor: "#f59e0b", fillOpacity: 0.07 },
          })
            .bindPopup(popupWrap(`<div style="font-size:12px;font-weight:700;color:#f59e0b;margin-bottom:4px">${f.properties.event}</div>
            <div style="color:#5a7090;margin-bottom:4px">${f.properties.areaDesc}</div>
            <div style="font-size:10px;color:#7a9ab0">${f.properties.headline ?? ""}</div>`))
            .addTo(g);
        });
      })
      .catch(() => {});
  }, []);

  const fetchTransit = useCallback((L: any) => {
    fetch("/api/map/transit")
      .then(r => r.json())
      .then(data => {
        const vehicles: any[] = data.vehicles ?? [];
        setTransitCount(vehicles.length);
        const g = groupRefs.current.transit;
        if (!g) return;
        g.clearLayers();
        vehicles.forEach(v => {
          const icon = L.divIcon({ html: transitSVG(v.routeTag, v.heading), className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
          L.marker([v.lat, v.lon], { icon })
            .bindPopup(L.popup({ className: "tl-popup", maxWidth: 220, offset: [0, -4] }).setContent(
              popupWrap(`<div style="font-size:13px;font-weight:700;color:#60a5fa;margin-bottom:5px">Route ${v.routeTag}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 14px">
                <span style="color:#5a7090">BUS</span><span>${v.id}</span>
                <span style="color:#5a7090">HDG</span><span>${v.heading}° ${degToCompass(v.heading)}</span>
                <span style="color:#5a7090">SPD</span><span>${v.speedKmHr} km/h</span>
                <span style="color:#5a7090">AGE</span><span>${v.secsSinceReport}s</span>
              </div>`)))
            .addTo(g);
        });
      })
      .catch(() => {});
  }, []);

  const fetchServices = useCallback((L: any) => {
    fetch("/api/map/services")
      .then(r => r.json())
      .then(data => {
        const elements: any[] = data.elements ?? [];
        setServicesCount(elements.length);
        const g = groupRefs.current.services;
        if (!g) return;
        g.clearLayers();
        elements.forEach(el => {
          const lat = el.lat ?? el.center?.lat;
          const lon = el.lon ?? el.center?.lon;
          if (!lat || !lon) return;
          const amenity = el.tags?.amenity ?? "unknown";
          const name    = el.tags?.name ?? amenity.replace("_", " ");
          const s       = SERVICE_CFG[amenity] ?? { color: "#5a7090", symbol: "•" };
          const addr    = [el.tags?.["addr:housenumber"], el.tags?.["addr:street"]].filter(Boolean).join(" ");
          const icon    = L.divIcon({ html: serviceSVG(amenity), className: "", iconSize: [20, 20], iconAnchor: [10, 10] });
          L.marker([lat, lon], { icon })
            .bindPopup(L.popup({ className: "tl-popup", maxWidth: 220, offset: [0, -4] }).setContent(
              popupWrap(`<div style="font-size:13px;font-weight:700;color:${s.color};margin-bottom:4px">${name}</div>
              <div style="color:#5a7090;text-transform:capitalize;font-size:10px;margin-bottom:4px">${amenity.replace(/_/g, " ")}</div>
              ${addr ? `<div style="color:#7a9ab0;font-size:10px">${addr}</div>` : ""}
              ${el.tags?.phone ? `<div style="color:#7a9ab0;font-size:10px">${el.tags.phone}</div>` : ""}`)))
            .addTo(g);
        });
      })
      .catch(() => {});
  }, []);

  const fetchWeather = useCallback(() => {
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${STAMFORD.lat}&longitude=${STAMFORD.lng}` +
      `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,cloud_cover,relative_humidity_2m,precipitation` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America/New_York`
    )
      .then(r => r.json())
      .then(d => {
        const c = d.current;
        setWeather({ temp: c.temperature_2m, wind_speed: c.wind_speed_10m, wind_dir: c.wind_direction_10m,
          humidity: c.relative_humidity_2m, cloud_cover: c.cloud_cover, precipitation: c.precipitation, code: c.weather_code });
      })
      .catch(() => {});
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

      ws.onopen = () => {
        ws.send(JSON.stringify({ a: 111 }));
        setWsStatus("live");
      };

      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data as string);
          let lat = d.lat, lon = d.lon;
          if (lat == null || lon == null) return;
          // Guard against nano-degree encoding (blitzortung v1 format)
          if (Math.abs(lat) > 90) { lat /= 1e7; lon /= 1e7; }
          // Only show strikes within ~200 mi of Stamford
          if (lat < 38.5 || lat > 43.5 || lon < -76.5 || lon > -70.5) return;

          const g = groupRefs.current.lightning;
          if (!g) return;

          // Local strikes (within Stamford city) get bigger radius
          const local = lat > 40.9 && lat < 41.2 && lon > -73.7 && lon < -73.4;
          const marker = L.circleMarker([lat, lon], {
            radius: local ? 12 : 6,
            color: local ? "#fffde0" : "#ffe066",
            fillColor: local ? "#ffffff" : "#ffe066",
            fillOpacity: local ? 1 : 0.85,
            opacity: 1,
            weight: local ? 2 : 1,
          });
          marker.bindTooltip(`⚡ ${lat.toFixed(3)}, ${lon.toFixed(3)}`, { className: "tl-tt", sticky: true });
          g.addLayer(marker);
          lightningMarkersRef.current.push({ marker, born: Date.now() });
          strikeCountMinRef.current += 1;
          setStrikeCount(prev => prev + 1);
        } catch {}
      };

      ws.onclose = () => {
        setWsStatus("offline");
        idx++;
        setTimeout(connect, 4000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
  }, []);

  // ── Main init effect (all setup here) ────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;

    import("leaflet").then(mod => {
      const L = mod.default;

      const map = L.map(mapRef.current!, { zoomControl: false, attributionControl: false, maxZoom: 19 });
      map.fitBounds(STAMFORD_BOUNDS, { padding: [0, 0] });

      baseTileRef.current = L.tileLayer(BASE_LAYERS.satellite.url, {
        maxNativeZoom: 19, maxZoom: 19,
      }).addTo(map);

      L.control.attribution({ prefix: false, position: "bottomright" })
        .addAttribution('<span style="color:#2a3a52;font-size:10px">© ESRI · CartoDB · OSM · OpenSky · NWS · RainViewer · Blitzortung · UMO</span>')
        .addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);

      groupRefs.current = {
        aircraft:  L.layerGroup().addTo(map),
        radar:     L.layerGroup().addTo(map),
        iss:       L.layerGroup().addTo(map),
        alerts:    L.layerGroup().addTo(map),
        lightning: L.layerGroup().addTo(map),
        transit:   L.layerGroup().addTo(map),
        services:  L.layerGroup().addTo(map),
      };

      mapInst.current = map;

      // Initial data fetches
      fetchAircraft(L); fetchRadar(L); fetchISS(L); fetchAlerts(L);
      fetchTransit(L); fetchServices(L);

      // Polling
      intervals.current.push(setInterval(() => fetchAircraft(L), 15_000));
      intervals.current.push(setInterval(() => fetchISS(L), 6_000));
      intervals.current.push(setInterval(() => fetchRadar(L), 5 * 60_000));
      intervals.current.push(setInterval(() => fetchAlerts(L), 10 * 60_000));
      intervals.current.push(setInterval(() => fetchTransit(L), 30_000));
      intervals.current.push(setInterval(() => fetchServices(L), 15 * 60_000));

      // Lightning WS
      setupLightning(L);

      // Strike fade — runs every 1s, removes markers older than 90s
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

      // Strikes-per-minute counter reset
      intervals.current.push(setInterval(() => {
        setStrikesPerMin(strikeCountMinRef.current);
        strikeCountMinRef.current = 0;
      }, 60_000));
    });

    return () => {
      intervals.current.forEach(clearInterval);
      lightningWsRef.current?.close();
      lightningWsRef.current = null;
      mapInst.current?.remove();
      mapInst.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Weather (independent of map)
  useEffect(() => {
    fetchWeather();
    const id = setInterval(fetchWeather, 5 * 60_000);
    return () => clearInterval(id);
  }, [fetchWeather]);

  // ── Base layer swap ───────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapInst.current;
    if (!map) return;
    import("leaflet").then(mod => {
      const L = mod.default;
      if (baseTileRef.current) map.removeLayer(baseTileRef.current);
      if (labelRef.current)    { map.removeLayer(labelRef.current); labelRef.current = null; }

      const def  = BASE_LAYERS[baseKey];
      const opts: any = { maxNativeZoom: def.maxNativeZoom, maxZoom: 19 };
      if (def.subdomains) opts.subdomains = def.subdomains;
      baseTileRef.current = L.tileLayer(def.url, opts).addTo(map);

      if (baseKey === "hybrid") {
        labelRef.current = L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
          { subdomains: "abcd", maxNativeZoom: 18, maxZoom: 19, pane: "overlayPane", opacity: 0.9 }
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

  // ── Render ────────────────────────────────────────────────────────────────

  const cond = weather ? (WMO[weather.code] ?? "Unknown") : null;

  const layerBadge: Partial<Record<LayerKey, string>> = {
    aircraft:  aircraftCount  > 0 ? String(aircraftCount)  : undefined,
    alerts:    alertCount     > 0 ? String(alertCount)     : undefined,
    lightning: strikeCount    > 0 ? String(strikeCount)    : undefined,
    transit:   transitCount   > 0 ? String(transitCount)   : undefined,
    services:  servicesCount  > 0 ? String(servicesCount)  : undefined,
  };

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: "#07090f" }}>
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* ── Top strip ──────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-4 px-5 py-2"
        style={{ background: "linear-gradient(to bottom, rgba(7,9,15,0.93) 0%, transparent 100%)" }}>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-[#39d97a] animate-pulse" />
          <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#39d97a", letterSpacing: "0.14em" }}>LIVE</span>
        </div>

        {/* Lightning status */}
        <div className="flex items-center gap-1 shrink-0">
          <span style={{ color: wsStatus === "live" ? "#ffe066" : wsStatus === "connecting" ? "#5a7090" : "#2a2a1a", fontSize: 11 }}>⚡</span>
          <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 9, letterSpacing: "0.1em",
            color: wsStatus === "live" ? "#ffe066" : wsStatus === "connecting" ? "#5a7090" : "#2a2a1a" }}>
            {wsStatus === "live" ? (strikesPerMin > 0 ? `${strikesPerMin}/min` : "live") : wsStatus}
          </span>
        </div>

        {weather ? (
          <>
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#e2ecff" }}>{Math.round(weather.temp)}°F</span>
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#5a7090" }}>{cond}</span>
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#5a7090" }}>{Math.round(weather.wind_speed)} mph {degToCompass(weather.wind_dir)}</span>
            <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#5a7090" }}>{weather.humidity}% RH</span>
            {weather.precipitation > 0 && <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 11, color: "#39d97a" }}>{weather.precipitation}mm</span>}
          </>
        ) : (
          <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 10, color: "#2a3a52" }}>Loading…</span>
        )}

        {alertCount > 0 && (
          <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#f59e0b",
            background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.28)",
            borderRadius: 4, padding: "1px 6px", letterSpacing: "0.08em" }}>
            {alertCount} ALERT{alertCount !== 1 ? "S" : ""}
          </span>
        )}

        <span style={{ marginLeft: "auto", fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#2a3a52" }}>
          STAMFORD CT · 41.05°N 73.54°W
        </span>
      </div>

      {/* ── Panel tab ──────────────────────────────────────────────────────── */}
      <button onClick={() => setPanelOpen(p => !p)}
        className="absolute z-20 top-1/2 -translate-y-1/2 transition-all duration-300"
        style={{ left: panelOpen ? 232 : 0,
          background: "rgba(7,9,15,0.88)", border: "1px solid #1e2d44", borderLeft: "none",
          borderRadius: "0 6px 6px 0", padding: "10px 4px", cursor: "pointer" }}>
        <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
          <path d={panelOpen ? "M7 2L3 8L7 14" : "M3 2L7 8L3 14"} stroke="#2a8bff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div className="absolute top-0 bottom-0 left-0 z-10 flex flex-col transition-transform duration-300"
        style={{ width: 232, transform: panelOpen ? "translateX(0)" : "translateX(-232px)",
          background: "rgba(7,9,15,0.91)", backdropFilter: "blur(18px)", borderRight: "1px solid #111a27" }}>

        {/* Title */}
        <div className="px-5 pt-12 pb-4" style={{ borderBottom: "1px solid #111a27" }}>
          <div style={{ fontFamily: "system-ui", fontSize: 9, color: "#2a3a52", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 3 }}>Stamford Command</div>
          <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 18, color: "#e2ecff", fontWeight: 700, letterSpacing: "-0.02em" }}>Live View</div>
        </div>

        {/* Base map switcher */}
        <div className="px-5 py-4" style={{ borderBottom: "1px solid #111a27" }}>
          <div className="flex gap-1.5">
            {(["satellite", "hybrid", "dark"] as BaseKey[]).map(k => {
              const active = baseKey === k;
              const accent = k === "satellite" ? "#4ade80" : k === "hybrid" ? "#c4b5fd" : "#60a5fa";
              return (
                <button key={k} onClick={() => setBaseKey(k)}
                  style={{
                    flex: 1, padding: "5px 0", fontSize: 9, borderRadius: 5, cursor: "pointer",
                    fontFamily: "system-ui", letterSpacing: "0.06em", textTransform: "uppercase",
                    background: active ? accent + "14" : "transparent",
                    border: `1px solid ${active ? accent + "55" : "#1e2d44"}`,
                    color: active ? accent : "#2a3a52",
                    transition: "all 0.15s",
                  }}>
                  {BASE_LAYERS[k].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick stats row */}
        <div className="px-5 py-3 flex gap-4" style={{ borderBottom: "1px solid #111a27" }}>
          {[
            { val: aircraftCount, label: "Aircraft", color: "#2a8bff" },
            { val: transitCount,  label: "Buses",    color: "#60a5fa" },
            { val: strikeCount,   label: "Strikes",  color: "#ffe066" },
          ].map(({ val, label, color }) => (
            <div key={label}>
              <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontFamily: "system-ui", fontSize: 9, color: "#2a3a52", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ISS mini */}
        {iss && (
          <div className="px-5 py-3" style={{ borderBottom: "1px solid #111a27" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#a78bfa", fontSize: 12 }}>◈</span>
              <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 10, color: "#5a7090", lineHeight: 1.7 }}>
                <span style={{ color: "#a78bfa", marginRight: 6 }}>ISS</span>
                {iss.latitude.toFixed(2)}° {iss.latitude >= 0 ? "N" : "S"} · {Math.abs(iss.longitude).toFixed(2)}° {iss.longitude >= 0 ? "E" : "W"}
              </div>
            </div>
          </div>
        )}

        {/* Layer toggles — grouped */}
        <div className="flex-1 overflow-y-auto py-3" style={{ scrollbarWidth: "none" }}>
          {SECTIONS.map(({ key: sectionKey, label: sectionLabel }) => {
            const layers = (Object.entries(LAYER_META) as [LayerKey, LayerMeta][]).filter(([, m]) => m.section === sectionKey);
            return (
              <div key={sectionKey} className="px-5 mb-5">
                <div style={{ fontFamily: "system-ui", fontSize: 9, color: "#1e2d44", letterSpacing: "0.14em",
                  textTransform: "uppercase", marginBottom: 10, paddingBottom: 4, borderBottom: "1px solid #0d1520" }}>
                  {sectionLabel}
                </div>
                <div className="flex flex-col gap-3">
                  {layers.map(([key, { label, color }]) => {
                    const on  = enabled[key];
                    const cnt = layerBadge[key];
                    return (
                      <button key={key} onClick={() => toggleLayer(key)}
                        className="flex items-center gap-3 text-left"
                        style={{ opacity: on ? 1 : 0.35, cursor: "pointer", background: "none", border: "none", padding: 0, transition: "opacity .15s" }}>
                        {/* Toggle pill */}
                        <div style={{ width: 32, height: 17, borderRadius: 8.5, flexShrink: 0, position: "relative",
                          background: on ? color + "20" : "#0d1520", border: `1px solid ${on ? color + "50" : "#1e2d44"}`,
                          transition: "all .2s" }}>
                          <div style={{ position: "absolute", top: 2, width: 13, height: 13, borderRadius: "50%",
                            background: on ? color : "#1e2d44", left: on ? 15 : 2, transition: "all .2s",
                            boxShadow: on ? `0 0 6px ${color}88` : "none" }} />
                        </div>
                        <span style={{ fontFamily: "system-ui", fontSize: 12, color: on ? "#d8e3f0" : "#2a3a52", flex: 1 }}>{label}</span>
                        {cnt && (
                          <span style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color, background: color + "18",
                            border: `1px solid ${color}33`, borderRadius: 3, padding: "1px 5px", minWidth: 18, textAlign: "center" }}>
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

        {/* Footer */}
        <div className="px-5 py-3" style={{ borderTop: "1px solid #111a27" }}>
          {lastUpdate && (
            <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#1e2d44", marginBottom: 2 }}>
              {fmtTime(lastUpdate)}
            </div>
          )}
          <div style={{ fontFamily: "Menlo,Consolas,monospace", fontSize: 9, color: "#111a27", lineHeight: 1.7 }}>
            AC 15s · ISS 6s · Bus 30s · Radar 5m
          </div>
        </div>
      </div>

      {/* ── CSS overrides ──────────────────────────────────────────────────── */}
      <style>{`
        .tl-popup .leaflet-popup-content-wrapper,
        .tl-popup .leaflet-popup-tip { background: transparent !important; box-shadow: none !important; padding: 0 !important; }
        .tl-popup .leaflet-popup-content { margin: 0 !important; }
        .leaflet-popup-close-button { color: #5a7090 !important; right: 8px !important; top: 8px !important; font-size: 14px !important; }
        .tl-tt.leaflet-tooltip { background: rgba(7,9,15,0.88) !important; border: 1px solid #1e2d44 !important; color: #ffe066 !important; font-family: Menlo,monospace !important; font-size: 10px !important; border-radius: 4px !important; box-shadow: none !important; }
        .tl-tt.leaflet-tooltip::before { display: none !important; }
        .leaflet-container { background: #07090f; }
        .leaflet-control-zoom a { background: rgba(7,9,15,0.88) !important; border-color: #1e2d44 !important; color: #5a7090 !important; }
        .leaflet-control-zoom a:hover { color: #e2ecff !important; }
        .leaflet-bar { border: 1px solid #1e2d44 !important; box-shadow: none !important; }
      `}</style>
    </div>
  );
}

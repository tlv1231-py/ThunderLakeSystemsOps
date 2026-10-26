import { NextResponse } from "next/server";

const LAT_MIN = 40.99, LAT_MAX = 41.13;
const LON_MIN = -73.66, LON_MAX = -73.43;

const EVENT_COLOR: Record<string, string> = {
  roadwork:              "#f59e0b",
  closures:              "#ff2244",
  accidentsAndIncidents: "#ff4444",
  trafficConditions:     "#fb923c",
};

function inStamford(lat: number, lon: number) {
  return lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX;
}

async function fetchCT511(debug = false): Promise<
  | { ok: true;  events: any[]; raw?: any }
  | { ok: false; reason: string; status?: number; raw?: string }
> {
  const key = process.env.CT511_KEY;
  if (!key) return { ok: false, reason: "no_key" };

  try {
    // Confirmed endpoint from ctroads.org/help/endpoint/event docs
    const res = await fetch(
      `https://ctroads.org/api/v2/get/event?key=${key}&format=json`,
      { next: { revalidate: 0 }, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, reason: "http_error", status: res.status, ...(debug ? { raw: body.slice(0, 300) } : {}) };
    }

    const raw: any[] = await res.json();
    if (!Array.isArray(raw)) {
      return { ok: false, reason: "unexpected_shape", ...(debug ? { raw: JSON.stringify(raw).slice(0, 300) } : {}) };
    }

    // Parse CT511 date fields — handles ISO strings, Unix seconds, Unix ms,
    // and Microsoft /Date(...)/ format. Values < 1e10 are treated as seconds.
    const parseApiDate = (v: any): number | null => {
      if (v == null || v === "" || v === false) return null;
      if (typeof v === "number") {
        if (v <= 0) return null;
        return v < 1e10 ? v * 1000 : v;
      }
      if (typeof v === "string") {
        // Microsoft /Date(epoch)/ — may be seconds or ms
        const msMatch = v.match(/\/Date\((-?\d+)/);
        if (msMatch) {
          const n = parseInt(msMatch[1]);
          return n <= 0 ? null : n < 1e10 ? n * 1000 : n;
        }
        // Pure numeric string (Unix timestamp)
        if (/^\d+$/.test(v)) {
          const n = parseInt(v);
          return n > 0 ? (n < 1e10 ? n * 1000 : n) : null;
        }
      }
      const d = new Date(v);
      if (isNaN(d.getTime())) return null;
      const ms = d.getTime();
      // Guard against sentinel "zero" dates (e.g. "0001-01-01") returned by some APIs
      return ms > -31536000000 ? ms : null; // reject dates before 1969
    };

    const events = raw
      .filter(e => {
        const lat = Number(e.Latitude);
        const lon = Number(e.Longitude);
        return !isNaN(lat) && !isNaN(lon) && inStamford(lat, lon);
      })
      .map(e => ({
        id:          String(e.ID ?? ""),
        type:        e.EventType ?? "roadwork",
        subtype:     e.EventSubType ?? "",
        color:       EVENT_COLOR[e.EventType] ?? "#f59e0b",
        road:        e.RoadwayName ?? "",
        direction:   e.DirectionOfTravel ?? "",
        description: e.Description ?? e.Comment ?? "",
        severity:    e.Severity ?? "",
        closure:     e.IsFullClosure ?? false,
        lat:         Number(e.Latitude),
        lon:         Number(e.Longitude),
        startMs:     parseApiDate(e.StartDate ?? e.CreatedDate ?? e.EventDate ?? e.LastUpdated),
      }));

    return { ok: true, events, ...(debug ? { raw: raw.slice(0, 2) } : {}) };
  } catch (e: any) {
    return { ok: false, reason: "exception", ...(debug ? { raw: String(e) } : {}) };
  }
}

// ── Road geometry lookup ─────────────────────────────────────────────────────

interface RoadGeom { name: string; ref: string; coords: [number, number][] }

async function fetchRoadGeometries(): Promise<RoadGeom[]> {
  const BBOX = "40.99,-73.66,41.13,-73.43";
  const query = `[out:json][timeout:25];
way["highway"~"^(motorway|motorway_link|trunk|primary|secondary|tertiary)$"](${BBOX});
out geom tags;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(22000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.elements ?? [])
      .filter((el: any) => el.type === "way" && el.geometry?.length >= 2)
      .map((el: any) => ({
        name: (el.tags?.name ?? "").toLowerCase(),
        ref:  (el.tags?.ref  ?? "").toLowerCase(),
        coords: el.geometry.map((p: any) => [p.lat, p.lon] as [number, number]),
      }));
  } catch {
    return [];
  }
}

function _roadNum(s: string): string | null {
  const m = s.match(/\d+/);
  return m ? m[0] : null;
}

function _dsq(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dl = lat1 - lat2, dlo = lon1 - lon2;
  return dl * dl + dlo * dlo;
}

function _nearSegment(
  coords: [number, number][], lat: number, lon: number, radDeg: number
): [number, number][] | null {
  let start = -1, end = -1;
  for (let i = 0; i < coords.length; i++) {
    if (Math.sqrt(_dsq(coords[i][0], coords[i][1], lat, lon)) <= radDeg) {
      if (start < 0) start = i;
      end = i;
    }
  }
  if (start < 0 || end <= start) return null;
  return coords.slice(Math.max(0, start - 2), Math.min(coords.length - 1, end + 2) + 1);
}

function findRoadGeom(
  roads: RoadGeom[], evRoad: string, lat: number, lon: number
): [number, number][] | null {
  const evNum = _roadNum(evRoad.toLowerCase());
  let candidates = evNum
    ? roads.filter(r => _roadNum(r.name) === evNum || _roadNum(r.ref) === evNum)
    : roads.filter(r => r.name.length > 3 && evRoad.toLowerCase().includes(r.name.slice(0, 6)));
  if (!candidates.length) candidates = roads;

  let bestCoords: [number, number][] | null = null;
  let bestDist = Infinity;
  for (const road of candidates) {
    for (const c of road.coords) {
      const d = _dsq(c[0], c[1], lat, lon);
      if (d < bestDist) { bestDist = d; bestCoords = road.coords; }
    }
  }
  if (!bestCoords || Math.sqrt(bestDist) > 0.009) return null;
  return _nearSegment(bestCoords, lat, lon, 0.005);
}

async function fetchOverpass(): Promise<any[]> {
  const BBOX = "40.99,-73.66,41.13,-73.43";
  const query = `[out:json][timeout:20];
(
  way["highway"]["construction"](${BBOX});
  way["construction"]["highway"](${BBOX});
  node["highway"="construction"](${BBOX});
  way["access"="no"]["highway"](${BBOX});
);
out center tags;`;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.elements ?? [])
      .map((el: any) => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        const tags = el.tags ?? {};
        return {
          id:          String(el.id),
          type:        "roadwork",
          subtype:     "",
          color:       "#f59e0b",
          road:        tags.name ?? tags["addr:street"] ?? tags.highway ?? "",
          direction:   "",
          description: tags.description ?? tags.construction ?? "",
          severity:    "",
          closure:     false,
          lat,
          lon,
        };
      })
      .filter((e: any) => e.lat && e.lon);
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.has("debug");
  const [ct511, roads] = await Promise.all([fetchCT511(debug), fetchRoadGeometries()]);
  if (ct511.ok) {
    const events = ct511.events.map(ev => {
      if (!ev.road || !ev.lat || !ev.lon) return ev;
      const roadCoords = findRoadGeom(roads, ev.road, ev.lat, ev.lon);
      return roadCoords ? { ...ev, roadCoords } : ev;
    });
    return NextResponse.json({ source: "ct511", events, ...(debug ? { _raw: ct511.raw } : {}) });
  }
  const events = await fetchOverpass();
  return NextResponse.json({ source: "overpass", events, ...(debug ? { _ct511_raw: ct511 } : {}) });
}

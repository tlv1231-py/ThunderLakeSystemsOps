import { NextResponse } from "next/server";

const BBOX = "40.99,-73.66,41.13,-73.43";
const LAT_MIN = 40.99, LAT_MAX = 41.13;
const LON_MIN = -73.66, LON_MAX = -73.43;

// CT 511 event type → display label + severity color
const EVENT_COLOR: Record<string, string> = {
  ACCIDENT:        "#ff4444",
  INCIDENT:        "#ff4444",
  ROAD_CONDITION:  "#f59e0b",
  CONSTRUCTION:    "#f59e0b",
  ROAD_WORK:       "#f59e0b",
  CONGESTION:      "#fb923c",
  CLOSURE:         "#ff2244",
  SPECIAL_EVENT:   "#a78bfa",
};

function inStamford(lat: number, lon: number) {
  return lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX;
}

async function fetchCT511(debug = false): Promise<{ ok: true; events: any[]; raw?: any } | { ok: false; raw?: any }> {
  const key = process.env.CT511_KEY;
  if (!key) return { ok: false };

  try {
    const res = await fetch(
      `https://prod-ct.ibi511.com/api/GetEvents?key=${key}&format=json`,
      { next: { revalidate: 0 }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return { ok: false };

    const data = await res.json();
    const raw: any[] = data.Events ?? data.events ?? data ?? [];

    const events = raw
      .filter((e: any) => {
        const lat = parseFloat(e.Latitude ?? e.latitude ?? e.Location?.Latitude ?? "");
        const lon = parseFloat(e.Longitude ?? e.longitude ?? e.Location?.Longitude ?? "");
        return !isNaN(lat) && !isNaN(lon) && inStamford(lat, lon);
      })
      .map((e: any) => {
        const lat = parseFloat(e.Latitude ?? e.latitude ?? e.Location?.Latitude);
        const lon = parseFloat(e.Longitude ?? e.longitude ?? e.Location?.Longitude);
        const type = (e.Type ?? e.EventType ?? e.type ?? "INCIDENT").toUpperCase().replace(/\s+/g, "_");
        return {
          id:          e.ID ?? e.Id ?? e.id ?? "",
          type,
          color:       EVENT_COLOR[type] ?? "#f59e0b",
          road:        e.RoadwayName ?? e.Location?.RoadwayName ?? e.Location?.Description ?? "",
          description: e.Description ?? e.ShortDescription ?? "",
          direction:   e.Direction ?? e.Location?.Direction ?? "",
          severity:    e.Severity ?? 0,
          lat,
          lon,
        };
      });

    return { ok: true, events, ...(debug ? { raw: raw.slice(0, 3) } : {}) };
  } catch {
    return { ok: false };
  }
}

async function fetchOverpass(): Promise<any[]> {
  const query = `[out:json][timeout:20];
(
  way["highway"]["construction"](${BBOX});
  way["construction"]["highway"](${BBOX});
  node["highway"="construction"](${BBOX});
  way["access"="no"]["highway"](${BBOX});
  way["barrier"="road_works"](${BBOX});
  node["barrier"="road_works"](${BBOX});
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
    return (data.elements ?? []).map((el: any) => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      const tags = el.tags ?? {};
      return {
        id:          String(el.id),
        type:        "CONSTRUCTION",
        color:       "#f59e0b",
        road:        tags.name ?? tags["addr:street"] ?? tags.highway ?? "",
        description: tags.description ?? tags.construction ?? "",
        direction:   "",
        severity:    1,
        lat,
        lon,
      };
    }).filter((e: any) => e.lat && e.lon);
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.has("debug");
  const ct511 = await fetchCT511(debug);
  if (ct511.ok && ct511.events.length > 0) {
    return NextResponse.json({ source: "ct511", events: ct511.events, ...(debug ? { _raw: ct511.raw } : {}) });
  }
  // Fall back to OSM construction data
  const events = await fetchOverpass();
  return NextResponse.json({ source: "overpass", events, ...(debug ? { _ct511_raw: ct511 } : {}) });
}

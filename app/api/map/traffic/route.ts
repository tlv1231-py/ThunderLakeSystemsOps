import { NextResponse } from "next/server";

const LAT_MIN = 40.99, LAT_MAX = 41.13;
const LON_MIN = -73.66, LON_MAX = -73.43;

const EVENT_COLOR: Record<string, string> = {
  roadwork:             "#f59e0b",
  closures:             "#ff2244",
  accidentsAndIncidents: "#ff4444",
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
      }));

    return { ok: true, events, ...(debug ? { raw: raw.slice(0, 2) } : {}) };
  } catch (e: any) {
    return { ok: false, reason: "exception", ...(debug ? { raw: String(e) } : {}) };
  }
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
  const ct511 = await fetchCT511(debug);
  if (ct511.ok) {
    return NextResponse.json({ source: "ct511", events: ct511.events, ...(debug ? { _raw: ct511.raw } : {}) });
  }
  const events = await fetchOverpass();
  return NextResponse.json({ source: "overpass", events, ...(debug ? { _ct511_raw: ct511 } : {}) });
}

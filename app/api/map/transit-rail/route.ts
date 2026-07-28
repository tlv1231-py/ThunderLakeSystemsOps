import { NextResponse } from "next/server";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

// New Haven corridor routes (from MTA GTFS routes.txt)
const NH_ROUTES = new Set(["3", "4", "5", "6"]); // New Haven, New Canaan, Danbury, Waterbury

const ROUTE_LABEL: Record<string, string> = {
  "3": "New Haven", "4": "New Canaan", "5": "Danbury", "6": "Waterbury",
};

// Metro-North stops — from MTA GTFS static stops.txt (2025-07)
const STOPS: Record<string, { name: string; lat: number; lon: number }> = {
  "1":   { name: "Grand Central",        lat: 40.752998, lon: -73.977056 },
  "4":   { name: "Harlem-125 St",        lat: 40.805157, lon: -73.939149 },
  "105": { name: "Mt Vernon East",       lat: 40.912161, lon: -73.832185 },
  "106": { name: "Pelham",               lat: 40.910321, lon: -73.810242 },
  "108": { name: "New Rochelle",         lat: 40.911605, lon: -73.783807 },
  "110": { name: "Larchmont",            lat: 40.933394, lon: -73.759792 },
  "111": { name: "Mamaroneck",           lat: 40.954061, lon: -73.736125 },
  "112": { name: "Harrison",             lat: 40.969432, lon: -73.712964 },
  "114": { name: "Rye",                  lat: 40.985922, lon: -73.682553 },
  "115": { name: "Port Chester",         lat: 41.000732, lon: -73.664700 },
  "116": { name: "Greenwich",            lat: 41.021277, lon: -73.624621 },
  "118": { name: "Cos Cob",              lat: 41.030171, lon: -73.598306 },
  "120": { name: "Riverside",            lat: 41.031682, lon: -73.588173 },
  "121": { name: "Old Greenwich",        lat: 41.033817, lon: -73.565859 },
  "124": { name: "Stamford",             lat: 41.046611, lon: -73.542846 },
  "127": { name: "Noroton Heights",      lat: 41.069041, lon: -73.497880 },
  "128": { name: "Darien",               lat: 41.076913, lon: -73.472966 },
  "129": { name: "Rowayton",             lat: 41.077456, lon: -73.445527 },
  "131": { name: "South Norwalk",        lat: 41.096730, lon: -73.421132 },
  "133": { name: "East Norwalk",         lat: 41.103996, lon: -73.404588 },
  "134": { name: "Westport",             lat: 41.118928, lon: -73.371413 },
  "136": { name: "Green's Farms",        lat: 41.122265, lon: -73.315408 },
  "137": { name: "Southport",            lat: 41.134844, lon: -73.288970 },
  "138": { name: "Fairfield",            lat: 41.143077, lon: -73.257742 },
  "188": { name: "Fairfield-Black Rock", lat: 41.161000, lon: -73.234336 },
  "140": { name: "Bridgeport",           lat: 41.178677, lon: -73.187076 },
  "143": { name: "Stratford",            lat: 41.194255, lon: -73.131532 },
  "145": { name: "Milford",              lat: 41.223231, lon: -73.057647 },
  "190": { name: "West Haven",           lat: 41.271420, lon: -72.963488 },
  "149": { name: "New Haven",            lat: 41.296501, lon: -72.928290 },
  "151": { name: "New Haven-State St",   lat: 41.304979, lon: -72.921747 },
  // New Canaan branch
  "153": { name: "Glenbrook",            lat: 41.070547, lon: -73.520021 },
  "154": { name: "Springdale",           lat: 41.088760, lon: -73.517828 },
  "155": { name: "Talmadge Hill",        lat: 41.116012, lon: -73.498149 },
  "157": { name: "New Canaan",           lat: 41.146305, lon: -73.495626 },
  // Danbury branch
  "158": { name: "Merritt 7",            lat: 41.146618, lon: -73.427859 },
  "160": { name: "Wilton",               lat: 41.196202, lon: -73.432434 },
  "161": { name: "Cannondale",           lat: 41.216620, lon: -73.426703 },
  "162": { name: "Branchville",          lat: 41.267630, lon: -73.441421 },
  "163": { name: "Redding",              lat: 41.325684, lon: -73.433800 },
  "164": { name: "Bethel",               lat: 41.376225, lon: -73.418171 },
  "165": { name: "Danbury",              lat: 41.396146, lon: -73.448790 },
  // Waterbury branch
  "167": { name: "Derby-Shelton",        lat: 41.319718, lon: -73.083548 },
  "168": { name: "Ansonia",              lat: 41.344156, lon: -73.079892 },
  "169": { name: "Seymour",              lat: 41.395139, lon: -73.072499 },
  "171": { name: "Naugatuck",            lat: 41.494204, lon: -73.052655 },
  "172": { name: "Waterbury",            lat: 41.552728, lon: -73.046126 },
};

export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.has("debug");
  const key = process.env.MTA_API_KEY;
  const hdrs: Record<string, string> = {
    "User-Agent": "ThunderLakeSystems/1.0 (tlevander.py@gmail.com)",
  };
  if (key) hdrs["x-api-key"] = key;

  try {
    const res = await fetch(
      "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr",
      { headers: hdrs, next: { revalidate: 0 }, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return NextResponse.json({ trains: [], error: res.status });

    const buf = await res.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buf)
    );

    const now = Math.floor(Date.now() / 1000);
    const trains: any[] = [];
    const debugRows: any[] = [];

    for (const entity of feed.entity) {
      const tu = entity.tripUpdate;
      if (!tu) continue;
      const routeId = String(tu.trip?.routeId ?? "");
      if (!NH_ROUTES.has(routeId)) continue;

      const updates = tu.stopTimeUpdate ?? [];
      if (!updates.length) continue;

      // Find first stop whose departure is still in the future; fall back to last update
      let target = updates[updates.length - 1];
      for (const u of updates) {
        const dep = Number(u.departure?.time ?? u.arrival?.time ?? 0);
        if (dep > now) { target = u; break; }
      }

      const stopId = String(target.stopId ?? "");
      const stop = STOPS[stopId];
      const depSec = Number(target.departure?.time ?? target.arrival?.time ?? 0);
      const dirId = Number(tu.trip?.directionId ?? 0);

      if (debug) {
        debugRows.push({
          id: entity.id, routeId, tripId: tu.trip?.tripId,
          stopId, stopName: stop?.name ?? "?", depSec,
        });
      }

      if (!stop) continue;

      trains.push({
        id: entity.id,
        tripId: String(tu.trip?.tripId ?? ""),
        routeId,
        line: ROUTE_LABEL[routeId] ?? routeId,
        stopId,
        stopName: stop.name,
        lat: stop.lat,
        lon: stop.lon,
        depMs: depSec * 1000,
        dir: dirId === 0 ? "outbound" : "inbound", // 0 = to New Haven, 1 = to GCT
      });
    }

    return NextResponse.json({ trains, ...(debug ? { debug: debugRows } : {}) });
  } catch (e: any) {
    return NextResponse.json({ trains: [], error: String(e) });
  }
}

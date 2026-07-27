import { NextResponse } from "next/server";

// UMO (legacy NextBus) — CT Transit Stamford/Southwest CT division
// Agency code: cttransit-sf (Stamford/Norwalk area)
const AGENCY = "cttransit-sf";

export async function GET() {
  try {
    const res = await fetch(
      `https://retro.umoiq.com/service/publicJSONFeed?command=vehicleLocations&a=${AGENCY}&t=0`,
      { next: { revalidate: 0 }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return NextResponse.json({ vehicles: [] });
    const data = await res.json();

    const raw = data.vehicle ?? [];
    const arr = Array.isArray(raw) ? raw : [raw];

    const vehicles = arr
      .map((v: any) => ({
        id: v.id ?? "",
        routeTag: v.routeTag ?? "?",
        lat: parseFloat(v.lat),
        lon: parseFloat(v.lon),
        heading: parseInt(v.heading ?? "0", 10),
        speedKmHr: parseInt(v.speedKmHr ?? "0", 10),
        secsSinceReport: parseInt(v.secsSinceReport ?? "0", 10),
        predictable: v.predictable === "true",
      }))
      .filter((v: any) => !isNaN(v.lat) && !isNaN(v.lon));

    return NextResponse.json({ vehicles });
  } catch {
    return NextResponse.json({ vehicles: [] });
  }
}

import { NextResponse } from "next/server";

// New Haven Line corridor bounding box
const BBOX = "40.7,-74.1,41.55,-72.8";

// 24h cache — track geometry never changes
export const revalidate = 86400;

export async function GET() {
  const query = `[out:json][timeout:25];
way["railway"="rail"](${BBOX});
out geom;`;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(22000),
    });
    if (!res.ok) return NextResponse.json({ ways: [] });
    const data = await res.json();

    const ways = (data.elements ?? [])
      .filter((e: any) => e.type === "way" && Array.isArray(e.geometry) && e.geometry.length > 1)
      .map((e: any) => ({
        id: e.id,
        coords: (e.geometry as any[]).map(g => [g.lat, g.lon]),
      }));

    return NextResponse.json({ ways });
  } catch {
    return NextResponse.json({ ways: [] });
  }
}

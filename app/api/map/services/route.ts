import { NextResponse } from "next/server";

const BBOX = "40.99,-73.66,41.13,-73.43";

export async function GET() {
  const query = `[out:json][timeout:25];
(
  node["amenity"~"fire_station|hospital|police|urgent_care"](${BBOX});
  way["amenity"~"fire_station|hospital|police|urgent_care"](${BBOX});
  relation["amenity"~"fire_station|hospital|police"](${BBOX});
);
out center tags;`;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(28000),
    });
    if (!res.ok) return NextResponse.json({ elements: [] });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ elements: [] });
  }
}

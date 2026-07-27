import { NextResponse } from "next/server";

const BBOX = "40.99,-73.66,41.13,-73.43";

export async function GET() {
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
    if (!res.ok) return NextResponse.json({ elements: [] });
    const data = await res.json();
    return NextResponse.json({ elements: data.elements ?? [] });
  } catch {
    return NextResponse.json({ elements: [] });
  }
}

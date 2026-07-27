import { NextResponse } from "next/server";

// Bounding box around Stamford CT with generous radius (~80nm)
const LAMIN = 40.5, LOMIN = -74.2, LAMAX = 41.8, LOMAX = -72.5;

export async function GET() {
  try {
    const res = await fetch(
      `https://opensky-network.org/api/states/all?lamin=${LAMIN}&lomin=${LOMIN}&lamax=${LAMAX}&lomax=${LOMAX}`,
      { next: { revalidate: 0 }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return NextResponse.json({ states: [] });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ states: [] });
  }
}

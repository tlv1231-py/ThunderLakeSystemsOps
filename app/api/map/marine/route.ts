import { NextResponse } from "next/server";

// NOAA CO-OPS tide/met stations — both confirmed live
const COOPS_TIDE = [
  { id: "8467150", name: "Bridgeport, CT",  lat: 41.1735, lon: -73.1815 },
  { id: "8465705", name: "New Haven, CT",   lat: 41.2833, lon: -72.9167 },
];

function coopsUrl(stationId: string, product: string) {
  return (
    `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` +
    `?date=latest&station=${stationId}&product=${product}` +
    `&datum=MLLW&time_zone=gmt&units=english&format=json&application=ThunderLakeSystems`
  );
}

async function fetchStation(s: (typeof COOPS_TIDE)[0]) {
  try {
    const [tideRes, windRes] = await Promise.all([
      fetch(coopsUrl(s.id, "water_level"), { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) }),
      fetch(coopsUrl(s.id, "wind"),        { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) }),
    ]);

    const tideData = tideRes.ok ? await tideRes.json() : null;
    const windData = windRes.ok ? await windRes.json() : null;

    const tidePt   = tideData?.data?.slice(-1)?.[0];
    const windPt   = windData?.data?.slice(-1)?.[0];

    if (!tidePt) return null;

    return {
      ...s,
      type: "tide_gauge" as const,
      waterLevel: Math.round(parseFloat(tidePt.v) * 10) / 10,
      windSpeed:  windPt?.s != null ? Math.round(parseFloat(windPt.s) * 1.944 * 10) / 10 : null, // m/s → knots
      windDir:    windPt?.d  != null ? parseFloat(windPt.d)  : null, // degrees
      windGust:   windPt?.g != null ? Math.round(parseFloat(windPt.g) * 1.944 * 10) / 10 : null,
      updated:    tidePt.t,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const results = await Promise.all(COOPS_TIDE.map(fetchStation));
  const stations = results.filter(Boolean);
  return NextResponse.json({ stations });
}

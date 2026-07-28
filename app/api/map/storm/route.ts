import { NextResponse } from "next/server";

// ASOS stations within ~60nm of Stamford — NWS API, no key required
const STATIONS = [
  { id: "KBDR", name: "Bridgeport",        lat: 41.1635, lon: -73.1262 },
  { id: "KHPN", name: "White Plains",      lat: 41.0670, lon: -73.7076 },
  { id: "KBDL", name: "Bradley Intl",      lat: 41.9389, lon: -72.6830 },
  { id: "KGON", name: "Groton-New London", lat: 41.3303, lon: -72.0453 },
  { id: "KSWF", name: "Stewart Intl",      lat: 41.5034, lon: -74.1048 },
];

const val = (o: any): number | null => (o?.value != null ? Number(o.value) : null);

async function fetchObs(st: (typeof STATIONS)[0]) {
  try {
    const res = await fetch(
      `https://api.weather.gov/stations/${st.id}/observations/latest`,
      {
        headers: {
          "User-Agent": "ThunderLakeSystems/1.0 (tlevander.py@gmail.com)",
          Accept: "application/json",
        },
        next: { revalidate: 900 },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const p = data.properties;
    if (!p) return null;

    // NWS windSpeed unit is km/h → convert to knots
    const wsKmh = val(p.windSpeed);
    const wgKmh = val(p.windGust);
    const precip1hMm  = val(p.precipitationLastHour);
    const precip6hMm  = val(p.precipitationLast6Hours);
    const precip24hMm = val(p.precipitationLast24Hours);
    const slpPa  = val(p.seaLevelPressure);
    const tempC  = val(p.temperature);
    const dewpC  = val(p.dewpoint);

    return {
      ...st,
      obsTime:     p.timestamp ?? null,
      description: p.textDescription ?? null,
      tempF:       tempC != null ? Math.round(tempC * 9 / 5 + 32) : null,
      dewpF:       dewpC != null ? Math.round(dewpC * 9 / 5 + 32) : null,
      windKt:      wsKmh != null ? Math.round(wsKmh / 1.852) : null,
      windGustKt:  wgKmh != null ? Math.round(wgKmh / 1.852) : null,
      windDir:     val(p.windDirection),
      slpInHg:     slpPa != null ? Math.round(slpPa / 3386.389 * 100) / 100 : null,
      // mm → inches, 3 decimal places
      precip1hIn:  precip1hMm  != null ? Math.round(precip1hMm  / 25.4 * 1000) / 1000 : null,
      precip6hIn:  precip6hMm  != null ? Math.round(precip6hMm  / 25.4 * 1000) / 1000 : null,
      precip24hIn: precip24hMm != null ? Math.round(precip24hMm / 25.4 * 1000) / 1000 : null,
      humidity:    val(p.relativeHumidity),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const results = await Promise.all(STATIONS.map(fetchObs));
  return NextResponse.json({ stations: results.filter(Boolean) });
}

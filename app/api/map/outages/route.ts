import { NextResponse } from "next/server";

// Eversource CT outage map — Kubra/iFactor data feed
// Two-step: metadata.json → directory → report_conn.json (CT town-level data)
const BASE = "https://outagemap.eversource.com/resources/data/external/interval_generation_data";
const META = "https://outagemap.eversource.com/resources/data/external/interval_generation_data/metadata.json";

// Required: sends Referer or Eversource's CDN returns 403
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Referer": "https://outagemap.eversource.com/external/default.html",
};

interface TownOutage {
  town: string;
  custAffected: number;
  custServed: number;
  pct: number; // percent of served customers affected
}

function parseAreas(areas: any[], result: TownOutage[]) {
  for (const area of areas ?? []) {
    const name: string = area.area_name ?? "";
    const affected: number = area.cust_a?.val ?? 0;
    const served: number = area.cust_s ?? 0;
    // Town-level: no nested areas beyond this, or leaf nodes with real served counts
    if ((!area.areas || area.areas.length === 0) && served > 0) {
      if (affected > 0) {
        result.push({ town: name, custAffected: affected, custServed: served, pct: Math.round(affected / served * 1000) / 10 });
      }
    } else if (area.areas?.length) {
      parseAreas(area.areas, result);
    }
  }
}

export async function GET() {
  try {
    const metaRes = await fetch(META, { headers: HEADERS, signal: AbortSignal.timeout(7000) });
    if (!metaRes.ok) return NextResponse.json({ outages: [], error: "meta_fetch_failed" });

    const metaJson = await metaRes.json();
    const directory: string = metaJson.directory;
    if (!directory) return NextResponse.json({ outages: [], error: "no_directory" });

    const dataRes = await fetch(`${BASE}/${directory}/data.json`, { headers: HEADERS, signal: AbortSignal.timeout(7000) });
    const reportRes = await fetch(`${BASE}/${directory}/report_conn.json`, { headers: HEADERS, signal: AbortSignal.timeout(7000) });

    const [dataJson, reportJson] = await Promise.all([
      dataRes.ok ? dataRes.json() : null,
      reportRes.ok ? reportRes.json() : null,
    ]);

    const summary = dataJson?.summaryFileData ?? null;
    const towns: TownOutage[] = [];

    if (reportJson?.file_data?.areas) {
      parseAreas(reportJson.file_data.areas, towns);
    }

    return NextResponse.json({
      outages: towns,
      summary: summary ? {
        totalAffected: summary.total_cust_a?.val ?? 0,
        totalServed:   summary.total_cust_s ?? 0,
        totalOutages:  summary.total_outages ?? 0,
        generated:     summary.date_generated ?? null,
      } : null,
    });
  } catch (e: any) {
    return NextResponse.json({ outages: [], error: String(e) });
  }
}

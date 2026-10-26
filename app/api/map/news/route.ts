import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 0;

interface NewsItem { ts: number; pub: string; headline: string; }

function parseRSS(xml: string, pub: string): NewsItem[] {
  const items: NewsItem[] = [];
  const re = /<item[\s\S]*?<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const chunk = m[0];
    const titleM = chunk.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const dateM  = chunk.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/);
    const raw = (titleM?.[1] ?? "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();
    if (!raw) continue;
    const ts = dateM ? (new Date(dateM[1].trim()).getTime() || Date.now()) : Date.now();
    items.push({ ts, pub, headline: raw });
  }
  return items;
}

async function fetchFeed(url: string, pub: string): Promise<NewsItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "ThunderLakeSystems/1.0 (tlevander.py@gmail.com)" },
    signal: AbortSignal.timeout(7000),
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];
  return parseRSS(await res.text(), pub);
}

const FEEDS = [
  { url: "https://www.stamfordadvocate.com/local/feed/", pub: "Stamford Advocate" },
  { url: "https://ctmirror.org/feed/",                  pub: "CT Mirror" },
];

export async function GET() {
  try {
    const results = await Promise.allSettled(FEEDS.map(f => fetchFeed(f.url, f.pub)));
    const items: NewsItem[] = [];
    results.forEach(r => { if (r.status === "fulfilled") items.push(...r.value); });
    items.sort((a, b) => b.ts - a.ts);
    return NextResponse.json(
      { items: items.slice(0, 30) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ items: [] });
  }
}

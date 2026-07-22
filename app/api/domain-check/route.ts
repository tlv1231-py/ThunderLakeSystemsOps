import { NextRequest, NextResponse } from "next/server";

const TLDS = [".com", ".io", ".co", ".app", ".net", ".org", ".ai", ".dev", ".tech", ".systems"];

async function checkOne(domain: string, pat: string) {
  try {
    const res = await fetch(
      `https://api.godaddy.com/v1/domains/available?domain=${domain}`,
      { headers: { Authorization: `sso-key ${pat}` } }
    );
    const data = await res.json();
    return {
      domain,
      available: data.available ?? null,
      price: typeof data.price === "number" ? data.price / 1_000_000 : null,
      currency: data.currency ?? "USD",
    };
  } catch {
    return { domain, available: null, price: null, currency: "USD" };
  }
}

export async function GET(req: NextRequest) {
  const pat = process.env.GODADDY_PAT;
  if (!pat) return NextResponse.json({ error: "GODADDY_PAT not configured" }, { status: 500 });

  // Single domain check (from card availability button)
  const singleDomain = req.nextUrl.searchParams.get("domain")?.toLowerCase().trim();
  if (singleDomain) {
    return NextResponse.json(await checkOne(singleDomain, pat));
  }

  const name = req.nextUrl.searchParams.get("name")?.toLowerCase().trim();
  if (!name) return NextResponse.json({ error: "name or domain required" }, { status: 400 });

  const results = await Promise.all(TLDS.map((tld) => checkOne(`${name}${tld}`, pat)));

  return NextResponse.json(results);
}

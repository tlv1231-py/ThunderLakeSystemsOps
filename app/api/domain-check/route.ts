import { NextRequest, NextResponse } from "next/server";

const TLDS = [".com", ".io", ".co", ".app", ".net", ".org", ".ai", ".dev", ".tech", ".systems"];

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.toLowerCase().trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const pat = process.env.GODADDY_PAT;
  if (!pat) return NextResponse.json({ error: "GODADDY_PAT not configured" }, { status: 500 });

  const results = await Promise.all(
    TLDS.map(async (tld) => {
      const domain = `${name}${tld}`;
      try {
        const res = await fetch(
          `https://api.godaddy.com/v1/domains/available?domain=${domain}&checkType=FULL`,
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
    })
  );

  return NextResponse.json(results);
}

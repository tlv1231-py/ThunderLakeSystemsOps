import { NextRequest, NextResponse } from "next/server";

const TLDS = [".com", ".io", ".co", ".app", ".net", ".org", ".ai", ".dev", ".tech", ".systems"];

// RDAP bootstrap — maps TLD to its registry's RDAP base URL
const RDAP_SERVERS: Record<string, string> = {
  ".com":     "https://rdap.verisign.com/com/v1",
  ".net":     "https://rdap.verisign.com/net/v1",
  ".org":     "https://rdap.publicinterestregistry.org/rdap",
  ".io":      "https://rdap.nic.io",
  ".co":      "https://rdap.nic.co",
  ".app":     "https://rdap.nic.google/rdap",
  ".dev":     "https://rdap.nic.google/rdap",
  ".ai":      "https://rdap.nic.ai",
  ".tech":    "https://rdap.nic.tech",
  ".systems": "https://rdap.donuts.co/domain",
};

async function checkOne(domain: string) {
  const tld = "." + domain.split(".").slice(1).join(".");
  const base = RDAP_SERVERS[tld] ?? "https://rdap.org";
  try {
    const res = await fetch(`${base}/domain/${domain}`, {
      headers: { Accept: "application/rdap+json" },
    });
    if (res.status === 404) return { domain, available: true };
    if (res.ok)            return { domain, available: false };
    // Unexpected status — treat as unknown
    return { domain, available: null, error: `RDAP ${res.status}` };
  } catch (e: any) {
    return { domain, available: null, error: e?.message ?? "Network error" };
  }
}

export async function GET(req: NextRequest) {
  const singleDomain = req.nextUrl.searchParams.get("domain")?.toLowerCase().trim();
  if (singleDomain) {
    return NextResponse.json(await checkOne(singleDomain));
  }

  const name = req.nextUrl.searchParams.get("name")?.toLowerCase().trim();
  if (!name) return NextResponse.json({ error: "name or domain required" }, { status: 400 });

  const results = await Promise.all(TLDS.map((tld) => checkOne(`${name}${tld}`)));
  return NextResponse.json(results);
}

import type { DiscoveredOpportunity } from "./types";

const UA = "ThunderLakeSystems/1.0 (ops@thunderlakesystems.com)";
const TIMEOUT = 12_000;

// ── GitHub — search for bounty-labelled issues ────────────────────────────────
export async function fetchGitHubBounties(): Promise<DiscoveredOpportunity[]> {
  // stars:>50 is critical — eliminates fake/trap repos, bounty aggregator cross-posts,
  // and crypto repos with no real maintainer payout history.
  // Fresh date thresholds — recency is the key edge: get in before competition builds
  const d7 = new Date(); d7.setDate(d7.getDate() - 7);
  const d30 = new Date(); d30.setDate(d30.getDate() - 30);
  const fresh7  = d7.toISOString().slice(0, 10);
  const fresh30 = d30.toISOString().slice(0, 10);

  const queries = [
    // Label-based — quality repos only (>50 stars filters 90% of fake/trap repos)
    "label:bounty+is:open+is:issue+stars:>50",
    "label:funded+is:open+is:issue+stars:>50",
    "label:opire+is:open+is:issue+stars:>20",
    // TypeScript/JS language-specific — our highest win-rate domain
    "language:typescript+label:bounty+is:open+is:issue+stars:>30",
    "language:javascript+label:bounty+is:open+is:issue+stars:>30",
    "language:python+label:bounty+is:open+is:issue+stars:>30",
    // Go — solid win rate, less crowded than TS
    "language:go+label:bounty+is:open+is:issue+stars:>20",
    // Opire-funded (Opire pays on merge — most reliable payout)
    "opire+in:body+is:open+is:issue+stars:>20",
    // Algora cross-posts
    "algora+bounty+in:body+is:open+is:issue+stars:>20",
    // Explicit dollar amount + quality repos
    "%22%24%22+bounty+in:title+is:open+is:issue+stars:>50",
    // Good-first-issue = bounded, easy entry — high agent win rate
    "label:good-first-issue+label:bounty+is:open+is:issue+stars:>20",
    // ── FRESH (last 7 days) — highest priority: least competition ───────────
    `label:bounty+is:open+is:issue+created:>${fresh7}`,
    `label:opire+is:open+is:issue+created:>${fresh7}`,
    `algora+in:body+is:open+is:issue+created:>${fresh7}`,
    `opire+in:body+is:open+is:issue+created:>${fresh7}`,
    // ── RECENT (last 30 days) ────────────────────────────────────────────────
    `label:bounty+is:open+is:issue+stars:>10+created:>${fresh30}`,
    `language:typescript+label:bounty+is:open+is:issue+created:>${fresh30}`,
    `language:python+label:bounty+is:open+is:issue+created:>${fresh30}`,
    `language:go+label:bounty+is:open+is:issue+created:>${fresh30}`,
  ];
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": UA,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const seen = new Set<string>();
  const results: DiscoveredOpportunity[] = [];

  for (const q of queries) {
    try {
      const url = `https://api.github.com/search/issues?q=${q}&sort=updated&order=desc&per_page=40`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
      if (!res.ok) continue;
      const data = await res.json() as { items?: any[] };

      for (const item of data.items ?? []) {
        const extId = `github:${item.node_id}`;
        if (seen.has(extId)) continue;
        seen.add(extId);

        const reward = extractReward(item.title + " " + (item.body ?? ""));
        const language = item.repository_url
          ? await fetchRepoLanguage(item.repository_url, headers)
          : null;

        results.push({
          source: "github",
          external_id: extId,
          title: item.title,
          description: (item.body ?? "").slice(0, 3000),
          url: item.html_url,
          repo_url: item.repository_url?.replace("https://api.github.com/repos/", "https://github.com/") ?? null,
          reward_usd: reward,
          reward_raw: reward ? `$${reward}` : null,
          currency: "USD",
          language,
          difficulty: null,
          estimated_hours: null,
          tags: (item.labels ?? []).map((l: any) => l.name as string),
          metadata: {
            number: item.number,
            repo: item.repository_url,
            comments: item.comments,
            reactions: item.reactions?.total_count ?? 0,
          },
          open_prs: 0,
          deadline: null,
        });
      }
    } catch { /* non-fatal — partial results are fine */ }
  }

  return results;
}

async function fetchRepoLanguage(
  apiUrl: string,
  headers: Record<string, string>,
): Promise<string | null> {
  try {
    const res = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.language ?? null;
  } catch { return null; }
}

// ── Algora.io — public bounty feed ────────────────────────────────────────────
export async function fetchAlgoraBounties(): Promise<DiscoveredOpportunity[]> {
  try {
    // Fetch pages 0 and 1 to get up to 100 bounties
    const [res0, res1] = await Promise.all([
      fetch("https://console.algora.io/api/bounties?page=0&pageSize=50&status=OPEN", {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      }),
      fetch("https://console.algora.io/api/bounties?page=1&pageSize=50&status=OPEN", {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      }),
    ]);
    const d0 = res0.ok ? await res0.json() : null;
    const d1 = res1.ok ? await res1.json() : null;
    const p0: any[] = d0 ? (Array.isArray(d0) ? d0 : (d0.items ?? d0.bounties ?? d0.data ?? [])) : [];
    const p1: any[] = d1 ? (Array.isArray(d1) ? d1 : (d1.items ?? d1.bounties ?? d1.data ?? [])) : [];
    const items: any[] = [...p0, ...p1];
    return items.map((b: any): DiscoveredOpportunity => ({
      source: "algora",
      external_id: String(b.id ?? b.bountyId ?? b.number ?? ""),
      title: b.title ?? b.issue?.title ?? "Untitled",
      description: (b.body ?? b.issue?.body ?? b.description ?? "").slice(0, 3000),
      url: b.url ?? b.htmlUrl ?? b.issue?.url ?? `https://console.algora.io/bounties/${b.id}`,
      repo_url: b.repoUrl ?? b.issue?.repoUrl ?? null,
      reward_usd: parseFloat(b.amount ?? b.reward ?? "0") || null,
      reward_raw: b.amountFormatted ?? (b.amount ? `$${b.amount}` : null),
      currency: b.currency ?? "USD",
      language: b.language ?? b.repo?.language ?? null,
      difficulty: null,
      estimated_hours: null,
      tags: (b.labels ?? b.tags ?? []).map((t: any) => typeof t === "string" ? t : t.name),
      metadata: { org: b.org ?? b.orgName, repo: b.repo ?? b.repoName },
      open_prs: b.pullRequestCount ?? b.openPRs ?? 0,
      deadline: b.deadline ?? null,
    }));
  } catch { return []; }
}

// ── IssueHunt — public REST API ───────────────────────────────────────────────
export async function fetchIssueHuntBounties(): Promise<DiscoveredOpportunity[]> {
  try {
    const res = await fetch(
      "https://issuehunt.io/api/v1/issues?page=1&per_page=50&sort=funded_at&state=open",
      {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items: any[] = Array.isArray(data) ? data : (data.issues ?? data.data ?? []);

    return items.map((b: any): DiscoveredOpportunity => ({
      source: "issuehunt",
      external_id: String(b.id ?? b.issue_id ?? ""),
      title: b.title ?? "Untitled",
      description: (b.body ?? b.description ?? "").slice(0, 3000),
      url: b.html_url ?? `https://issuehunt.io/r/${b.full_name}/${b.number}`,
      repo_url: b.repo_url ?? null,
      reward_usd: parseFloat(b.funded_by_sum ?? b.amount ?? "0") || null,
      reward_raw: b.funded_by_sum ? `$${b.funded_by_sum}` : null,
      currency: "USD",
      language: b.language ?? null,
      difficulty: null,
      estimated_hours: null,
      tags: (b.labels ?? []).map((l: any) => typeof l === "string" ? l : l.name),
      metadata: { repo: b.full_name, number: b.number },
      open_prs: b.prs_count ?? 0,
      deadline: b.paid_at ?? null,
    }));
  } catch { return []; }
}

// ── Opire — dedicated bounty platform (payment guaranteed on merge) ───────────
export async function fetchOpireBounties(): Promise<DiscoveredOpportunity[]> {
  try {
    // Opire's public reward listing — their API serves funded issues
    const res = await fetch(
      "https://api.opire.dev/v1/rewards?status=created&per_page=50",
      {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items: any[] = Array.isArray(data) ? data
      : (data.rewards ?? data.items ?? data.data ?? []);

    return items
      .filter((r: any) => r.issue_url || r.issueUrl)
      .map((r: any): DiscoveredOpportunity => {
        const issueUrl: string = r.issue_url ?? r.issueUrl ?? "";
        const amount = parseFloat(r.amount ?? r.total_amount ?? r.price ?? "0") || null;
        return {
          source:          "opire",
          external_id:     String(r.id ?? r._id ?? issueUrl),
          title:           r.issue?.title ?? r.title ?? issueUrl,
          description:     (r.issue?.body ?? r.description ?? "").slice(0, 3000),
          url:             issueUrl,
          repo_url:        issueUrl.replace(/\/issues\/\d+$/, "") ?? null,
          reward_usd:      amount,
          reward_raw:      amount ? `$${amount}` : null,
          currency:        "USD",
          language:        r.issue?.language ?? null,
          difficulty:      null,
          estimated_hours: null,
          tags:            [],
          metadata:        { opire_id: r.id },
          open_prs:        r.trying_count ?? 0,
          deadline:        null,
        };
      });
  } catch { return []; }
}

// ── Run all sources and deduplicate ──────────────────────────────────────────
type SourceCompleteCallback = (source: string, count: number, error?: string) => Promise<void>;

export async function discoverAllOpportunities(opts?: {
  onSourceComplete?: SourceCompleteCallback;
}): Promise<{
  opportunities: DiscoveredOpportunity[];
  log: { source: string; count: number; error?: string }[];
}> {
  const log: { source: string; count: number; error?: string }[] = [];
  const all: DiscoveredOpportunity[] = [];
  const cb = opts?.onSourceComplete;

  const sources: [string, () => Promise<DiscoveredOpportunity[]>][] = [
    ["algora",    fetchAlgoraBounties],
    ["issuehunt", fetchIssueHuntBounties],
    ["opire",     fetchOpireBounties],
    ["github",    fetchGitHubBounties],
  ];

  await Promise.all(sources.map(async ([name, fetcher]) => {
    try {
      const results = await fetcher();
      log.push({ source: name, count: results.length });
      all.push(...results);
      await cb?.(name, results.length);
    } catch (e) {
      const errMsg = String(e);
      log.push({ source: name, count: 0, error: errMsg });
      await cb?.(name, 0, errMsg);
    }
  }));

  // Deduplicate by external_id within each source
  const seen = new Set<string>();
  const deduped = all.filter(o => {
    const key = `${o.source}:${o.external_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { opportunities: deduped, log };
}

// ── Utility: extract dollar amount from free-form text ───────────────────────
function extractReward(text: string): number | null {
  const m = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:USD|usd)?/);
  if (m) return parseFloat(m[1].replace(/,/g, ""));
  const m2 = text.match(/(?:reward|bounty|prize)[:\s]+(\d+(?:\.\d+)?)\s*(?:USD|\$|dollars)/i);
  if (m2) return parseFloat(m2[1]);
  return null;
}

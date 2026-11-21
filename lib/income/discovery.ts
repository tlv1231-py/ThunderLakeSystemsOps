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
    // Polar.sh funded issues — Polar links in issue bodies
    "polar.sh+in:body+is:open+is:issue+stars:>20",
    // Explicit dollar amount in title — highest-probability real bounties
    "%22%24%22+bounty+in:title+is:open+is:issue+stars:>50",
    "%22%24+50%22+is:open+is:issue+stars:>20",
    "%22%24+100%22+is:open+is:issue+stars:>20",
    "%22%24+200%22+is:open+is:issue+stars:>20",
    // [$XXX] bracket-style bounty amounts common on some platforms
    "%22%5B%2450%5D%22+is:open+is:issue+stars:>10",
    "%22%5B%24100%5D%22+is:open+is:issue+stars:>10",
    // Explicit reward in body — "reward: $" patterns
    "%22reward%3A+%24%22+is:open+is:issue+stars:>20",
    // Good-first-issue = bounded, easy entry — high agent win rate
    "label:good-first-issue+label:bounty+is:open+is:issue+stars:>20",
    // Funded label (Polar, IssueHunt, and other platforms use this)
    "label:funded+is:open+is:issue+stars:>20",
    // High-activity help-wanted + bounty combo
    "label:help-wanted+label:bounty+is:open+is:issue+stars:>50",
    // ── FRESH (last 7 days) — highest priority: least competition ───────────
    // stars:>5 minimum to block spam forks (zero-star fake repos with 🎯 issues)
    `label:bounty+is:open+is:issue+created:>${fresh7}+stars:>5`,
    `label:opire+is:open+is:issue+created:>${fresh7}+stars:>5`,
    `algora+in:body+is:open+is:issue+created:>${fresh7}+stars:>5`,
    `opire+in:body+is:open+is:issue+created:>${fresh7}+stars:>5`,
    // ── RECENT (last 30 days) ────────────────────────────────────────────────
    `label:bounty+is:open+is:issue+stars:>10+created:>${fresh30}`,
    `language:typescript+label:bounty+is:open+is:issue+created:>${fresh30}+stars:>5`,
    `language:python+label:bounty+is:open+is:issue+created:>${fresh30}+stars:>5`,
    `language:go+label:bounty+is:open+is:issue+created:>${fresh30}+stars:>5`,
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
          description: (item.body ?? "").slice(0, 6000),
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

// ── Algora.io — REMOVED: company pivoted to recruiting (2025), bounty API dead ─
// GitHub search queries still capture algora-funded issues via `algora+in:body`
export async function fetchAlgoraBounties(): Promise<DiscoveredOpportunity[]> {
  return [];
}

// ── IssueHunt — REMOVED: API returns HTTP 200 with empty body (broken as of 2025) ─
export async function fetchIssueHuntBounties(): Promise<DiscoveredOpportunity[]> {
  return [];
}

// ── Opire — dedicated bounty platform (payment guaranteed on merge) ───────────
// Endpoint: GET /rewards (plain array, no /v1/ prefix)
// Price field: pendingPrice.value in USD cents → divide by 100
// Fetches the GitHub issue body so the scorer can evaluate clarity/tech signals.
export async function fetchOpireBounties(): Promise<DiscoveredOpportunity[]> {
  try {
    const res = await fetch(
      "https://api.opire.dev/rewards",
      {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items: any[] = Array.isArray(data) ? data : [];

    const ghToken = process.env.GITHUB_TOKEN;
    const ghHeaders: Record<string, string> = {
      Accept:              "application/vnd.github+json",
      "User-Agent":        UA,
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (ghToken) ghHeaders["Authorization"] = `Bearer ${ghToken}`;

    const results: DiscoveredOpportunity[] = [];
    for (const r of items.filter((r: any) => r.url)) {
      const issueUrl: string = r.url ?? "";
      const rewardCents: number = r.pendingPrice?.value ?? 0;
      const amount = rewardCents > 0 ? rewardCents / 100 : null;
      const repoUrl = r.project?.url ?? issueUrl.replace(/\/issues\/\d+$/, "") ?? null;

      // Fetch GitHub issue body so the scorer has actual content
      let issueTitle = r.title ?? issueUrl;
      let issueBody = "";
      let issueLabels: string[] = [];
      let repoLanguage: string | null = (r.programmingLanguages as string[] | undefined)?.[0] ?? null;
      try {
        const apiUrl = issueUrl.replace("https://github.com/", "https://api.github.com/repos/");
        const iss = await fetch(apiUrl, { headers: ghHeaders, signal: AbortSignal.timeout(6000) });
        if (iss.ok) {
          const d = await iss.json();
          issueTitle = d.title ?? issueTitle;
          issueBody = (d.body ?? "").slice(0, 3000);
          issueLabels = (d.labels ?? []).map((l: any) => l.name as string);
          if (!repoLanguage && d.repository_url) {
            repoLanguage = await fetchRepoLanguage(d.repository_url, ghHeaders);
          }
        }
      } catch { /* non-fatal */ }

      results.push({
        source:          "opire",
        external_id:     String(r.id ?? issueUrl),
        title:           issueTitle,
        description:     issueBody,
        url:             issueUrl,
        repo_url:        repoUrl,
        reward_usd:      amount,
        reward_raw:      amount ? `$${amount}` : null,
        currency:        "USD",
        language:        repoLanguage,
        difficulty:      null,
        estimated_hours: null,
        tags:            issueLabels,
        metadata:        { opire_id: r.id, org: r.organization?.name },
        open_prs:        (r.tryingUsers as unknown[])?.length ?? 0,
        deadline:        null,
      });
    }
    return results;
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

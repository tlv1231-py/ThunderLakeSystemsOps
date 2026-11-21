/**
 * Directly queue new Opire $10 items that aren't yet in the DB.
 * Fetches GitHub PR count for each, skips if too much competition.
 * Inserts into income_opportunities as "opire" source, score=42, then
 * creates WQ entries for items with open_prs < 5.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const TYLER = "9133c4a3-2734-4390-b9b8-19ddd4eecb8e";
const GITHUB_TOKEN = env.GITHUB_TOKEN;
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "TLS-Scout/1.0",
  "X-GitHub-Api-Version": "2022-11-28",
  Authorization: `Bearer ${GITHUB_TOKEN}`,
};

async function countOpenPRs(owner, repo, issueNum) {
  try {
    const r = await fetch(
      `https://api.github.com/search/issues?q=repo:${owner}/${repo}+is:pr+is:open+${issueNum}&per_page=10`,
      { headers }
    );
    if (!r.ok) return 0;
    const d = await r.json();
    return d.total_count ?? 0;
  } catch { return 0; }
}

// 36 new Opire items not yet in DB
const newItems = [
  "https://github.com/kyresehk190/vault/issues/2",
  "https://github.com/raimeecas/mysql/issues/2",
  "https://github.com/raimeecas/mysql/issues/1",
  "https://github.com/madalynerlge2/chi/issues/1",
  "https://github.com/madalynerlge2/cli/issues/1",
  "https://github.com/jaasielitaigq/pgx/issues/1",
  "https://github.com/RoseMark45/echo/issues/1",
  "https://github.com/rethavonRueden3/cobra/issues/1",
  "https://github.com/rethavonRueden3/go-github/issues/1",
  "https://github.com/MeaganReyesq8/memberlist/issues/1",
  "https://github.com/MariauqmpsA333/go-redis/issues/1",
  "https://github.com/earnestmant2/mysql/issues/1",
  "https://github.com/dungkimtran3d/Traefik/issues/1",
  "https://github.com/elnahomenick123/Gitea/issues/1",
  "https://github.com/elnahomenick123/Vault/issues/1",
  "https://github.com/quachminh11/VictoriaMetrics/issues/1",
  "https://github.com/thaohuynh14zc/GORM/issues/1",
  "https://github.com/thaohuynh14zc/spf13-cobra/issues/5",
  "https://github.com/thaohuynh14zc/urfave-cli/issues/1",
  "https://github.com/alulaalmi/Apache-APISIX/issues/1",
  "https://github.com/victorjones6awpg/Casbin/issues/1",
  "https://github.com/davontepowlowsk1i/gofiber-fiber/issues/1",
  "https://github.com/davontepowlowsk1i/Apache-Pulsar/issues/1",
  "https://github.com/davontepowlowsk1i/CockroachDB/issues/1",
  "https://github.com/rodrickparker11/TiKV/issues/1",
  "https://github.com/juanitahagenes/ClickHouse/issues/1",
  "https://github.com/maitebloger111/Apache-Arrow/issues/1",
  "https://github.com/jeromyritchie52/Apache-ZooKeeper/issues/1",
  "https://github.com/aozorayama45/Apache-DolphinScheduler/issues/1",
  "https://github.com/aozorayama45/Traefik/issues/3",
];

// Also add MeaganReyesq8 direct repos
const meaganItems = [
  "https://github.com/Vikingr2023/awesome-agent-bounties/issues/221",
  "https://github.com/Vikingr2023/awesome-agent-bounties/issues/160",
  "https://github.com/Vikingr2023/awesome-agent-bounties/issues/40",
  "https://github.com/Vikingr2023/awesome-agent-bounties/issues/39",
];

// Fetch issue details and check competition
async function processIssue(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (!m) return null;
  const [, owner, repo, numStr] = m;
  const issueNum = parseInt(numStr);

  // Fetch issue
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNum}`, { headers });
  if (!r.ok) {
    console.log(`  ✗ ${owner}/${repo}#${issueNum}: ${r.status}`);
    return null;
  }
  const issue = await r.json();
  if (issue.state !== "open") {
    console.log(`  - ${owner}/${repo}#${issueNum}: closed`);
    return null;
  }

  // Check repo has real code (not an empty stub)
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (repoRes.ok) {
    const repoData = await repoRes.json();
    if ((repoData.stargazers_count ?? 0) < 5 && (repoData.size ?? 0) < 50) {
      console.log(`  ✗ stub  ${owner}/${repo}  stars=${repoData.stargazers_count} size=${repoData.size}`);
      return null;
    }
  }

  // Extract reward from labels
  const labelText = issue.labels.map(l => l.name).join(" ");
  const rewardMatch = (issue.title + " " + (issue.body ?? "") + " " + labelText)
    .match(/\$(\d+(?:\.\d+)?)/);
  const rewardUsd = rewardMatch ? parseFloat(rewardMatch[1]) : null;

  // Count open PRs mentioning this issue
  const openPRs = await countOpenPRs(owner, repo, issueNum);
  await new Promise(r => setTimeout(r, 300));

  return { owner, repo, issueNum, url, title: issue.title, body: issue.body ?? "", rewardUsd, openPRs, labels: labelText };
}

console.log(`Processing ${newItems.length} new Opire items...\n`);
let queued = 0;
let skipped = 0;

for (const url of newItems) {
  const item = await processIssue(url);
  if (!item) { skipped++; continue; }

  if (item.openPRs >= 5) {
    console.log(`  ✗ skip ${item.owner}/${item.repo}#${item.issueNum} prs=${item.openPRs}`);
    skipped++;
    continue;
  }

  const reward = item.rewardUsd ?? 10;
  const score = 42; // baseline for new Opire $10 items

  // Check if URL already exists
  const { data: existing } = await db.from("income_opportunities")
    .select("id").eq("url", item.url).eq("user_id", TYLER).maybeSingle();
  if (existing) {
    console.log(`  - already exists ${item.owner}/${item.repo}#${item.issueNum}`);
    skipped++;
    continue;
  }

  // Insert into income_opportunities
  const { data: opp, error } = await db.from("income_opportunities").insert({
    user_id: TYLER,
    source: "opire",
    external_id: `github-${item.owner}-${item.repo}-${item.issueNum}`,
    title: item.title,
    description: item.body.slice(0, 2000),
    url: item.url,
    repo_url: `https://github.com/${item.owner}/${item.repo}`,
    reward_usd: reward,
    reward_raw: `$${reward}`,
    currency: "USD",
    language: "Go",
    score,
    status: "queued",
    open_prs: item.openPRs,
    tags: ["opire", `$${reward}`],
    discovered_at: new Date().toISOString(),
  }).select("id").single();

  if (error) {
    console.log(`  ✗ db error ${item.owner}/${item.repo}: ${error.message}`);
    skipped++;
    continue;
  }

  // Create WQ entry
  const { error: wqErr } = await db.from("income_work_queue").insert({
    user_id: TYLER,
    engine: "claude-code",
    title: item.title,
    description: item.body.slice(0, 1000),
    status: "pending",
    priority: 5,
    expected_usd: reward,
    opportunity_id: opp.id,
    repo_url: `https://github.com/${item.owner}/${item.repo}`,
    progress_pct: 0,
    requires_approval: false,
    progress_note: `Opire $${reward} bounty, ${item.openPRs} competing PRs`,
  });

  if (wqErr) {
    console.log(`  ✗ wq error ${item.owner}/${item.repo}: ${wqErr.message}`);
    skipped++;
  } else {
    console.log(`  ✓ queued ${item.owner}/${item.repo}#${item.issueNum} prs=${item.openPRs} $${reward} "${item.title.slice(0, 50)}"`);
    queued++;
  }
  await new Promise(r => setTimeout(r, 200));
}

console.log(`\nDone: ${queued} queued, ${skipped} skipped`);

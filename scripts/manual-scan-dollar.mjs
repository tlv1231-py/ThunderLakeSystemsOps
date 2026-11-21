/**
 * Targeted scan for GitHub issues with explicit dollar amounts in title.
 * These are highest-probability real bounties.
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
const GITHUB_TOKEN = env.GITHUB_TOKEN;
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "TLS-Scout/1.0",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
};

const REPO_BLOCKLIST = [
  "bounty-plaza","bounty-board","bounty-list","bounties-list","crypto-bounty","web3-bounty",
  "defi-bounty","bountyscout","bounty-scout","bug-bounty-list","bug-bounties","/bug-bounty/",
  "bot-trap","trap-benchmark","oss-bot-trap","rustchain-bounties","rustchain","elyan-labs",
  "elyanlabs","dsh-bounty","furongjun","misakanet","ikalus1988","frantic-board","auscaster",
  "bounty-escrow","opensacred-game","opensacred","mergemint-mint","Jagadeeshftw","freedom-winds",
  "ledgercorp","janzeerorg","jwst-gc","taichung-police-intel","UdioWrapper","privacy-the-game",
  "lizTheDeveloper","SecureBananaLabs","BountyScout","bounty-bot",
];

function extractReward(text) {
  const m = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:USD|usd)?/);
  if (m) return parseFloat(m[1].replace(/,/g, ""));
  const m2 = text.match(/([\d,]+(?:\.\d+)?)\s*USD\b/i);
  if (m2) return parseFloat(m2[1].replace(/,/g, ""));
  return null;
}

// High-value targeted queries
const queries = [
  "%22%24+50%22+is:open+is:issue+stars:>20",
  "%22%24+100%22+is:open+is:issue+stars:>20",
  "%22%24+200%22+is:open+is:issue+stars:>20",
  "%22%24+500%22+is:open+is:issue+stars:>10",
  "%22%5B%2450%5D%22+is:open+is:issue+stars:>10",
  "%22%5B%24100%5D%22+is:open+is:issue+stars:>10",
  "%22%5B%24200%5D%22+is:open+is:issue+stars:>10",
  "reward%3A+%2250+USD%22+is:open+is:issue",
  "reward%3A+%22100+USD%22+is:open+is:issue",
  "reward%3A+%22200+USD%22+is:open+is:issue",
];

const seen = new Set();
const results = [];

for (const q of queries) {
  try {
    const url = `https://api.github.com/search/issues?q=${q}&sort=updated&order=desc&per_page=30`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) { console.log(`Query failed: ${q} → ${res.status}`); continue; }
    const data = await res.json();

    for (const item of data.items ?? []) {
      const extId = `github:${item.node_id}`;
      if (seen.has(extId)) continue;
      seen.add(extId);

      const repoLow = (item.repository_url ?? "").toLowerCase();
      const isBlocked = REPO_BLOCKLIST.some(p => repoLow.includes(p.toLowerCase()));
      if (isBlocked) continue;

      const prs = item.pull_requests?.length ?? 0;
      const reward = extractReward(item.title + " " + (item.body ?? ""));
      if (!reward || reward < 20) continue;

      const labels = (item.labels ?? []).map(l => l.name);
      const tagStr = labels.join(",");
      if (["delivered","claimed","paid","completed","accepted"].some(t => tagStr.includes(t))) continue;

      results.push({
        title: item.title,
        url: item.html_url,
        reward,
        prs: item.pull_requests?.length ?? "?",
        labels: tagStr.slice(0, 60),
        comments: item.comments,
        updated: item.updated_at?.slice(0, 10),
      });
    }
    await new Promise(r => setTimeout(r, 300));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

results.sort((a, b) => b.reward - a.reward);
console.log(`Found ${results.length} potential bounties with explicit dollar amounts:\n`);
results.slice(0, 20).forEach(r => {
  console.log(`  $${r.reward} prs=${r.prs} comments=${r.comments} updated=${r.updated}`);
  console.log(`  ${r.title?.slice(0, 70)}`);
  console.log(`  ${r.url}`);
  if (r.labels) console.log(`  labels: ${r.labels}`);
  console.log();
});

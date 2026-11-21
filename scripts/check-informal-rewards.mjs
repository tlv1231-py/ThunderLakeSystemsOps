/**
 * Search for informal bounty promises in GitHub issues:
 * "willing to pay", "will pay", "I'll pay", "offering $X", "prize: $X"
 * These are maintainer pledges not tied to a platform.
 */
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

const BLOCKLIST = [
  "bounty-plaza","bounty-board","bounty-list","bug-bounty","bot-trap","trap-benchmark",
  "oss-bot-trap","crypto-bounty","web3-bounty","defi-bounty","rustchain","elyan-labs",
  "elyanlabs","dsh-bounty","SecureBananaLabs","BountyScout","bounty-bot","mergemint",
  "opensacred","ledgercorp","janzeerorg","frantic-board","freedom-winds",
];

function extractReward(text) {
  const m = text.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}

// Queries targeting informal pay pledges
const queries = [
  `"willing to pay" "$" is:open is:issue stars:>20`,
  `"will pay" "$" bounty is:open is:issue stars:>20`,
  `"i'll pay" "$" is:open is:issue stars:>20`,
  `"prize:" "$" is:open is:issue stars:>20`,
  `"bounty:" "$" is:open is:issue stars:>50`,
  `"offering" "$" bounty is:open is:issue stars:>30`,
  `"github sponsors" bounty "$" is:open is:issue stars:>20`,
  `"pay via" "$" bounty is:open is:issue stars:>20`,
];

const seen = new Set();
const results = [];

for (const q of queries) {
  try {
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=25`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) { console.log(`Query failed: ${q.slice(0, 40)} → ${res.status}`); continue; }
    const data = await res.json();

    for (const item of data.items ?? []) {
      if (seen.has(item.node_id)) continue;
      seen.add(item.node_id);

      const rl = (item.repository_url ?? "").toLowerCase();
      if (BLOCKLIST.some(b => rl.includes(b.toLowerCase()))) continue;

      const reward = extractReward(item.title + " " + (item.body ?? "").slice(0, 1000));
      if (!reward || reward < 20) continue;

      const labels = (item.labels ?? []).map(l => l.name);
      if (["delivered","claimed","paid","completed","accepted"].some(t => labels.join(",").includes(t))) continue;

      results.push({
        reward,
        title: item.title,
        url: item.html_url,
        comments: item.comments,
        labels: labels.join(",").slice(0, 50),
        updated: item.updated_at?.slice(0, 10),
        repo: (item.repository_url ?? "").replace("https://api.github.com/repos/", ""),
      });
    }
    await new Promise(r => setTimeout(r, 400));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

results.sort((a, b) => b.reward - a.reward);
console.log(`Found ${results.length} informal pay pledges:\n`);
results.slice(0, 15).forEach(r => {
  console.log(`  $${r.reward} c=${r.comments} updated=${r.updated} labels=${r.labels || "none"}`);
  console.log(`  ${r.title.slice(0, 70)}`);
  console.log(`  ${r.url}`);
  console.log();
});

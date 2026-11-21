/**
 * Search for FRESH (< 7 days) bounties with explicit dollar amounts.
 * These have least competition — highest win probability.
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
  "oss-bot-trap","crypto-bounty","web3-bounty","rustchain","elyan-labs","elyanlabs",
  "dsh-bounty","SecureBananaLabs","BountyScout","bounty-bot","mergemint","opensacred",
  "ledgercorp","janzeerorg","frantic-board","freedom-winds","UdioWrapper",
];

function extractReward(text) {
  const m = text.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (m) return parseFloat(m[1].replace(/,/g, ""));
  const e = text.match(/€\s*([\d,]+(?:\.\d+)?)/);
  if (e) return Math.round(parseFloat(e[1].replace(/,/g, "")) * 1.1);
  const g = text.match(/£\s*([\d,]+(?:\.\d+)?)/);
  if (g) return Math.round(parseFloat(g[1].replace(/,/g, "")) * 1.27);
  return null;
}

const d7 = new Date(); d7.setDate(d7.getDate() - 7);
const fresh7 = d7.toISOString().slice(0, 10);
const d3 = new Date(); d3.setDate(d3.getDate() - 3);
const fresh3 = d3.toISOString().slice(0, 10);

const queries = [
  `label:bounty+is:open+is:issue+created:>${fresh3}&sort=created&order=desc`,
  `label:opire+is:open+is:issue+created:>${fresh7}&sort=created&order=desc`,
  `opire+in:body+is:open+is:issue+created:>${fresh7}&sort=created&order=desc`,
  `algora+in:body+is:open+is:issue+created:>${fresh7}&sort=created&order=desc`,
  `label:funded+is:open+is:issue+created:>${fresh7}&sort=created&order=desc`,
  `"bounty"+in:title+is:open+is:issue+created:>${fresh3}+stars:>5&sort=created&order=desc`,
  `EUR+bounty+in:body+is:open+is:issue+created:>${fresh7}&sort=created&order=desc`,
  `GBP+bounty+in:body+is:open+is:issue+created:>${fresh7}&sort=created&order=desc`,
];

const seen = new Set();
const results = [];

for (const q of queries) {
  try {
    const url = `https://api.github.com/search/issues?q=${q}&per_page=20`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) { console.log(`  SKIP ${q.slice(0, 50)} → ${res.status}`); continue; }
    const data = await res.json();

    for (const item of data.items ?? []) {
      if (seen.has(item.node_id)) continue;
      seen.add(item.node_id);

      const rl = (item.repository_url ?? "").toLowerCase();
      if (BLOCKLIST.some(b => rl.includes(b.toLowerCase()))) continue;

      const created = item.created_at?.slice(0, 10);
      const reward = extractReward(item.title + " " + (item.body ?? "").slice(0, 500));
      const labels = (item.labels ?? []).map(l => l.name);
      if (["delivered","claimed","paid","completed","accepted"].some(t => labels.join(",").includes(t))) continue;

      results.push({ reward, title: item.title, url: item.html_url, comments: item.comments, labels: labels.join(",").slice(0, 40), created });
    }
    await new Promise(r => setTimeout(r, 300));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

results.sort((a, b) => (b.reward ?? 0) - (a.reward ?? 0));
const withReward = results.filter(r => r.reward && r.reward >= 15);
console.log(`\nFresh bounties (last 3-7 days) with rewards >= $15: ${withReward.length}\n`);
withReward.slice(0, 20).forEach(r => {
  console.log(`  $${r.reward} created=${r.created} c=${r.comments} [${r.labels.slice(0, 30)}]`);
  console.log(`  ${r.title.slice(0, 70)}`);
  console.log(`  ${r.url}`);
  console.log();
});

if (withReward.length === 0) {
  console.log("No fresh bounties with rewards found.");
  console.log(`\nFresh items without rewards (sample):`);
  results.slice(0, 5).forEach(r => {
    console.log(`  $${r.reward ?? "?"} created=${r.created} ${r.title.slice(0, 60)}`);
  });
}

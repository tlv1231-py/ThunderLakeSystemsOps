/**
 * Check Opire API live for all current open issues with rewards.
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

// Opire public API - list open issues with rewards
const BASE = "https://app.opire.dev";
const endpoints = [
  "/api/rewards?status=open&limit=50",
  "/api/rewards?status=created&limit=50",
  "/api/issues?status=open&limit=50&has_reward=true",
];

for (const ep of endpoints) {
  try {
    const url = BASE + ep;
    console.log(`\nGET ${ep}`);
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "TLS-Scout/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    console.log(`  Status: ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`  Keys: ${Object.keys(data).join(", ")}`);
      const items = data.data ?? data.rewards ?? data.issues ?? data.items ?? [];
      console.log(`  Count: ${items.length}`);
      items.slice(0, 10).forEach(item => {
        const reward = item.amount ?? item.reward_amount ?? item.total_reward ?? "?";
        const title = item.title ?? item.issue_title ?? "?";
        const url2 = item.issue_url ?? item.url ?? item.html_url ?? "";
        const status = item.status ?? "?";
        console.log(`  [$${reward}] [${status}] ${String(title).slice(0, 60)}`);
        if (url2) console.log(`    ${url2}`);
      });
    } else {
      const text = await res.text();
      console.log(`  Body: ${text.slice(0, 200)}`);
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
}

// Also try GitHub search for opire label
const GITHUB_TOKEN = env.GITHUB_TOKEN;
const ghHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "TLS-Scout/1.0",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
};

console.log("\n--- GitHub search: label:opire is:open ---");
const ghUrl = "https://api.github.com/search/issues?q=label:opire+is:open+is:issue&sort=created&order=desc&per_page=20";
const ghRes = await fetch(ghUrl, { headers: ghHeaders, signal: AbortSignal.timeout(10000) });
if (ghRes.ok) {
  const data = await ghRes.json();
  console.log(`Found ${data.total_count} total, showing ${data.items?.length ?? 0}`);
  for (const item of data.items ?? []) {
    const labels = (item.labels ?? []).map(l => l.name).join(",");
    console.log(`  c=${item.comments} [${labels.slice(0,30)}] ${item.title?.slice(0,60)}`);
    console.log(`    ${item.html_url}`);
  }
}

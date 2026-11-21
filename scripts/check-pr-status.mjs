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
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "TLS-Scout/1.0",
  ...(GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {}),
};

// Tyler's submitted PRs
const { data: submitted } = await db.from("income_work_queue")
  .select("id, status, expected_usd, pr_url, title, progress_note")
  .eq("user_id", TYLER)
  .in("status", ["submitted", "review"])
  .not("pr_url", "is", null);

for (const item of submitted ?? []) {
  const m = item.pr_url.match(/github\.com\/([^/]+)\/([^/]+?)\/pull(?:s)?\/(\d+)/);
  if (!m) continue;
  const [, owner, repo, number] = m;

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, { headers });
    if (!res.ok) {
      console.log(`  ${item.pr_url} → HTTP ${res.status}`);
      continue;
    }
    const pr = await res.json();
    const state = pr.merged ? "MERGED ✅" : pr.state === "closed" ? "CLOSED ❌" : "OPEN 🔄";
    console.log(`  ${state} $${item.expected_usd ?? "?"} ${owner}/${repo}#${number}`);
    if (pr.merged) console.log(`    Merged at: ${pr.merged_at}`);
    if (pr.state === "closed" && !pr.merged) console.log(`    Closed without merge`);
    if (pr.state === "open") {
      console.log(`    Title: ${pr.title?.slice(0, 60)}`);
      console.log(`    Comments: ${pr.comments}, Reviews: ${pr.review_comments}`);
    }
  } catch (e) {
    console.log(`  ${item.pr_url} → error: ${e.message}`);
  }
}

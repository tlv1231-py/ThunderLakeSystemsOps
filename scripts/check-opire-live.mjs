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

// First dismiss the rencfs WQ item
const { data: rencfsWQ } = await db.from("income_work_queue")
  .select("id, status")
  .eq("opportunity_id", (await db.from("income_opportunities")
    .select("id").eq("user_id", TYLER).eq("source", "opire").maybeSingle()).data?.id)
  .maybeSingle();
console.log("rencfs WQ current status:", rencfsWQ?.status);

// Also dismiss the opportunity itself
const { data: rencfsOpp } = await db.from("income_opportunities")
  .select("id, status, title")
  .eq("user_id", TYLER)
  .eq("source", "opire")
  .maybeSingle();
console.log("rencfs opp status:", rencfsOpp?.status, rencfsOpp?.title?.slice(0, 40));

// Mark it dismissed - too many competing PRs
if (rencfsWQ && rencfsWQ.status !== "failed") {
  await db.from("income_work_queue")
    .update({ status: "failed", progress_note: "Saturated: 20+ PRs already targeting this issue" })
    .eq("id", rencfsWQ.id);
  console.log("✅ rencfs WQ marked failed");
}
if (rencfsOpp && rencfsOpp.status !== "dismissed") {
  await db.from("income_opportunities")
    .update({ status: "dismissed" })
    .eq("id", rencfsOpp.id);
  console.log("✅ rencfs opp dismissed");
}

// Now fetch live Opire API to see all current bounties
console.log("\n--- Live Opire API ---");
const res = await fetch("https://api.opire.dev/rewards", {
  headers: { "User-Agent": "TLS-Scout/1.0", Accept: "application/json" }
});
if (!res.ok) { console.log("Opire API error:", res.status); process.exit(0); }
const items = await res.json();
console.log(`Total Opire rewards: ${Array.isArray(items) ? items.length : "not array"}`);

const viable = (Array.isArray(items) ? items : [])
  .filter(r => r.pendingPrice?.value > 0 && r.url)
  .sort((a, b) => (b.pendingPrice?.value ?? 0) - (a.pendingPrice?.value ?? 0))
  .slice(0, 20);

viable.forEach(r => {
  const usd = (r.pendingPrice.value / 100).toFixed(0);
  const trying = (r.tryingUsers ?? []).length;
  const title = (r.title ?? r.url ?? "?").slice(0, 60);
  console.log(`  $${usd} trying=${trying} ${title}`);
  console.log(`    ${r.url}`);
});

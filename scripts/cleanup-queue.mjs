import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(ROOT, ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Find and dismiss Janzeer (crypto) opportunity
const { data: janzeer } = await db.from("income_opportunities")
  .select("id, title, status")
  .ilike("title", "%JNZ%");
console.log("Janzeer items:", JSON.stringify(janzeer));

for (const opp of janzeer ?? []) {
  // Dismiss the opportunity
  await db.from("income_opportunities").update({ status: "dismissed" }).eq("id", opp.id);
  // Fail any WQ entries for it
  const { data: wqItems } = await db.from("income_work_queue").select("id").eq("opportunity_id", opp.id);
  for (const wq of wqItems ?? []) {
    await db.from("income_work_queue").update({ status: "failed", progress_note: "Crypto blockchain SDK (JNZ token) — anti-fit" }).eq("id", wq.id);
  }
  console.log(`Dismissed ${opp.id}: ${opp.title}`);
}

// 2. Check all pending WQ entries and their opportunity status
const { data: pendingWQ } = await db.from("income_work_queue")
  .select("id, opportunity_id, status, created_at")
  .eq("status", "pending")
  .order("created_at", { ascending: false });
console.log("\nPending WQ entries:", pendingWQ?.length);

for (const wq of pendingWQ ?? []) {
  const { data: opp } = await db.from("income_opportunities").select("id, title, status").eq("id", wq.opportunity_id).single();
  console.log(`  WQ ${wq.id}: opp status=${opp?.status} title=${opp?.title?.slice(0,50)}`);
  // If opportunity is dismissed, fail the WQ entry
  if (opp?.status === "dismissed") {
    await db.from("income_work_queue").update({ status: "failed", progress_note: "Opportunity dismissed" }).eq("id", wq.id);
    console.log(`    -> Failed WQ ${wq.id} (opp dismissed)`);
  }
}

// 3. Show current queued items (what the pipeline will work on)
const { data: queued } = await db.from("income_opportunities")
  .select("id, title, score, reward_usd, source")
  .eq("status", "queued")
  .order("score", { ascending: false });
console.log("\nQueued opportunities:", JSON.stringify(queued, null, 2));

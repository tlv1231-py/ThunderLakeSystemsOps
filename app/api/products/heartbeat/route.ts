import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

const VALID_STATUSES = new Set(["healthy", "degraded", "down"]);

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rawToken  = auth.slice(7).trim();
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { product_id, display_name, status = "healthy", metrics = {} } = body ?? {};

  if (!product_id || typeof product_id !== "string") {
    return NextResponse.json({ error: "product_id required" }, { status: 400 });
  }
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "status must be healthy | degraded | down" }, { status: 400 });
  }

  const db = createAdminClient() as any;

  // Verify token belongs to this product_id
  const { data: product } = await db
    .from("products")
    .select("product_id")
    .eq("token_hash", tokenHash)
    .eq("product_id", product_id)
    .maybeSingle();

  if (!product) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await db
    .from("products")
    .update({
      display_name: display_name ?? product_id,
      status,
      metrics,
      last_seen: new Date().toISOString(),
    })
    .eq("product_id", product_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

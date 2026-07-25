import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const auth   = req.headers.get("authorization") ?? "";
  const secret = process.env.PRODUCT_HEARTBEAT_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { product_id, display_name, status = "healthy", metrics = {} } = body ?? {};

  if (!product_id || typeof product_id !== "string") {
    return NextResponse.json({ error: "product_id required" }, { status: 400 });
  }
  if (!["healthy", "degraded", "down"].includes(status)) {
    return NextResponse.json({ error: "status must be healthy | degraded | down" }, { status: 400 });
  }

  const db = createAdminClient() as any;
  const { error } = await db.from("product_status").upsert(
    {
      product_id,
      display_name: display_name ?? product_id,
      status,
      metrics,
      reported_at: new Date().toISOString(),
    },
    { onConflict: "product_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

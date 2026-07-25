import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  // Must be authenticated as the admin user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { product_id, display_name, expected_interval_seconds = 300 } = body ?? {};
  if (!product_id || typeof product_id !== "string") {
    return NextResponse.json({ error: "product_id required" }, { status: 400 });
  }

  const rawToken  = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const db = createAdminClient() as any;
  const { error } = await db.from("products").insert({
    product_id,
    display_name: display_name ?? product_id,
    token_hash: tokenHash,
    expected_interval_seconds,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Raw token returned once — never stored in plaintext
  return NextResponse.json({ product_id, token: rawToken });
}

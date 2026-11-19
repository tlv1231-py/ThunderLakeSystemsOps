import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET  /api/income/opportunities          list with filters
// POST /api/income/opportunities          insert manual opportunity
// PATCH /api/income/opportunities         update status / fields

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status   = url.searchParams.get("status");
  const source   = url.searchParams.get("source");
  const minScore = url.searchParams.get("minScore");
  const limit    = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50", 10));

  const db = supabase as any;
  let q = db
    .from("income_opportunities")
    .select("*")
    .eq("user_id", user.id)
    .order("score", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("status", status);
  if (source) q = q.eq("source", source);
  if (minScore) q = q.gte("score", parseFloat(minScore));

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ opportunities: data });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const db = supabase as any;
  const { data, error } = await db
    .from("income_opportunities")
    .insert({ ...body, user_id: user.id, status: "discovered" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ opportunity: data });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = supabase as any;
  const { data, error } = await db
    .from("income_opportunities")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log status changes
  if (updates.status) {
    await db.from("income_activity_log").insert({
      engine: "bounty",
      action: `opportunity_${updates.status}`,
      detail: data?.title,
      status: "ok",
      user_id: user.id,
    });
  }

  return NextResponse.json({ opportunity: data });
}

import { NextResponse } from "next/server";

// Phase 3 will implement reminder logic.
// This stub satisfies the Vercel cron schedule defined in vercel.json.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, message: "Reminder cron — implemented in Phase 3" });
}

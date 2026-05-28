import { NextResponse } from "next/server";

// Phase 3 will implement Resend webhook event handling (delivered, bounced, opened).
export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // TODO Phase 3: verify Resend signature, update email_logs
  return NextResponse.json({ received: true });
}

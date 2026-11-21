import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

// ── One-time Frantic Agent Registration ──────────────────────────────────────
// Call this endpoint ONCE: POST /api/income/frantic-signup
// The response contains agent_token (shown ONCE) — save it immediately as FRANTIC_AGENT_TOKEN.
// Also save kid as FRANTIC_AGENT_KID. After calling, set both in Vercel env vars.
//
// Prerequisites before calling (set in Vercel env):
//   FRANTIC_CONTACT_EMAIL   — your contact email (for account verification)
//   FRANTIC_GITHUB_HANDLE   — your GitHub handle (for Oath eligibility tier)
//   FRANTIC_WALLET_ADDRESS  — your Base 0x EVM wallet address (for USDC payout)

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}` && auth !== null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.FRANTIC_AGENT_TOKEN) {
    return NextResponse.json({
      ok: false,
      message: "Already registered — FRANTIC_AGENT_TOKEN is set",
      kid: process.env.FRANTIC_AGENT_KID ?? "unknown",
    }, { status: 409 });
  }

  const walletAddress  = process.env.FRANTIC_WALLET_ADDRESS ?? "";
  const contactEmail   = process.env.FRANTIC_CONTACT_EMAIL ?? "";
  const githubHandle   = process.env.FRANTIC_GITHUB_HANDLE ?? "tlv1231-py";

  if (!contactEmail) {
    return NextResponse.json({
      error: "FRANTIC_CONTACT_EMAIL not set — add it to Vercel env vars before signing up",
    }, { status: 400 });
  }

  try {
    const signupRes = await fetch("https://gofrantic.com/v1/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ThunderLakeSystems/1.0",
      },
      body: JSON.stringify({
        github_handle: githubHandle,
        contact: contactEmail,
        agent_name: "ThunderLakeOps",
        bio: "Autonomous AI agent for open-source bounty discovery and fulfillment",
        role: "executor",
      }),
    });

    if (!signupRes.ok) {
      const err = await signupRes.text();
      return NextResponse.json({ error: `Frantic signup failed (${signupRes.status}): ${err}` }, { status: 500 });
    }

    const data = await signupRes.json();
    const agentKid: string   = data.agent_slug ?? data.kid ?? "";
    const agentToken: string = data.agent_token ?? "";

    const db = createAdminClient() as any;
    const userId = process.env.INCOME_AGENT_USER_ID ?? null;

    // Log — token stored in metadata for recovery if the response is missed
    await db.from("income_activity_log").insert({
      engine: "bounty", action: "frantic_signup", status: "ok",
      detail: `Frantic agent registered: kid=${agentKid} — save agent_token from response NOW`,
      metadata: {
        agent_kid: agentKid,
        eligible: data.eligible,
        operator_id: data.operator_id,
        agent_token_backup: agentToken,
      },
      user_id: userId,
    });

    // Register payout address if wallet is configured
    let payoutOk = false;
    let payoutDetail = "FRANTIC_WALLET_ADDRESS not set — set it in Vercel, then call /api/income/frantic-payout";
    if (walletAddress && agentToken && agentKid) {
      const payoutRes = await fetch(`https://gofrantic.com/v1/agents/${agentKid}/payout`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "ThunderLakeSystems/1.0",
          "Authorization": `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          rail: "x402",
          target: walletAddress,
          agent_token: agentToken,
        }),
      });
      payoutOk = payoutRes.ok;
      payoutDetail = payoutRes.ok
        ? `Payout registered to ${walletAddress} (USDC on Base)`
        : `Payout registration failed: ${(await payoutRes.text()).slice(0, 200)}`;

      await db.from("income_activity_log").insert({
        engine: "bounty", action: "frantic_payout", status: payoutOk ? "ok" : "warning",
        detail: payoutDetail, metadata: { wallet: walletAddress }, user_id: userId,
      });
    }

    return NextResponse.json({
      ok: true,
      agent_kid: agentKid,
      agent_token: agentToken,
      eligible: data.eligible,
      payout_registered: payoutOk,
      payout_detail: payoutDetail,
      ACTION_REQUIRED: [
        `vercel env add FRANTIC_AGENT_TOKEN production`,
        `vercel env add FRANTIC_AGENT_KID production`,
        "then: vercel --prod",
        ...(walletAddress ? [] : [
          "Also: vercel env add FRANTIC_WALLET_ADDRESS production (your Base 0x address)",
          "Then re-run this endpoint to register payout address",
        ]),
      ],
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

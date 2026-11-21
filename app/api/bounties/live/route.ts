import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 10;

// ── x402 Paid Bounty Data Endpoint ───────────────────────────────────────────
// Other AI agents pay $0.01 USDC per request to get our scored live bounty data.
// Payment standard: x402 protocol (HTTP 402 + EIP-3009 or ERC-20 transfer proof).
//
// When X402_ENABLED=true in Vercel env:
//   - Returns 402 with payment requirements if no valid payment header
//   - Verifies payment against facilitator (FACILITATOR_URL env)
//   - Charges RESOURCE_EVM_ADDRESS (Base mainnet USDC)
//
// When X402_ENABLED is not set:
//   - Returns data freely (useful for testing / initial listing on Agentic.market)
//
// Env vars needed for live payment mode:
//   X402_ENABLED=true
//   RESOURCE_EVM_ADDRESS  — your Base 0x wallet address
//   FACILITATOR_URL       — x402 payment facilitator (e.g. https://x402.org/facilitator)
//
// List this endpoint on https://www.agentic.market/ once live.

const PRICE_USDC  = "0.01";
const NETWORK     = "eip155:8453"; // Base mainnet

export async function GET(req: Request) {
  const x402Enabled = process.env.X402_ENABLED === "true";
  const payToAddress = process.env.RESOURCE_EVM_ADDRESS ?? "";
  const facilitatorUrl = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";

  if (x402Enabled && payToAddress) {
    // Check for x402 payment header
    const paymentHeader = req.headers.get("x-payment");

    if (!paymentHeader) {
      // Return 402 with payment requirements (x402 protocol)
      return NextResponse.json(
        {
          error: "Payment required",
          x402Version: 1,
          accepts: [
            {
              scheme: "exact",
              network: NETWORK,
              maxAmountRequired: PRICE_USDC,
              resource: req.url,
              description: "Live scored bounty data from ThunderLake Systems",
              mimeType: "application/json",
              payTo: payToAddress,
              maxTimeoutSeconds: 300,
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
              extra: { name: "USD Coin", version: "2" },
            },
          ],
          facilitators: [facilitatorUrl],
        },
        {
          status: 402,
          headers: {
            "x-payment-required": "true",
            "x-payment-price": PRICE_USDC,
            "x-payment-network": NETWORK,
            "access-control-allow-origin": "*",
            "access-control-expose-headers": "x-payment-required, x-payment-price, x-payment-network",
          },
        }
      );
    }

    // Verify payment with facilitator
    try {
      const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x402Version: 1,
          payment: paymentHeader,
          resource: req.url,
          network: NETWORK,
          payTo: payToAddress,
          amount: PRICE_USDC,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({ error: "verification failed" }));
        return NextResponse.json(
          { error: "Payment verification failed", detail: err },
          { status: 402 }
        );
      }

      // Payment verified — settle it (fire-and-forget)
      fetch(`${facilitatorUrl}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment: paymentHeader }),
      }).catch(() => {});
    } catch (e) {
      return NextResponse.json({ error: "Facilitator unreachable", detail: String(e) }, { status: 503 });
    }
  }

  // Return live bounty data
  const db = createAdminClient() as any;
  const userId = process.env.INCOME_AGENT_USER_ID ?? null;

  const { data: opportunities } = await db
    .from("income_opportunities")
    .select("id, source, title, description, url, reward_usd, reward_raw, currency, language, difficulty, estimated_hours, score, hourly_rate_est, tags, deadline, metadata, open_prs, discovered_at")
    .eq("user_id", userId)
    .in("status", ["discovered", "queued"])
    .gte("score", 40)
    .order("score", { ascending: false })
    .limit(50);

  return NextResponse.json(
    {
      ok: true,
      generated_at: new Date().toISOString(),
      count: (opportunities ?? []).length,
      opportunities: opportunities ?? [],
      meta: {
        description: "Live scored bounty opportunities from ThunderLake Systems discovery engine",
        sources: ["opire", "github", "superteam", "frantic"],
        scoring: "0–100 composite score: reward, estimated hours, competition, tech fit",
        payment: x402Enabled ? { price: `$${PRICE_USDC} USDC`, network: NETWORK } : "free",
      },
    },
    {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "x-payment, authorization",
    },
  });
}

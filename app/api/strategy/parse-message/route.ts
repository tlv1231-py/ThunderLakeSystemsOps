import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, columns } = body ?? {};
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const columnList: { id: string; name: string }[] = Array.isArray(columns) ? columns : [];
  const columnDesc = columnList.length > 0
    ? columnList.map((c) => `- "${c.name}" (id: ${c.id})`).join("\n")
    : "(no columns defined — use id: general)";

  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    thinking: { type: "disabled" },
    output_config: { effort: "high" },
    system: `You extract actionable strategy cards from partner/client messages for a consulting firm called Thunder Lake Systems.

Return ONLY valid JSON — no markdown fences, no explanation — in this exact shape:
{"cards":[{"content":"Short card title (max 2 sentences)","notes":"Context or why this matters","suggested_column_id":"column id from the list below"}]}

Available board columns:
${columnDesc}

Rules:
- Extract concrete, specific action items and research tasks only
- Omit pleasantries, vague statements, and general context
- Each card = one clear thing to do or investigate
- Map each card to the most relevant column
- If unsure, use the first column's id`,
    messages: [{ role: "user", content: message }],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) return NextResponse.json({ error: "No response from model" }, { status: 500 });

  try {
    const json = textBlock.text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error("No JSON in response");
    const parsed = JSON.parse(json);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "Could not parse model response", raw: textBlock.text }, { status: 500 });
  }
}

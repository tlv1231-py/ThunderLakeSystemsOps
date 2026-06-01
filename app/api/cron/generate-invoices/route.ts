import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVITY_EVENTS } from "@/lib/constants";

// Runs nightly. On the last day of the month it auto-creates one draft invoice
// per client (per user) covering all unbilled billable time entries for that month.
// Idempotent: skips any client that already has a draft for the current month.

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Is today the last day of the month? ────────────────────────────────────
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  if (today.getDate() !== lastDay.getDate()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Day ${today.getDate()} of ${lastDay.getDate()} — not month-end`,
    });
  }

  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd   = today.toISOString().split("T")[0]; // today = last day

  const admin = createAdminClient();
  const results: { user_id: string; created: string[]; skipped: string[] }[] = [];

  // ── Process every user ─────────────────────────────────────────────────────
  const { data: users } = await admin
    .from("users")
    .select("id, invoice_number_prefix, invoice_number_sequence, default_tax_rate, default_invoice_terms_days");

  for (const user of users ?? []) {
    const userResult = { user_id: user.id, created: [] as string[], skipped: [] as string[] };

    // ── All unbilled billable time this month for this user ─────────────────
    const { data: entries } = await admin
      .from("time_entries")
      .select("id, client_id, hours_decimal, projects(hourly_rate_override), clients(company_name, default_hourly_rate)")
      .eq("user_id", user.id)
      .eq("status", "uninvoiced")
      .eq("billable", true)
      .gte("date_worked", monthStart)
      .lte("date_worked", monthEnd);

    if (!entries?.length) {
      results.push(userResult);
      continue;
    }

    // ── Group by client ──────────────────────────────────────────────────────
    const byClient = new Map<string, typeof entries>();
    for (const e of entries) {
      const arr = byClient.get(e.client_id) ?? [];
      arr.push(e);
      byClient.set(e.client_id, arr);
    }

    let sequence = user.invoice_number_sequence ?? 1;
    const prefix = user.invoice_number_prefix ?? "INV";
    const year   = today.getFullYear();
    const termsDays = user.default_invoice_terms_days ?? 30;
    const taxRate   = user.default_tax_rate ?? 0;

    for (const [clientId, clientEntries] of byClient) {
      // ── Idempotency: skip if draft already exists for this client/month ────
      const { data: existing } = await admin
        .from("invoices")
        .select("id")
        .eq("user_id", user.id)
        .eq("client_id", clientId)
        .eq("status", "draft")
        .gte("issue_date", monthStart)
        .maybeSingle();

      const clientName = (clientEntries[0].clients as { company_name: string } | null)?.company_name ?? clientId;

      if (existing) {
        userResult.skipped.push(clientName);
        continue;
      }

      // ── Calculate subtotal ─────────────────────────────────────────────────
      const subtotal = clientEntries.reduce((sum, e) => {
        const rate =
          (e.projects as { hourly_rate_override: number | null } | null)?.hourly_rate_override ??
          (e.clients  as { default_hourly_rate: number | null }  | null)?.default_hourly_rate ??
          0;
        return sum + e.hours_decimal * rate;
      }, 0);

      const taxAmount   = Math.round(subtotal * taxRate * 100) / 100;
      const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

      // ── Due date = issue_date + terms ──────────────────────────────────────
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + termsDays);
      const dueDateStr = dueDate.toISOString().split("T")[0];

      const invoiceNumber = `${prefix}-${year}-${String(sequence).padStart(3, "0")}`;

      // ── Insert invoice ─────────────────────────────────────────────────────
      const { data: invoice, error: invErr } = await admin
        .from("invoices")
        .insert({
          user_id:         user.id,
          client_id:       clientId,
          invoice_number:  invoiceNumber,
          status:          "draft",
          issue_date:      monthEnd,
          due_date:        dueDateStr,
          subtotal,
          tax_amount:      taxAmount,
          discount_amount: 0,
          total_amount:    totalAmount,
          amount_paid:     0,
          balance_due:     totalAmount,
          currency:        "USD",
          notes:           null,
        })
        .select("id")
        .single();

      if (invErr || !invoice) {
        console.error("Failed to create invoice for", clientName, invErr?.message);
        continue;
      }

      // ── Mark time entries as invoiced ──────────────────────────────────────
      await admin
        .from("time_entries")
        .update({ invoice_id: invoice.id, status: "invoiced" })
        .in("id", clientEntries.map((e) => e.id));

      // ── Increment sequence ─────────────────────────────────────────────────
      sequence++;
      await admin
        .from("users")
        .update({ invoice_number_sequence: sequence })
        .eq("id", user.id);

      // ── Log activity ───────────────────────────────────────────────────────
      await admin.from("activity_events").insert({
        user_id:    user.id,
        client_id:  clientId,
        invoice_id: invoice.id,
        event_type: ACTIVITY_EVENTS.INVOICE_CREATED,
        event_data: { invoice_number: invoiceNumber, total_amount: totalAmount, auto_generated: true },
        visibility: "internal",
      });

      userResult.created.push(`${invoiceNumber} (${clientName}, $${totalAmount})`);
    }

    results.push(userResult);
  }

  return NextResponse.json({ ok: true, month: monthEnd, results });
}

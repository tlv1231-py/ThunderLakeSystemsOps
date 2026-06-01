"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/services/activity-service";
import { ACTIVITY_EVENTS } from "@/lib/constants";

// ─── Create Invoice ────────────────────────────────────────────────────────────

export async function createInvoice(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const clientId   = formData.get("client_id")  as string;
  const entryIds   = formData.getAll("entry_ids") as string[];
  const expenseIds = formData.getAll("expense_ids") as string[];
  const taxRate    = parseFloat(formData.get("tax_rate") as string) || 0;
  const notes      = (formData.get("notes") as string) || null;
  const issueDate  = formData.get("issue_date") as string;
  const dueDate    = formData.get("due_date")   as string;

  if (!clientId || entryIds.length === 0) {
    throw new Error("Select at least one time entry");
  }

  // ── Fetch selected time entries with rates ────────────────────────────────
  const { data: entries, error: entriesErr } = await supabase
    .from("time_entries")
    .select("id, hours_decimal, projects(hourly_rate_override), clients(default_hourly_rate)")
    .eq("user_id", user.id)
    .eq("client_id", clientId)
    .eq("status", "uninvoiced")
    .in("id", entryIds);

  if (entriesErr || !entries) throw new Error("Failed to load time entries");

  // ── Fetch selected expense entries ────────────────────────────────────────
  let expenseSubtotal = 0;
  if (expenseIds.length > 0) {
    const { data: expenses } = await supabase
      .from("expense_entries")
      .select("id, amount")
      .eq("user_id", user.id)
      .eq("client_id", clientId)
      .eq("status", "uninvoiced")
      .in("id", expenseIds);

    expenseSubtotal = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  }

  // ── Calculate amounts ─────────────────────────────────────────────────────
  const timeSubtotal = entries.reduce((sum, e) => {
    const rate =
      (e.projects as { hourly_rate_override: number | null } | null)?.hourly_rate_override ??
      (e.clients  as { default_hourly_rate: number | null }  | null)?.default_hourly_rate ??
      0;
    return sum + e.hours_decimal * rate;
  }, 0);

  const subtotal    = timeSubtotal + expenseSubtotal;
  const taxAmount   = Math.round(subtotal * taxRate * 100) / 100;
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

  // ── Generate invoice number ───────────────────────────────────────────────
  const { data: settings } = await supabase
    .from("users")
    .select("invoice_number_prefix, invoice_number_sequence")
    .eq("id", user.id)
    .single();

  const prefix   = settings?.invoice_number_prefix ?? "INV";
  const sequence = settings?.invoice_number_sequence ?? 1;
  const year     = new Date(issueDate).getFullYear();
  const invoiceNumber = `${prefix}-${year}-${String(sequence).padStart(3, "0")}`;

  // ── Insert invoice ────────────────────────────────────────────────────────
  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .insert({
      user_id:          user.id,
      client_id:        clientId,
      invoice_number:   invoiceNumber,
      status:           "draft",
      issue_date:       issueDate,
      due_date:         dueDate,
      subtotal:         subtotal,
      tax_amount:       taxAmount,
      discount_amount:  0,
      total_amount:     totalAmount,
      amount_paid:      0,
      balance_due:      totalAmount,
      currency:         "USD",
      notes:            notes,
    })
    .select("id")
    .single();

  if (invoiceErr || !invoice) throw new Error(invoiceErr?.message ?? "Failed to create invoice");

  // ── Mark time entries as invoiced ─────────────────────────────────────────
  await supabase
    .from("time_entries")
    .update({ invoice_id: invoice.id, status: "invoiced" })
    .in("id", entryIds);

  // ── Mark expense entries as invoiced ─────────────────────────────────────
  if (expenseIds.length > 0) {
    await supabase
      .from("expense_entries")
      .update({ invoice_id: invoice.id, status: "invoiced" })
      .in("id", expenseIds);
  }

  // ── Increment invoice sequence ────────────────────────────────────────────
  await supabase
    .from("users")
    .update({ invoice_number_sequence: sequence + 1 })
    .eq("id", user.id);

  // ── Log activity ──────────────────────────────────────────────────────────
  await logActivity({
    user_id:    user.id,
    client_id:  clientId,
    invoice_id: invoice.id,
    event_type: ACTIVITY_EVENTS.INVOICE_CREATED,
    event_data: { invoice_number: invoiceNumber, total_amount: totalAmount },
    visibility: "internal",
  });

  revalidatePath("/invoices");
  revalidatePath("/dashboard");

  redirect(`/invoices/${invoice.id}`);
}

// ─── Mark Invoice Sent ─────────────────────────────────────────────────────────

export async function markInvoiceSent(invoiceId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, client_id, invoice_number, total_amount, status")
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .single();

  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "draft") throw new Error("Only draft invoices can be marked sent");

  await supabase
    .from("invoices")
    .update({ status: "sent" })
    .eq("id", invoiceId);

  await logActivity({
    user_id:    user.id,
    client_id:  invoice.client_id,
    invoice_id: invoiceId,
    event_type: ACTIVITY_EVENTS.INVOICE_SENT,
    event_data: { invoice_number: invoice.invoice_number, total_amount: invoice.total_amount },
    visibility: "client_visible",
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

// ─── Send All Draft Invoices ───────────────────────────────────────────────────

export async function sendAllDraftInvoices() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const { data: drafts } = await supabase
    .from("invoices")
    .select("id, client_id, invoice_number, total_amount")
    .eq("user_id", user.id)
    .eq("status", "draft");

  if (!drafts?.length) return { sent: 0 };

  for (const inv of drafts) {
    await supabase.from("invoices").update({ status: "sent" }).eq("id", inv.id);
    await logActivity({
      user_id:    user.id,
      client_id:  inv.client_id,
      invoice_id: inv.id,
      event_type: ACTIVITY_EVENTS.INVOICE_SENT,
      event_data: { invoice_number: inv.invoice_number, total_amount: inv.total_amount },
      visibility: "client_visible",
    });
  }

  revalidatePath("/invoices");
  revalidatePath("/dashboard");

  return { sent: drafts.length };
}

// ─── Void Invoice ──────────────────────────────────────────────────────────────

export async function voidInvoice(invoiceId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, client_id, invoice_number, status")
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .single();

  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "paid" || invoice.status === "void") {
    throw new Error("Cannot void a paid or already-voided invoice");
  }

  // Revert linked time entries back to uninvoiced
  await supabase
    .from("time_entries")
    .update({ invoice_id: null, status: "uninvoiced" })
    .eq("invoice_id", invoiceId);

  await supabase
    .from("expense_entries")
    .update({ invoice_id: null, status: "uninvoiced" })
    .eq("invoice_id", invoiceId);

  await supabase
    .from("invoices")
    .update({ status: "void", balance_due: 0 })
    .eq("id", invoiceId);

  await logActivity({
    user_id:    user.id,
    client_id:  invoice.client_id,
    invoice_id: invoiceId,
    event_type: ACTIVITY_EVENTS.INVOICE_VOID,
    event_data: { invoice_number: invoice.invoice_number },
    visibility: "internal",
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/services/activity-service";
import { ACTIVITY_EVENTS } from "@/lib/constants";

export async function recordPayment(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const invoiceId    = formData.get("invoice_id") as string;
  const amount       = parseFloat(formData.get("amount") as string);
  const paymentDate  = formData.get("payment_date") as string;
  const method       = formData.get("payment_method") as string;
  const reference    = formData.get("reference_number") as string || null;
  const notes        = formData.get("notes") as string || null;

  // Fetch the invoice to verify ownership and get current balances
  const { data: invoice, error: fetchErr } = await supabase
    .from("invoices")
    .select("id, client_id, total_amount, amount_paid, balance_due, invoice_number, status")
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !invoice) throw new Error("Invoice not found");
  if (invoice.status === "paid" || invoice.status === "void") {
    throw new Error("Cannot record payment on a paid or void invoice");
  }

  const newAmountPaid = invoice.amount_paid + amount;
  const newBalanceDue = Math.max(0, invoice.total_amount - newAmountPaid);
  const newStatus = newBalanceDue <= 0 ? "paid" : "partial";

  // Insert payment
  const { error: paymentErr } = await supabase.from("payments").insert({
    invoice_id:       invoiceId,
    client_id:        invoice.client_id,
    amount,
    payment_date:     paymentDate,
    payment_method:   method as "ach" | "wire" | "check" | "venmo" | "paypal" | "cash" | "other",
    reference_number: reference,
    notes,
  });

  if (paymentErr) throw new Error(paymentErr.message);

  // Update invoice — only mutable fields allowed past draft
  const { error: updateErr } = await supabase
    .from("invoices")
    .update({
      amount_paid: newAmountPaid,
      balance_due: newBalanceDue,
      status:      newStatus,
    })
    .eq("id", invoiceId);

  if (updateErr) throw new Error(updateErr.message);

  await logActivity({
    user_id:    user.id,
    client_id:  invoice.client_id,
    invoice_id: invoiceId,
    event_type: newStatus === "paid"
      ? ACTIVITY_EVENTS.INVOICE_PAID
      : ACTIVITY_EVENTS.PAYMENT_RECEIVED,
    event_data: { amount, method, invoice_number: invoice.invoice_number, balance_due: newBalanceDue },
    visibility: "client_visible",
  });

  revalidatePath("/payments");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

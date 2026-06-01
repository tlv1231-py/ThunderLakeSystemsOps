"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Upsert expense entry (create or update) ───────────────────────────────────

export async function upsertExpenseEntry(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const id          = (formData.get("id") as string) || null;
  const clientId    = formData.get("client_id")   as string;
  const projectId   = (formData.get("project_id") as string) || null;
  const date        = formData.get("date_incurred") as string;
  const description = (formData.get("description") as string)?.trim();
  const amount      = parseFloat(formData.get("amount") as string);
  const billable    = formData.get("billable") === "true";

  if (!clientId || !date || !description || isNaN(amount) || amount <= 0) {
    throw new Error("Client, date, description, and amount are required");
  }

  if (id) {
    // ── Update existing entry ────────────────────────────────────────────────
    const { data: existing } = await supabase
      .from("expense_entries")
      .select("status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!existing) throw new Error("Entry not found");
    if (existing.status !== "uninvoiced") throw new Error("Only uninvoiced entries can be edited");

    const { error } = await supabase
      .from("expense_entries")
      .update({ client_id: clientId, project_id: projectId, date_incurred: date, description, amount, billable })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw new Error(error.message);
  } else {
    // ── Insert new entry ──────────────────────────────────────────────────────
    const { error } = await supabase
      .from("expense_entries")
      .insert({ user_id: user.id, client_id: clientId, project_id: projectId, date_incurred: date, description, amount, billable, status: "uninvoiced" });

    if (error) throw new Error(error.message);
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
}

// ─── Delete expense entry ──────────────────────────────────────────────────────

export async function deleteExpenseEntry(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const { data: existing } = await supabase
    .from("expense_entries")
    .select("status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!existing) throw new Error("Entry not found");
  if (existing.status !== "uninvoiced") throw new Error("Only uninvoiced entries can be deleted");

  const { error } = await supabase
    .from("expense_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
}

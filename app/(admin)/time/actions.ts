"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Create a project inline (from Log Time modal) ─────────────────────────────

export async function createProject(clientId: string, name: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  // Verify the client belongs to this user
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single();

  if (!client) throw new Error("Client not found");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name is required");

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ client_id: clientId, name: trimmed, billing_type: "hourly", is_active: true })
    .select("id, client_id, name, hourly_rate_override")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/time");
  revalidatePath("/projects");

  return project as { id: string; client_id: string; name: string; hourly_rate_override: number | null };
}

// ─── Upsert time entry (create or update) ──────────────────────────────────────

export async function upsertTimeEntry(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const id          = (formData.get("id") as string) || null;
  const clientId    = formData.get("client_id")    as string;
  const projectId   = (formData.get("project_id") as string) || null;
  const dateWorked  = formData.get("date_worked")  as string;
  const hours       = parseFloat(formData.get("hours_decimal") as string);
  const description = (formData.get("description") as string) || null;
  const billable    = formData.get("billable") === "true";

  if (!clientId || !dateWorked || isNaN(hours) || hours <= 0) {
    throw new Error("Client, date, and hours are required");
  }

  if (id) {
    // ── Update existing entry ────────────────────────────────────────────────
    // Only uninvoiced entries may be edited
    const { data: existing } = await supabase
      .from("time_entries")
      .select("status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!existing) throw new Error("Entry not found");
    if (existing.status !== "uninvoiced") {
      throw new Error("Only uninvoiced entries can be edited");
    }

    const { error } = await supabase
      .from("time_entries")
      .update({ client_id: clientId, project_id: projectId, date_worked: dateWorked, hours_decimal: hours, description, billable })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw new Error(error.message);
  } else {
    // ── Insert new entry ──────────────────────────────────────────────────────
    const { error } = await supabase
      .from("time_entries")
      .insert({ user_id: user.id, client_id: clientId, project_id: projectId, date_worked: dateWorked, hours_decimal: hours, description, billable, status: "uninvoiced" });

    if (error) throw new Error(error.message);
  }

  revalidatePath("/time");
  revalidatePath("/dashboard");
}

// ─── Update just the description on a time entry (inline edit) ────────────────

export async function updateTimeEntryDescription(entryId: string, description: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const { data: existing } = await supabase
    .from("time_entries")
    .select("status")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .single();

  if (!existing) throw new Error("Entry not found");
  if (existing.status !== "uninvoiced") throw new Error("Only uninvoiced entries can be edited");

  const { error } = await supabase
    .from("time_entries")
    .update({ description })
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/time");
}

// ─── Update just the project on a time entry (inline quick-change) ────────────

export async function updateTimeEntryProject(entryId: string, projectId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const { data: existing } = await supabase
    .from("time_entries")
    .select("status")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .single();

  if (!existing) throw new Error("Entry not found");
  if (existing.status !== "uninvoiced") throw new Error("Only uninvoiced entries can be edited");

  const { error } = await supabase
    .from("time_entries")
    .update({ project_id: projectId })
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/time");
}

// ─── Delete time entry ─────────────────────────────────────────────────────────

export async function deleteTimeEntry(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const { data: existing } = await supabase
    .from("time_entries")
    .select("status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!existing) throw new Error("Entry not found");
  if (existing.status !== "uninvoiced") {
    throw new Error("Only uninvoiced entries can be deleted");
  }

  const { error } = await supabase
    .from("time_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/time");
  revalidatePath("/dashboard");
}

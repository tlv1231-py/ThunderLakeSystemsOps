"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Upsert project (create or update) ────────────────────────────────────────

export async function upsertProject(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const id             = (formData.get("id") as string) || null;
  const clientId       = formData.get("client_id") as string;
  const name           = (formData.get("name") as string)?.trim();
  const description    = (formData.get("description") as string)?.trim() || null;
  const billingType    = ((formData.get("billing_type") as string) || "hourly") as "hourly" | "fixed" | "retainer";
  const rateRaw        = formData.get("hourly_rate_override") as string;
  const hourlyRate     = rateRaw ? parseFloat(rateRaw) : null;
  const estRaw         = formData.get("estimated_hours") as string;
  const estimatedHours = estRaw ? parseFloat(estRaw) : null;
  const isActive       = formData.get("is_active") !== "false";

  if (!clientId || !name) throw new Error("Client and name are required");

  // Verify the client belongs to this user
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single();
  if (!client) throw new Error("Client not found");

  const payload = {
    client_id:            clientId,
    name,
    description,
    billing_type:         billingType,
    hourly_rate_override: hourlyRate,
    estimated_hours:      estimatedHours,
    is_active:            isActive,
  };

  if (id) {
    // ── Update ──────────────────────────────────────────────────────────────
    // Verify ownership through client
    const { data: existing } = await supabase
      .from("projects")
      .select("id, clients!inner(user_id)")
      .eq("id", id)
      .eq("clients.user_id", user.id)
      .single();
    if (!existing) throw new Error("Project not found");

    const { error } = await supabase
      .from("projects")
      .update(payload)
      .eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    // ── Insert ──────────────────────────────────────────────────────────────
    const { error } = await supabase
      .from("projects")
      .insert(payload);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/projects");
  revalidatePath("/time");
}

// ─── Delete project ────────────────────────────────────────────────────────────

export async function deleteProject(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  // Verify ownership
  const { data: existing } = await supabase
    .from("projects")
    .select("id, clients!inner(user_id)")
    .eq("id", id)
    .eq("clients.user_id", user.id)
    .single();
  if (!existing) throw new Error("Project not found");

  // Block deletion if time entries are attached
  const { count } = await supabase
    .from("time_entries")
    .select("id", { count: "exact", head: true })
    .eq("project_id", id);
  if ((count ?? 0) > 0) {
    throw new Error(`Cannot delete — ${count} time ${count === 1 ? "entry is" : "entries are"} logged against this project`);
  }

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/projects");
  revalidatePath("/time");
}

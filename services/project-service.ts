import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { logActivity } from "./activity-service";
import { ACTIVITY_EVENTS } from "@/lib/constants";

type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

export async function getProjects(clientId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("projects")
    .select("*, clients(company_name, user_id)")
    .order("name");

  if (clientId) {
    query = query.eq("client_id", clientId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getProject(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, clients(company_name, user_id, currency, default_hourly_rate)")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function createProject(
  userId: string,
  input: ProjectInsert
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert(input)
    .select()
    .single();

  if (error) throw error;

  await logActivity({
    user_id: userId,
    client_id: data.client_id,
    project_id: data.id,
    event_type: ACTIVITY_EVENTS.PROJECT_CREATED,
    event_data: { name: data.name, billing_type: data.billing_type },
    visibility: "internal",
  });

  return data;
}

export async function updateProject(
  id: string,
  input: ProjectUpdate
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

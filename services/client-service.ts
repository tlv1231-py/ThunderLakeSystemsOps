import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { logActivity } from "./activity-service";
import { ACTIVITY_EVENTS } from "@/lib/constants";

type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"];

export async function getClients(activeOnly = false) {
  const supabase = await createClient();
  let query = supabase
    .from("clients")
    .select("id,company_name,contact_name,contact_email,currency,is_active,user_id")
    .order("company_name");

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getClient(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*, reminder_schedules(*), client_users(*)")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function createNewClient(
  userId: string,
  input: Omit<ClientInsert, "user_id">
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...input, user_id: userId })
    .select()
    .single();

  if (error) throw error;

  await logActivity({
    user_id: userId,
    client_id: data.id,
    event_type: ACTIVITY_EVENTS.CLIENT_CREATED,
    event_data: { company_name: data.company_name },
    visibility: "internal",
  });

  return data;
}

export async function updateClient(
  id: string,
  userId: string,
  input: ClientUpdate
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update(input)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;

  await logActivity({
    user_id: userId,
    client_id: id,
    event_type: ACTIVITY_EVENTS.CLIENT_UPDATED,
    event_data: { fields_changed: Object.keys(input) },
    visibility: "internal",
  });

  return data;
}

export async function getClientUsers(clientId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_users")
    .select("*")
    .eq("client_id", clientId)
    .order("name");

  if (error) throw error;
  return data;
}

export async function upsertClientUser(
  clientId: string,
  name: string,
  email: string,
  portalAccessEnabled: boolean
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_users")
    .upsert(
      { client_id: clientId, name, email, portal_access_enabled: portalAccessEnabled },
      { onConflict: "client_id,email" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

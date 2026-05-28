import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ActivityInsert = Database["public"]["Tables"]["activity_events"]["Insert"];

export async function logActivity(event: ActivityInsert): Promise<void> {
  const supabase = await createClient();
  await supabase.from("activity_events").insert(event);
}

export async function getRecentActivity(limit = 20) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_events")
    .select("*, clients(company_name), invoices(invoice_number)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function getClientActivity(clientId: string, limit = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_events")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

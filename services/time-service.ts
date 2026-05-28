import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { logActivity } from "./activity-service";
import { ACTIVITY_EVENTS } from "@/lib/constants";

type TimeEntryInsert = Database["public"]["Tables"]["time_entries"]["Insert"];
type TimeEntryUpdate = Database["public"]["Tables"]["time_entries"]["Update"];
type EntryStatus = Database["public"]["Tables"]["time_entries"]["Row"]["status"];

export async function getTimeEntries(filters?: {
  clientId?: string;
  projectId?: string;
  status?: EntryStatus;
  startDate?: string;
  endDate?: string;
  billable?: boolean;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("time_entries")
    .select("*, clients(company_name), projects(name)")
    .order("date_worked", { ascending: false });

  if (filters?.clientId) query = query.eq("client_id", filters.clientId);
  if (filters?.projectId) query = query.eq("project_id", filters.projectId);
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.startDate) query = query.gte("date_worked", filters.startDate);
  if (filters?.endDate) query = query.lte("date_worked", filters.endDate);
  if (filters?.billable !== undefined) query = query.eq("billable", filters.billable);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getUninvoicedBillableTime(clientId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("time_entries")
    .select("*, clients(company_name, default_hourly_rate, currency), projects(name, hourly_rate_override)")
    .eq("status", "uninvoiced")
    .eq("billable", true)
    .order("date_worked");

  if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createTimeEntry(
  userId: string,
  input: Omit<TimeEntryInsert, "user_id">
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_entries")
    .insert({ ...input, user_id: userId })
    .select()
    .single();

  if (error) throw error;

  await logActivity({
    user_id: userId,
    client_id: data.client_id,
    project_id: data.project_id,
    event_type: ACTIVITY_EVENTS.TIME_ENTRY_CREATED,
    event_data: {
      hours: data.hours_decimal,
      date: data.date_worked,
      billable: data.billable,
    },
    visibility: "internal",
  });

  return data;
}

export async function updateTimeEntry(
  id: string,
  userId: string,
  input: TimeEntryUpdate
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_entries")
    .update(input)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTimeEntry(id: string, userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("time_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "uninvoiced"); // only allow deletion of uninvoiced entries

  if (error) throw error;
}

export async function getTimeSummary(userId: string) {
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const weekStart = startOfWeek.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("time_entries")
    .select("hours_decimal, date_worked, billable, status")
    .eq("user_id", userId)
    .gte("date_worked", weekStart);

  if (error) throw error;

  const todayTotal = (data ?? [])
    .filter((e) => e.date_worked === today)
    .reduce((sum, e) => sum + e.hours_decimal, 0);

  const weekTotal = (data ?? []).reduce((sum, e) => sum + e.hours_decimal, 0);

  return { todayTotal, weekTotal };
}

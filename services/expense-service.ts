import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { logActivity } from "./activity-service";
import { ACTIVITY_EVENTS } from "@/lib/constants";

type ExpenseInsert = Database["public"]["Tables"]["expense_entries"]["Insert"];
type ExpenseUpdate = Database["public"]["Tables"]["expense_entries"]["Update"];
type EntryStatus = Database["public"]["Tables"]["expense_entries"]["Row"]["status"];

export async function getExpenses(filters?: {
  clientId?: string;
  projectId?: string;
  status?: EntryStatus;
  startDate?: string;
  endDate?: string;
  billable?: boolean;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("expense_entries")
    .select("*, clients(company_name), projects(name)")
    .order("date_incurred", { ascending: false });

  if (filters?.clientId) query = query.eq("client_id", filters.clientId);
  if (filters?.projectId) query = query.eq("project_id", filters.projectId);
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.startDate) query = query.gte("date_incurred", filters.startDate);
  if (filters?.endDate) query = query.lte("date_incurred", filters.endDate);
  if (filters?.billable !== undefined) query = query.eq("billable", filters.billable);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getUninvoicedBillableExpenses(clientId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("expense_entries")
    .select("*, clients(company_name, currency), projects(name)")
    .eq("status", "uninvoiced")
    .eq("billable", true)
    .order("date_incurred");

  if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createExpense(
  userId: string,
  input: Omit<ExpenseInsert, "user_id">
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_entries")
    .insert({ ...input, user_id: userId })
    .select()
    .single();

  if (error) throw error;

  await logActivity({
    user_id: userId,
    client_id: data.client_id,
    project_id: data.project_id,
    event_type: ACTIVITY_EVENTS.EXPENSE_CREATED,
    event_data: {
      amount: data.amount,
      currency: data.currency,
      description: data.description,
      billable: data.billable,
    },
    visibility: "internal",
  });

  return data;
}

export async function updateExpense(
  id: string,
  userId: string,
  input: ExpenseUpdate
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_entries")
    .update(input)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteExpense(id: string, userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("expense_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "uninvoiced");

  if (error) throw error;
}

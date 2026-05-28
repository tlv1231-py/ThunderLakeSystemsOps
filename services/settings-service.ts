import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type UserUpdate = Database["public"]["Tables"]["users"]["Update"];

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  return data;
}

export async function updateUserSettings(
  userId: string,
  input: Omit<UserUpdate, "id" | "email" | "created_at">
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .update(input)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getReminderSchedules(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reminder_schedules")
    .select("*, reminder_schedule_rules(*, email_templates(name, type))")
    .eq("user_id", userId)
    .order("name");

  if (error) throw error;
  return data;
}

export async function getEmailTemplates(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order("type")
    .order("name");

  if (error) throw error;
  return data;
}

export async function getTaxes(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("taxes")
    .select("*")
    .eq("user_id", userId)
    .order("name");

  if (error) throw error;
  return data;
}

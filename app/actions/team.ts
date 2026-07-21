"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL, TEAM_EMAIL_DOMAIN } from "@/lib/constants";

export function usernameToEmail(username: string) {
  return `${username.toLowerCase()}@${TEAM_EMAIL_DOMAIN}`;
}

export function emailToUsername(email: string) {
  return email.endsWith(`@${TEAM_EMAIL_DOMAIN}`)
    ? email.slice(0, -(TEAM_EMAIL_DOMAIN.length + 1))
    : email;
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email !== ADMIN_EMAIL) throw new Error("Unauthorized");
}

export async function listTeamMembersAction() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: { users }, error } = await admin.auth.admin.listUsers();
  if (error) throw new Error(error.message);
  return users
    .filter((u) => u.email !== ADMIN_EMAIL)
    .map((u) => ({ id: u.id, email: u.email ?? "", created_at: u.created_at }));
}

export async function createTeamMemberAction(formData: FormData) {
  await requireAdmin();
  const username = (formData.get("username") as string).trim().toLowerCase().replace(/\s+/g, "");
  const password = (formData.get("password") as string).trim();

  if (!username || !password) throw new Error("Username and password are required.");
  if (password.length < 6)    throw new Error("Password must be at least 6 characters.");
  if (!/^[a-z0-9_-]+$/.test(username)) throw new Error("Username can only contain letters, numbers, - and _.");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function deleteTeamMemberAction(userId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

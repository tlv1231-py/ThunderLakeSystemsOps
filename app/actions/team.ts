"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/constants";

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
  const email    = (formData.get("email")    as string).trim().toLowerCase();
  const password = (formData.get("password") as string).trim();

  if (!email || !password) throw new Error("Email and password are required.");
  if (password.length < 6)  throw new Error("Password must be at least 6 characters.");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
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

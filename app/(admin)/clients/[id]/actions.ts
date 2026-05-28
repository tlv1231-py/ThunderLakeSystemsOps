"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function addContact(clientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  // Verify client belongs to this user
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single();
  if (!client) throw new Error("Not found");

  const name  = formData.get("name") as string;
  const email = formData.get("email") as string;

  const { error } = await supabase.from("client_users").upsert(
    { client_id: clientId, name, email, portal_access_enabled: false },
    { onConflict: "client_id,email" }
  );

  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}`);
}

export async function removeContact(clientId: string, contactId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  // Verify client belongs to this user
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single();
  if (!client) throw new Error("Not found");

  await supabase.from("client_users").delete().eq("id", contactId).eq("client_id", clientId);
  revalidatePath(`/clients/${clientId}`);
}

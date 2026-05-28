"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/services/activity-service";
import { ACTIVITY_EVENTS } from "@/lib/constants";

export async function createClient_(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const hourlyRateRaw = formData.get("default_hourly_rate") as string;
  const termsRaw = formData.get("invoice_terms_days") as string;

  const { data, error } = await supabase
    .from("clients")
    .insert({
      user_id:             user.id,
      company_name:        formData.get("company_name") as string,
      contact_name:        (formData.get("contact_name") as string) || null,
      contact_email:       (formData.get("contact_email") as string) || null,
      contact_phone:       (formData.get("contact_phone") as string) || null,
      billing_address:     (formData.get("billing_address") as string) || null,
      currency:            (formData.get("currency") as string) || "USD",
      default_hourly_rate: hourlyRateRaw ? parseFloat(hourlyRateRaw) : null,
      invoice_terms_days:  termsRaw ? parseInt(termsRaw) : 30,
      notes:               (formData.get("notes") as string) || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logActivity({
    user_id:    user.id,
    client_id:  data.id,
    event_type: ACTIVITY_EVENTS.CLIENT_CREATED,
    event_data: { company_name: data.company_name },
    visibility: "internal",
  });

  revalidatePath("/clients");
  redirect(`/clients/${data.id}`);
}

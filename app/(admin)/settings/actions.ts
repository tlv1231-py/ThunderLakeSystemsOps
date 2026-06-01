"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateSettings(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const companyName    = (formData.get("company_name") as string)?.trim() || null;
  const billingAddress = (formData.get("billing_address") as string)?.trim() || null;
  const prefix         = (formData.get("invoice_number_prefix") as string)?.trim() || "INV";
  const taxRatePct     = parseFloat(formData.get("default_tax_rate") as string);
  const termsDays      = parseInt(formData.get("default_invoice_terms_days") as string, 10);

  const { error } = await supabase
    .from("users")
    .update({
      company_name:               companyName,
      billing_address:            billingAddress,
      invoice_number_prefix:      prefix,
      default_tax_rate:           isNaN(taxRatePct) ? 0 : taxRatePct / 100,
      default_invoice_terms_days: isNaN(termsDays)  ? 30 : termsDays,
    })
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/invoices/new"); // tax rate + terms affect new invoice defaults
}

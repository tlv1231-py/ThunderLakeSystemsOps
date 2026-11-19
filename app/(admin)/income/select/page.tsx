import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { IncomeSelector } from "@/components/income/IncomeSelector";

export const metadata = { title: "TLS · Bounty Selector" };
export const revalidate = 60;

export default async function IncomeSelectorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const db = supabase as any;
  const { data: opportunities } = await db
    .from("income_opportunities")
    .select("*")
    .eq("user_id", user.id)
    .not("status", "in", '("dismissed","paid","rejected","in_progress","submitted","accepted")')
    .order("score", { ascending: false })
    .limit(200);

  return <IncomeSelector opportunities={opportunities ?? []} />;
}

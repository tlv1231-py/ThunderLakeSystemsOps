import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MonitorTerminal } from "./MonitorTerminal";

const OWNER_EMAIL = "tlevander.py@gmail.com";

export const metadata = { title: "TLS Monitor" };

export default async function MonitorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== OWNER_EMAIL) redirect("/dashboard");
  return <MonitorTerminal />;
}

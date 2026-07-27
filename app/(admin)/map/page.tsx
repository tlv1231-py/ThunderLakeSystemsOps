import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MapWrapper from "@/components/map/MapWrapper";

const OWNER_EMAIL = "tlevander.py@gmail.com";

export const metadata = { title: "Stamford Live" };

export default async function MapPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== OWNER_EMAIL) redirect("/dashboard");
  return <MapWrapper />;
}

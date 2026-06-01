import { createClient } from "@/lib/supabase/server";
import { TimeTable, type TimeEntry } from "@/components/admin/time-table";

export default async function TimePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: entries },
    { data: clients },
    { data: projects },
  ] = await Promise.all([
    supabase
      .from("time_entries")
      .select("id, date_worked, hours_decimal, description, billable, status, client_id, project_id, invoice_id, clients(company_name), projects(name)")
      .eq("user_id", user!.id)
      .order("date_worked", { ascending: false })
      .limit(100),

    supabase
      .from("clients")
      .select("id, company_name, default_hourly_rate")
      .eq("user_id", user!.id)
      .eq("is_active", true)
      .order("company_name"),

    supabase
      .from("projects")
      .select("id, client_id, name, hourly_rate_override")
      .order("name"),
  ]);

  return (
    <div className="space-y-6">
      <TimeTable
        entries={(entries ?? []) as TimeEntry[]}
        clients={clients ?? []}
        projects={projects ?? []}
      />
    </div>
  );
}

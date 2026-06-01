import { createClient } from "@/lib/supabase/server";
import { ProjectsTable, type ProjectRow, type ClientOption } from "@/components/admin/projects-table";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: projects },
    { data: clients },
    { data: timeEntries },
  ] = await Promise.all([
    // Projects with client name
    supabase
      .from("projects")
      .select("id, client_id, name, description, billing_type, hourly_rate_override, estimated_hours, is_active, clients(company_name)")
      .eq("clients.user_id", user!.id)
      .order("name"),

    // Active clients for the create/edit form
    supabase
      .from("clients")
      .select("id, company_name")
      .eq("user_id", user!.id)
      .eq("is_active", true)
      .order("company_name"),

    // All time entries with a project — to compute actual hours per project
    supabase
      .from("time_entries")
      .select("project_id, hours_decimal")
      .eq("user_id", user!.id)
      .not("project_id", "is", null),
  ]);

  // Aggregate actual hours per project_id
  const hoursMap: Record<string, number> = {};
  for (const entry of timeEntries ?? []) {
    if (!entry.project_id) continue;
    hoursMap[entry.project_id] = (hoursMap[entry.project_id] ?? 0) + entry.hours_decimal;
  }

  // Attach actual_hours to each project row
  const rows: ProjectRow[] = (projects ?? [])
    .filter((p) => p.clients != null) // only projects belonging to this user's clients
    .map((p) => ({
      id:                   p.id,
      client_id:            p.client_id,
      name:                 p.name,
      description:          p.description,
      billing_type:         p.billing_type,
      hourly_rate_override: p.hourly_rate_override,
      estimated_hours:      p.estimated_hours ?? null,
      is_active:            p.is_active,
      clients:              p.clients as { company_name: string } | null,
      actual_hours:         hoursMap[p.id] ?? 0,
    }));

  const clientOptions: ClientOption[] = (clients ?? []).map((c) => ({
    id:           c.id,
    company_name: c.company_name,
  }));

  return (
    <div className="space-y-6">
      <ProjectsTable projects={rows} clients={clientOptions} />
    </div>
  );
}

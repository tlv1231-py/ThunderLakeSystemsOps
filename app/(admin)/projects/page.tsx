import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: projects } = await supabase
    .from("projects")
    .select("*, clients!inner(company_name, user_id)")
    .eq("clients.user_id", user!.id)
    .order("name");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Projects</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {projects?.length ?? 0} project{projects?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/projects/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          New project
        </Link>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {!projects?.length ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-400">
            No projects yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Project</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Client</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Billing</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {projects.map((project) => (
                <tr key={project.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">{project.name}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {(project.clients as { company_name: string }).company_name}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 capitalize">{project.billing_type}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        project.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {project.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", user!.id)
    .order("company_name");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Clients</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {clients?.length ?? 0} client{clients?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/clients/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          Add client
        </Link>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {!clients?.length ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-400">
            No clients yet. Add your first client to get started.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Company</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Contact</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Currency</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/clients/${client.id}`}
                      className="font-medium text-zinc-900 hover:text-zinc-600"
                    >
                      {client.company_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{client.contact_name ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-600">{client.contact_email ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-600">{client.currency}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        client.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {client.is_active ? "Active" : "Inactive"}
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

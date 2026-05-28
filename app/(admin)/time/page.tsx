import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function TimePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: entries } = await supabase
    .from("time_entries")
    .select("*, clients(company_name), projects(name)")
    .eq("user_id", user!.id)
    .order("date_worked", { ascending: false })
    .limit(100);

  const totalUninvoiced = (entries ?? [])
    .filter((e) => e.status === "uninvoiced" && e.billable)
    .reduce((s, e) => s + e.hours_decimal, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Time</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {totalUninvoiced.toFixed(1)} uninvoiced billable hours
          </p>
        </div>
        <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors">
          Log time
        </button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {!entries?.length ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-400">
            No time entries yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Client</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Project</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Description</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">Hours</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 text-zinc-600 tabular-nums">
                    {formatDate(entry.date_worked)}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {(entry.clients as { company_name: string } | null)?.company_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {(entry.projects as { name: string } | null)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 max-w-xs truncate">
                    {entry.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-zinc-900">
                    {entry.hours_decimal.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <EntryStatusBadge status={entry.status} />
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

function EntryStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    uninvoiced: "bg-amber-50 text-amber-700",
    invoiced: "bg-blue-50 text-blue-700",
    paid: "bg-emerald-50 text-emerald-700",
    written_off: "bg-zinc-100 text-zinc-500",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status] ?? "bg-zinc-100 text-zinc-600"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

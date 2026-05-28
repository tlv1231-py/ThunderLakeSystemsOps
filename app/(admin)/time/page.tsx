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
          <h1 className="text-xl font-semibold text-zinc-100">Time</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {totalUninvoiced.toFixed(1)} uninvoiced billable hours
          </p>
        </div>
        <button className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors">
          Log time
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        {!entries?.length ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            No time entries yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-800/50">
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Client</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Project</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Description</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Hours</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-zinc-800/40">
                  <td className="px-4 py-3 text-zinc-400 tabular-nums">
                    {formatDate(entry.date_worked)}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {(entry.clients as { company_name: string } | null)?.company_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {(entry.projects as { name: string } | null)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 max-w-xs truncate">
                    {entry.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-zinc-100">
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
    uninvoiced: "bg-amber-900/30 text-amber-400",
    invoiced: "bg-blue-900/30 text-blue-400",
    paid: "bg-emerald-900/30 text-emerald-400",
    written_off: "bg-zinc-800 text-zinc-500",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status] ?? "bg-zinc-800 text-zinc-500"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

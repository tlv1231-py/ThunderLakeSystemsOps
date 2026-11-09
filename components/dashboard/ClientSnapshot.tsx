export type ClientSnapshotRow = {
  id: string;
  name: string;
  balance: number;
  uninvoicedHours: number;
  lastInvoiceDaysAgo: number | null;
};

export function ClientSnapshot({ rows }: { rows: ClientSnapshotRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 h-full flex items-center justify-center px-5 py-6">
        <p className="text-xs text-zinc-600">No active clients</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden h-full flex flex-col">
      <div className="px-5 py-4 border-b border-zinc-800 shrink-0">
        <h2 className="text-sm font-medium text-zinc-100">Clients</h2>
      </div>
      <div className="divide-y divide-zinc-800 flex-1 overflow-auto">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-5 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200 truncate">{r.name}</p>
            </div>
            <div className="text-right shrink-0">
              {r.balance > 0 && (
                <p className="text-sm font-medium tabular-nums text-amber-400">
                  ${r.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
              {r.uninvoicedHours > 0 && (
                <p className={`text-xs tabular-nums ${r.balance > 0 ? "text-zinc-500" : "text-zinc-400"}`}>
                  {r.uninvoicedHours.toFixed(1)} hrs
                </p>
              )}
            </div>
            <div className="text-xs text-zinc-600 shrink-0 w-14 text-right tabular-nums">
              {r.lastInvoiceDaysAgo === null
                ? "—"
                : r.lastInvoiceDaysAgo === 0
                ? "today"
                : `${r.lastInvoiceDaysAgo}d`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

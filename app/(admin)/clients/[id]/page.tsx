import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { ClientContacts } from "@/components/admin/client-contacts";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: client }, { data: contacts }, { data: projects }, { data: invoices }, { data: timeEntries }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("*")
        .eq("id", id)
        .eq("user_id", user!.id)
        .single(),
      supabase
        .from("client_users")
        .select("id, name, email, portal_access_enabled")
        .eq("client_id", id)
        .order("name"),
      supabase
        .from("projects")
        .select("*")
        .eq("client_id", id)
        .order("name"),
      supabase
        .from("invoices")
        .select("id, invoice_number, status, total_amount, balance_due, currency, due_date")
        .eq("client_id", id)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("time_entries")
        .select("hours_decimal, status, billable")
        .eq("client_id", id)
        .eq("status", "uninvoiced")
        .eq("billable", true),
    ]);

  if (!client) notFound();

  const uninvoicedHours = (timeEntries ?? []).reduce((s, e) => s + e.hours_decimal, 0);
  const outstanding = (invoices ?? [])
    .filter((i) => i.status !== "paid" && i.status !== "void")
    .reduce((s, i) => s + i.balance_due, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
            <Link href="/clients" className="hover:text-zinc-300">Clients</Link>
            <span>/</span>
            <span className="text-zinc-400">{client.company_name}</span>
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">{client.company_name}</h1>
          {client.contact_name && (
            <p className="mt-1 text-sm text-zinc-500">{client.contact_name}</p>
          )}
        </div>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
          client.is_active ? "bg-emerald-900/40 text-emerald-400" : "bg-zinc-800 text-zinc-500"
        }`}>
          {client.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Outstanding</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-100">{formatCurrency(outstanding, client.currency)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Uninvoiced Hours</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-100">{uninvoicedHours.toFixed(1)} hrs</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Rate</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-100">
            {client.default_hourly_rate ? formatCurrency(client.default_hourly_rate, client.currency) + "/hr" : "—"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Contact info */}
        <div className="col-span-1 rounded-xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800">
          <div className="px-5 py-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Contact</h2>
          </div>
          <dl className="px-5 py-4 space-y-3 text-sm">
            <InfoRow label="Email" value={client.contact_email} link={client.contact_email ? `mailto:${client.contact_email}` : undefined} />
            <InfoRow label="Phone" value={client.contact_phone} />
            <InfoRow label="Currency" value={client.currency} />
            <InfoRow label="Terms" value={`Net ${client.invoice_terms_days}`} />
            <InfoRow label="Address" value={client.billing_address} />
          </dl>
          {client.notes && (
            <div className="px-5 py-4">
              <p className="text-xs font-medium text-zinc-500 mb-1">Notes</p>
              <p className="text-sm text-zinc-400 whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="col-span-2 space-y-6">
          <ClientContacts clientId={client.id} contacts={contacts ?? []} />
          {/* Projects */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="text-sm font-medium text-zinc-100">Projects</h2>
            </div>
            {!projects?.length ? (
              <p className="px-5 py-6 text-sm text-zinc-500">No projects yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-800">
                {projects.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="text-zinc-200">{p.name}</span>
                    <span className="text-zinc-500 capitalize text-xs">{p.billing_type}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent invoices */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="text-sm font-medium text-zinc-100">Recent Invoices</h2>
            </div>
            {!invoices?.length ? (
              <p className="px-5 py-6 text-sm text-zinc-500">No invoices yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-zinc-800">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-zinc-800/40">
                      <td className="px-5 py-3 font-mono text-zinc-300">{inv.invoice_number}</td>
                      <td className="px-5 py-3 text-zinc-400 tabular-nums">{formatDate(inv.due_date)}</td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums text-zinc-100">{formatCurrency(inv.total_amount, inv.currency)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-xs font-medium capitalize ${
                          inv.status === "paid" ? "text-emerald-400" :
                          inv.status === "overdue" ? "text-red-400" :
                          "text-zinc-400"
                        }`}>{inv.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string | null | undefined; link?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500 shrink-0">{label}</dt>
      <dd className="text-zinc-300 text-right truncate">
        {link ? <a href={link} className="hover:underline">{value}</a> : value}
      </dd>
    </div>
  );
}

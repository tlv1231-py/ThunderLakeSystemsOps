import { createClient } from "@/lib/supabase/server";
import { NewInvoiceForm } from "@/components/admin/new-invoice-form";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { from, to } = await searchParams;

  let timeQuery = supabase
    .from("time_entries")
    .select("id, date_worked, hours_decimal, description, client_id, projects(id, name, hourly_rate_override), clients(default_hourly_rate)")
    .eq("user_id", user!.id)
    .eq("status", "uninvoiced")
    .eq("billable", true)
    .order("date_worked", { ascending: false });
  if (from) timeQuery = timeQuery.gte("date_worked", from);
  if (to)   timeQuery = timeQuery.lte("date_worked", to);

  let expenseQuery = supabase
    .from("expense_entries")
    .select("id, date_incurred, description, amount, client_id")
    .eq("user_id", user!.id)
    .eq("status", "uninvoiced")
    .eq("billable", true)
    .order("date_incurred", { ascending: false });
  if (from) expenseQuery = expenseQuery.gte("date_incurred", from);
  if (to)   expenseQuery = expenseQuery.lte("date_incurred", to);

  const [
    { data: clients },
    { data: timeEntries },
    { data: expenseEntries },
    { data: settings },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name, default_hourly_rate, invoice_terms_days")
      .eq("user_id", user!.id)
      .eq("is_active", true)
      .order("company_name"),

    timeQuery,
    expenseQuery,

    supabase
      .from("users")
      .select("default_tax_rate, default_invoice_terms_days")
      .eq("id", user!.id)
      .single(),
  ]);

  const today = new Date().toISOString().split("T")[0];

  if (!clients?.length) {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">New Invoice</h1>
          <p className="mt-1 text-sm text-zinc-500">Create a new invoice</p>
        </div>
        <p className="text-sm text-zinc-500">
          Add a client before creating an invoice.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">New Invoice</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Select time entries and expenses to bill
        </p>
      </div>

      <NewInvoiceForm
        clients={clients ?? []}
        timeEntries={(timeEntries ?? []) as Parameters<typeof NewInvoiceForm>[0]["timeEntries"]}
        expenseEntries={expenseEntries ?? []}
        defaultTaxRate={settings?.default_tax_rate ?? 0}
        defaultTermsDays={settings?.default_invoice_terms_days ?? 30}
        today={today}
      />
    </div>
  );
}

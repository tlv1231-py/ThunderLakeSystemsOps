import { createClient } from "@/lib/supabase/server";
import { ExpenseTable, type ExpenseEntry, type Client, type Project } from "@/components/admin/expense-table";

export default async function ExpensesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: entries },
    { data: clients },
    { data: projects },
  ] = await Promise.all([
    supabase
      .from("expense_entries")
      .select("id, date_incurred, description, amount, currency, billable, status, client_id, project_id, invoice_id, clients(company_name), projects(name)")
      .eq("user_id", user!.id)
      .order("date_incurred", { ascending: false })
      .limit(100),

    supabase
      .from("clients")
      .select("id, company_name")
      .eq("user_id", user!.id)
      .eq("is_active", true)
      .order("company_name"),

    supabase
      .from("projects")
      .select("id, client_id, name")
      .order("name"),
  ]);

  return (
    <div className="space-y-6">
      <ExpenseTable
        entries={(entries ?? []) as ExpenseEntry[]}
        clients={(clients ?? []) as Client[]}
        projects={(projects ?? []) as Project[]}
      />
    </div>
  );
}

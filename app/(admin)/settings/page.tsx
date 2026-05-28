import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: settings } = await supabase
    .from("users")
    .select("*")
    .eq("id", user!.id)
    .single();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Company info, defaults, and preferences</p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
        <SettingsSection title="Company">
          <SettingsRow label="Company name" value={settings?.company_name ?? "—"} />
          <SettingsRow label="Billing address" value={settings?.billing_address ?? "—"} />
        </SettingsSection>

        <SettingsSection title="Invoicing Defaults">
          <SettingsRow label="Invoice prefix" value={settings?.invoice_number_prefix ?? "INV"} />
          <SettingsRow label="Next sequence" value={String(settings?.invoice_number_sequence ?? 1)} />
          <SettingsRow label="Default currency" value={settings?.default_currency ?? "USD"} />
          <SettingsRow label="Default tax rate" value={`${((settings?.default_tax_rate ?? 0) * 100).toFixed(2)}%`} />
          <SettingsRow label="Default payment terms" value={`Net ${settings?.default_invoice_terms_days ?? 30}`} />
        </SettingsSection>
      </div>

      <p className="text-xs text-zinc-400">
        Full settings editing UI coming in a subsequent build. Database schema is live and RLS-enforced.
      </p>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-5">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <dl className="space-y-3">{children}</dl>
    </div>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-sm text-zinc-600">{label}</dt>
      <dd className="text-sm font-medium text-zinc-900">{value}</dd>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/admin/settings-form";
import { TeamMembersSection } from "@/components/admin/team-members-section";
import { listTeamMembersAction } from "@/app/actions/team";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: settings } = await supabase
    .from("users")
    .select("company_name, billing_address, invoice_number_prefix, invoice_number_sequence, default_currency, default_tax_rate, default_invoice_terms_days")
    .eq("id", user!.id)
    .single();

  const teamMembers = await listTeamMembersAction().catch(() => []);
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/login`;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Company info, invoicing defaults, and preferences</p>
      </div>

      <SettingsForm settings={settings} />

      <TeamMembersSection initialMembers={teamMembers} loginUrl={loginUrl} />
    </div>
  );
}

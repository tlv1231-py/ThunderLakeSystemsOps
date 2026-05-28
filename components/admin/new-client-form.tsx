"use client";

import { useActionState } from "react";
import { createClient_ } from "@/app/(admin)/clients/actions";
import { CURRENCIES } from "@/lib/constants";

const initialState = { error: null };

export function NewClientForm() {
  const [state, action, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      try {
        await createClient_(formData);
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Failed to save client" };
      }
    },
    initialState
  );

  return (
    <form action={action} className="rounded-xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800">
      <Section title="Company">
        <Field label="Company name" name="company_name" required placeholder="Acme Corp" />
        <Field label="Billing address" name="billing_address" placeholder="123 Main St, City, ST 00000" />
      </Section>

      <Section title="Contact">
        <Field label="Contact name" name="contact_name" placeholder="Jane Smith" />
        <Field label="Email" name="contact_email" type="email" placeholder="jane@acme.com" />
        <Field label="Phone" name="contact_phone" type="tel" placeholder="+1 555 000 0000" />
      </Section>

      <Section title="Billing defaults">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Currency</label>
          <select
            name="currency"
            defaultValue="USD"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
            ))}
          </select>
        </div>
        <Field label="Default hourly rate" name="default_hourly_rate" type="number" step="0.01" placeholder="150.00" />
        <Field label="Payment terms (days)" name="invoice_terms_days" type="number" defaultValue="30" />
      </Section>

      <Section title="Notes">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Notes <span className="text-zinc-500 font-normal">(internal only)</span>
          </label>
          <textarea
            name="notes"
            rows={3}
            placeholder="Any notes about this client…"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none resize-none"
          />
        </div>
      </Section>

      <div className="px-6 py-4 flex items-center justify-between">
        {state.error && <p className="text-sm text-red-400">{state.error}</p>}
        <div className="ml-auto flex gap-3">
          <a
            href="/clients"
            className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:opacity-50"
          >
            {pending ? "Saving…" : "Add client"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-5 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      {children}
    </div>
  );
}

function Field({
  label, name, required, type = "text", placeholder, defaultValue, step,
}: {
  label: string; name: string; required?: boolean; type?: string;
  placeholder?: string; defaultValue?: string; step?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        step={step}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
      />
    </div>
  );
}

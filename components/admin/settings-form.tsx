"use client";

import { useState, useTransition } from "react";
import { updateSettings } from "@/app/(admin)/settings/actions";

type Settings = {
  company_name: string | null;
  billing_address: string | null;
  invoice_number_prefix: string;
  invoice_number_sequence: number;
  default_currency: string;
  default_tax_rate: number;
  default_invoice_terms_days: number;
};

export function SettingsForm({ settings }: { settings: Settings | null }) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateSettings(fd);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  const taxPct = ((settings?.default_tax_rate ?? 0) * 100).toFixed(2);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* Company */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800">
        <div className="px-6 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Company</h3>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Company name</label>
            <input
              name="company_name"
              type="text"
              defaultValue={settings?.company_name ?? ""}
              placeholder="Thunder Lake Systems"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-600">Appears in the "From" section on invoices.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Billing address</label>
            <textarea
              name="billing_address"
              defaultValue={settings?.billing_address ?? ""}
              rows={3}
              placeholder={"123 Main St\nCity, ST 00000"}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none resize-none"
            />
          </div>
        </div>
      </section>

      {/* Invoicing defaults */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800">
        <div className="px-6 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Invoicing Defaults</h3>
        </div>

        <div className="px-6 py-5 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Invoice prefix</label>
            <input
              name="invoice_number_prefix"
              type="text"
              defaultValue={settings?.invoice_number_prefix ?? "INV"}
              placeholder="INV"
              maxLength={10}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-600">e.g. INV-2026-001</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Next sequence #</label>
            <input
              type="text"
              value={settings?.invoice_number_sequence ?? 1}
              disabled
              className="w-full rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2.5 text-sm text-zinc-500 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-zinc-600">Auto-increments on each invoice.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Default tax rate</label>
            <div className="relative">
              <input
                name="default_tax_rate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={taxPct}
                placeholder="0.00"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 pr-8 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Payment terms</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">Net</span>
              <input
                name="default_invoice_terms_days"
                type="number"
                step="1"
                min="0"
                defaultValue={settings?.default_invoice_terms_days ?? 30}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-12 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">days</span>
            </div>
          </div>
        </div>
      </section>

      {/* Save row */}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {saved && !pending && (
          <span className="text-sm text-emerald-400">✓ Saved</span>
        )}
      </div>
    </form>
  );
}

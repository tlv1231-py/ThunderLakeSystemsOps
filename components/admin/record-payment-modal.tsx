"use client";

import { useState, useRef } from "react";
import { recordPayment } from "@/app/(admin)/payments/actions";
import { formatCurrency } from "@/lib/utils";
import { PAYMENT_METHODS } from "@/lib/constants";

type Invoice = {
  id: string;
  invoice_number: string;
  balance_due: number;
  currency: string;
  clients: { company_name: string } | null;
};

export function RecordPaymentModal({ invoices }: { invoices: Invoice[] }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(invoices[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const selected = invoices.find((i) => i.id === selectedId);
  const today = new Date().toISOString().split("T")[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData(formRef.current!);
      await recordPayment(fd);
      setOpen(false);
      formRef.current?.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={invoices.length === 0}
        className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:opacity-40"
      >
        Record payment
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-100">Record Payment</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              {/* Invoice selector */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Invoice</label>
                <select
                  name="invoice_id"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
                >
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} —{" "}
                      {(inv.clients as { company_name: string } | null)?.company_name} —{" "}
                      {formatCurrency(inv.balance_due, inv.currency)} due
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={selected?.balance_due}
                    defaultValue={selected?.balance_due?.toFixed(2)}
                    key={selectedId}
                    required
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-7 pr-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                {selected && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Balance due: {formatCurrency(selected.balance_due, selected.currency)}
                  </p>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Payment date</label>
                <input
                  name="payment_date"
                  type="date"
                  defaultValue={today}
                  required
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              {/* Method */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Method</label>
                <select
                  name="payment_method"
                  defaultValue="ach"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Reference */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Reference # <span className="text-zinc-500 font-normal">(optional)</span>
                </label>
                <input
                  name="reference_number"
                  type="text"
                  placeholder="Check #, transaction ID…"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || invoices.length === 0}
                  className="flex-1 rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:opacity-50"
                >
                  {loading ? "Saving…" : "Record payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

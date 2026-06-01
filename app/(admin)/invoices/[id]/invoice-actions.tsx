"use client";

import { useTransition } from "react";
import { markInvoiceSent, voidInvoice } from "@/app/(admin)/invoices/actions";
import { RecordPaymentModal } from "@/components/admin/record-payment-modal";

type InvoiceForPayment = {
  id: string;
  invoice_number: string;
  balance_due: number;
  currency: string;
  clients: { company_name: string } | null;
};

export function InvoiceActions({
  invoiceId,
  status,
  invoice,
}: {
  invoiceId: string;
  status: string;
  invoice: InvoiceForPayment | null;
}) {
  const [pending, startTransition] = useTransition();

  if (status === "paid" || status === "void") return null;

  const canRecordPayment = ["sent", "viewed", "partial", "overdue"].includes(status);

  return (
    <div className="flex items-center gap-2">
      {/* Mark Sent — draft only */}
      {status === "draft" && (
        <button
          onClick={() => startTransition(() => markInvoiceSent(invoiceId))}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          {pending ? "…" : "Mark Sent"}
        </button>
      )}

      {/* Record payment — inline modal pre-filled for this invoice */}
      {canRecordPayment && invoice && (
        <RecordPaymentModal invoices={[invoice]} />
      )}

      {/* Void */}
      <button
        onClick={() => {
          if (!confirm("Void this invoice? Linked time entries will return to uninvoiced.")) return;
          startTransition(() => voidInvoice(invoiceId));
        }}
        disabled={pending}
        className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-500 hover:border-red-700 hover:text-red-400 transition-colors disabled:opacity-50"
      >
        Void
      </button>
    </div>
  );
}

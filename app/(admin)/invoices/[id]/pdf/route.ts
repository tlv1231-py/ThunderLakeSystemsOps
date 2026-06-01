import { createClient } from "@/lib/supabase/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { InvoicePDF, type InvoicePDFData } from "@/components/InvoicePDF";
import { createElement, type ReactElement } from "react";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [
    { data: invoice },
    { data: timeEntries },
    { data: expenseEntries },
    { data: userSettings },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "invoice_number, status, issue_date, due_date, subtotal, tax_amount, discount_amount, total_amount, amount_paid, balance_due, currency, notes, clients(company_name, billing_address)"
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),

    supabase
      .from("time_entries")
      .select(
        "date_worked, hours_decimal, description, projects(name, hourly_rate_override), clients(default_hourly_rate)"
      )
      .eq("invoice_id", id)
      .order("date_worked"),

    supabase
      .from("expense_entries")
      .select("date_incurred, description, amount")
      .eq("invoice_id", id)
      .order("date_incurred"),

    supabase
      .from("users")
      .select("company_name, billing_address")
      .eq("id", user.id)
      .single(),
  ]);

  if (!invoice) {
    return new Response("Not found", { status: 404 });
  }

  const pdfData: InvoicePDFData = {
    invoice_number:   invoice.invoice_number,
    status:           invoice.status,
    issue_date:       invoice.issue_date,
    due_date:         invoice.due_date,
    subtotal:         invoice.subtotal,
    tax_amount:       invoice.tax_amount,
    discount_amount:  invoice.discount_amount,
    total_amount:     invoice.total_amount,
    amount_paid:      invoice.amount_paid,
    balance_due:      invoice.balance_due,
    currency:         invoice.currency,
    notes:            invoice.notes,
    client: invoice.clients as InvoicePDFData["client"],
    company: {
      company_name:    userSettings?.company_name ?? null,
      billing_address: userSettings?.billing_address ?? null,
    },
    timeEntries: (timeEntries ?? []).map((e) => {
      const rate =
        (e.projects as { hourly_rate_override: number | null } | null)
          ?.hourly_rate_override ??
        (e.clients as { default_hourly_rate: number | null } | null)
          ?.default_hourly_rate ??
        0;
      return {
        date_worked:    e.date_worked,
        hours_decimal:  e.hours_decimal,
        description:    e.description,
        project_name:   (e.projects as { name: string } | null)?.name ?? null,
        rate,
      };
    }),
    expenseEntries: (expenseEntries ?? []).map((e) => ({
      date_incurred: e.date_incurred,
      description:   e.description,
      amount:        e.amount,
    })),
  };

  const element = createElement(InvoicePDF, { data: pdfData }) as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoice_number}.pdf"`,
      "Cache-Control":       "no-store",
    },
  });
}

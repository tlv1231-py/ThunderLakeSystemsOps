import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { projectColorIndex } from "@/lib/utils";

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111827",
    padding: 48,
    backgroundColor: "#ffffff",
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 40,
  },
  company: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  companyAddress: {
    fontSize: 9,
    color: "#6b7280",
    marginTop: 4,
    lineHeight: 1.5,
  },
  invoiceLabel: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    textAlign: "right",
  },
  invoiceNumber: {
    fontSize: 10,
    color: "#6b7280",
    textAlign: "right",
    marginTop: 4,
  },
  // Meta row
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  metaBlock: {
    flexDirection: "column",
    gap: 2,
  },
  metaLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 10,
    color: "#111827",
    lineHeight: 1.5,
  },
  metaValueMuted: {
    fontSize: 9,
    color: "#6b7280",
    lineHeight: 1.5,
  },
  // Status badge
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  statusText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Divider
  divider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginBottom: 16,
  },
  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  colDate:   { width: "15%"  },
  colDesc:   { width: "40%"  },
  colHrs:    { width: "12%", textAlign: "right" },
  colRate:   { width: "13%", textAlign: "right" },
  colAmount: { width: "20%", textAlign: "right" },
  // Project badge (inside description column)
  projectBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginBottom: 3,
  },
  projectBadgeText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  thText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  tdText: {
    fontSize: 9,
    color: "#374151",
  },
  tdTextBold: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  // Totals
  totalsContainer: {
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  totalsBlock: {
    width: 200,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalLabel: {
    fontSize: 9,
    color: "#6b7280",
  },
  totalValue: {
    fontSize: 9,
    color: "#374151",
    textAlign: "right",
  },
  totalDivider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 6,
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  grandTotalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  grandTotalValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    textAlign: "right",
  },
  // Notes
  notes: {
    marginTop: 32,
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 4,
  },
  notesLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 9,
    color: "#374151",
    lineHeight: 1.6,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 32,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 10,
  },
  footerText: {
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
  },
});

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface InvoicePDFData {
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  currency: string;
  notes: string | null;
  client: {
    company_name: string;
    billing_address: string | null;
  } | null;
  company: {
    company_name: string | null;
    billing_address: string | null;
  };
  timeEntries: Array<{
    date_worked: string;
    hours_decimal: number;
    description: string | null;
    project_name: string | null;
    rate: number;
  }>;
  expenseEntries: Array<{
    date_incurred: string;
    description: string | null;
    amount: number;
  }>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtCurrency(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:   { bg: "#f3f4f6", color: "#6b7280" },
  sent:    { bg: "#dbeafe", color: "#1d4ed8" },
  viewed:  { bg: "#e0e7ff", color: "#4338ca" },
  partial: { bg: "#fef3c7", color: "#d97706" },
  paid:    { bg: "#d1fae5", color: "#059669" },
  overdue: { bg: "#fee2e2", color: "#dc2626" },
  void:    { bg: "#f3f4f6", color: "#9ca3af" },
};

// ─── Project badge palette (light/print) ──────────────────────────────────────
// Index must match projectColorIndex() modulo — same order as the app's dark palette.

const PDF_PROJECT_COLORS: Array<{ bg: string; color: string }> = [
  { bg: "#dbeafe", color: "#1d4ed8" }, // blue
  { bg: "#d1fae5", color: "#059669" }, // emerald
  { bg: "#fef3c7", color: "#d97706" }, // amber
  { bg: "#ede9fe", color: "#7c3aed" }, // violet
  { bg: "#ffe4e6", color: "#e11d48" }, // rose
  { bg: "#cffafe", color: "#0891b2" }, // cyan
  { bg: "#ffedd5", color: "#ea580c" }, // orange
  { bg: "#ccfbf1", color: "#0d9488" }, // teal
];

// ─── Component ─────────────────────────────────────────────────────────────────

export function InvoicePDF({ data }: { data: InvoicePDFData }) {
  const statusStyle = STATUS_COLORS[data.status] ?? STATUS_COLORS.draft;
  const hasExpenses = data.expenseEntries.length > 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.company}>
              {data.company.company_name ?? "Thunder Lake Systems"}
            </Text>
            {data.company.billing_address && (
              <Text style={styles.companyAddress}>{data.company.billing_address}</Text>
            )}
            <View style={{ marginTop: 8 }}>
              <Text style={styles.companyAddress}>Payable to: Tyler LeVander</Text>
              <Text style={styles.companyAddress}>37 Douglas Ave, Apt 1, Stamford, CT 06906</Text>
              <Text style={styles.companyAddress}>Venmo: @ThunderLakeStudios</Text>
              <Text style={styles.companyAddress}>Zelle: 203-451-1096</Text>
            </View>
          </View>
          <View>
            <Text style={styles.invoiceLabel}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{data.invoice_number}</Text>
          </View>
        </View>

        {/* ── Meta row ───────────────────────────────────────────────── */}
        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Bill To</Text>
            <Text style={styles.metaValue}>{data.client?.company_name ?? "—"}</Text>
            {data.client?.billing_address && (
              <Text style={styles.metaValueMuted}>{data.client.billing_address}</Text>
            )}
          </View>

          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Issue Date</Text>
            <Text style={styles.metaValue}>{fmtDate(data.issue_date)}</Text>
          </View>

          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Due Date</Text>
            <Text style={styles.metaValue}>{fmtDate(data.due_date)}</Text>
          </View>

          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Status</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.color }]}>
                {data.status}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Time entries table ─────────────────────────────────────── */}
        {data.timeEntries.length > 0 && (
          <View>
            <View style={styles.tableHeader}>
              <Text style={[styles.thText, styles.colDate]}>Date</Text>
              <Text style={[styles.thText, styles.colDesc]}>Description</Text>
              <Text style={[styles.thText, styles.colHrs]}>Hrs</Text>
              <Text style={[styles.thText, styles.colRate]}>Rate</Text>
              <Text style={[styles.thText, styles.colAmount]}>Amount</Text>
            </View>
            {data.timeEntries.map((e, i) => {
              const projColor = e.project_name
                ? PDF_PROJECT_COLORS[projectColorIndex(e.project_name)]
                : null;
              return (
                <View key={i} style={styles.tableRow}>
                  <Text style={[styles.tdText, styles.colDate]}>{fmtDate(e.date_worked)}</Text>
                  <View style={styles.colDesc}>
                    {projColor && (
                      <View style={[styles.projectBadge, { backgroundColor: projColor.bg }]}>
                        <Text style={[styles.projectBadgeText, { color: projColor.color }]}>
                          {e.project_name}
                        </Text>
                      </View>
                    )}
                    {e.description ? (
                      <Text style={styles.tdText}>{e.description}</Text>
                    ) : (
                      !projColor && <Text style={styles.tdText}>—</Text>
                    )}
                  </View>
                  <Text style={[styles.tdText, styles.colHrs]}>{e.hours_decimal.toFixed(2)}</Text>
                  <Text style={[styles.tdText, styles.colRate]}>
                    {e.rate > 0 ? fmtCurrency(e.rate) : "—"}
                  </Text>
                  <Text style={[styles.tdTextBold, styles.colAmount]}>
                    {e.rate > 0 ? fmtCurrency(e.hours_decimal * e.rate, data.currency) : "—"}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Expenses table ─────────────────────────────────────────── */}
        {hasExpenses && (
          <View style={{ marginTop: 16 }}>
            <View style={styles.tableHeader}>
              <Text style={[styles.thText, styles.colDate]}>Date</Text>
              <Text style={[styles.thText, { width: "60%" }]}>Expense</Text>
              <Text style={[styles.thText, styles.colAmount]}>Amount</Text>
            </View>
            {data.expenseEntries.map((e, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tdText, styles.colDate]}>{fmtDate(e.date_incurred)}</Text>
                <Text style={[styles.tdText, { width: "60%" }]}>{e.description ?? "—"}</Text>
                <Text style={[styles.tdTextBold, styles.colAmount]}>
                  {fmtCurrency(e.amount, data.currency)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Totals ────────────────────────────────────────────────── */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalsBlock}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{fmtCurrency(data.subtotal, data.currency)}</Text>
            </View>
            {data.tax_amount > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Tax</Text>
                <Text style={styles.totalValue}>{fmtCurrency(data.tax_amount, data.currency)}</Text>
              </View>
            )}
            {data.discount_amount > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Discount</Text>
                <Text style={[styles.totalValue, { color: "#059669" }]}>
                  −{fmtCurrency(data.discount_amount, data.currency)}
                </Text>
              </View>
            )}
            <View style={styles.totalDivider} />
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Total Due</Text>
              <Text style={styles.grandTotalValue}>
                {fmtCurrency(data.total_amount, data.currency)}
              </Text>
            </View>
            {data.amount_paid > 0 && (
              <>
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: "#059669" }]}>Paid</Text>
                  <Text style={[styles.totalValue, { color: "#059669" }]}>
                    −{fmtCurrency(data.amount_paid, data.currency)}
                  </Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.grandTotalLabel}>Balance Due</Text>
                  <Text style={styles.grandTotalValue}>
                    {fmtCurrency(data.balance_due, data.currency)}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* ── Notes ────────────────────────────────────────────────── */}
        {data.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{data.notes}</Text>
          </View>
        )}

        {/* ── Footer ───────────────────────────────────────────────── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {data.invoice_number} · Thank you for your business.
          </Text>
        </View>

      </Page>
    </Document>
  );
}

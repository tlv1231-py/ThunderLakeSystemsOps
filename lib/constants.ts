// The one account that owns the invoicing workspace
export const ADMIN_EMAIL = "tlevander.py@gmail.com";

// Fake domain used to satisfy Supabase's email requirement for team accounts.
// Team members log in with just their username — the @thunderlake.team suffix
// is appended/stripped automatically and never shown to them.
export const TEAM_EMAIL_DOMAIN = "thunderlake.team";

export const CURRENCIES = [
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "AUD", label: "Australian Dollar" },
] as const;

export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

export const PAYMENT_METHODS = [
  { value: "ach", label: "ACH" },
  { value: "wire", label: "Wire Transfer" },
  { value: "check", label: "Check" },
  { value: "venmo", label: "Venmo" },
  { value: "paypal", label: "PayPal" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
] as const;

export const BILLING_TYPES = [
  { value: "hourly", label: "Hourly" },
  { value: "fixed", label: "Fixed Price" },
  { value: "retainer", label: "Retainer" },
] as const;

export const INVOICE_STATUSES = [
  { value: "draft", label: "Draft", color: "text-zinc-500" },
  { value: "sent", label: "Sent", color: "text-blue-600" },
  { value: "viewed", label: "Viewed", color: "text-indigo-600" },
  { value: "partial", label: "Partial", color: "text-amber-600" },
  { value: "paid", label: "Paid", color: "text-emerald-600" },
  { value: "overdue", label: "Overdue", color: "text-red-600" },
  { value: "void", label: "Void", color: "text-zinc-400" },
] as const;

export const ACTIVITY_EVENTS = {
  CLIENT_CREATED: "client.created",
  CLIENT_UPDATED: "client.updated",
  PROJECT_CREATED: "project.created",
  TIME_ENTRY_CREATED: "time_entry.created",
  EXPENSE_CREATED: "expense.created",
  INVOICE_CREATED: "invoice.created",
  INVOICE_SENT: "invoice.sent",
  INVOICE_VIEWED: "invoice.viewed",
  INVOICE_PAID: "invoice.paid",
  INVOICE_VOID: "invoice.void",
  PAYMENT_RECEIVED: "payment.received",
  REMINDER_SENT: "reminder.sent",
  FILE_UPLOADED: "file.uploaded",
} as const;

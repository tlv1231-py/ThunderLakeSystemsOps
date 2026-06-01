-- Backfill three paid invoices for Greenleaf historical work
-- so the Cashflow Timeline shows green paid bars

-- ── INV-2025-001: March 2025 — 6.0 hrs × $50 = $300 ──────────────────────────
insert into public.invoices (
  id, user_id, client_id, invoice_number, status,
  issue_date, due_date,
  subtotal, tax_amount, discount_amount, total_amount,
  amount_paid, balance_due, currency
) values (
  'b0000000-0000-0000-0000-202500000001',
  '9133c4a3-2734-4390-b9b8-19ddd4eecb8e',
  'bd4a36be-2651-40e5-8a05-963f1dc5b4db',
  'INV-2025-001', 'paid',
  '2025-04-01', '2025-04-30',
  300.00, 0.00, 0.00, 300.00,
  300.00, 0.00, 'USD'
);

insert into public.payments (invoice_id, client_id, amount, payment_date, payment_method)
values (
  'b0000000-0000-0000-0000-202500000001',
  'bd4a36be-2651-40e5-8a05-963f1dc5b4db',
  300.00, '2025-04-15', 'ach'
);

update public.time_entries
set invoice_id = 'b0000000-0000-0000-0000-202500000001'
where user_id  = '9133c4a3-2734-4390-b9b8-19ddd4eecb8e'
  and client_id = 'bd4a36be-2651-40e5-8a05-963f1dc5b4db'
  and status    = 'paid'
  and date_worked >= '2025-03-01'
  and date_worked <  '2025-04-01';


-- ── INV-2025-002: November 2025 — 18.5 hrs × $50 = $925 ──────────────────────
insert into public.invoices (
  id, user_id, client_id, invoice_number, status,
  issue_date, due_date,
  subtotal, tax_amount, discount_amount, total_amount,
  amount_paid, balance_due, currency
) values (
  'b0000000-0000-0000-0000-202500000002',
  '9133c4a3-2734-4390-b9b8-19ddd4eecb8e',
  'bd4a36be-2651-40e5-8a05-963f1dc5b4db',
  'INV-2025-002', 'paid',
  '2025-12-01', '2025-12-31',
  925.00, 0.00, 0.00, 925.00,
  925.00, 0.00, 'USD'
);

insert into public.payments (invoice_id, client_id, amount, payment_date, payment_method)
values (
  'b0000000-0000-0000-0000-202500000002',
  'bd4a36be-2651-40e5-8a05-963f1dc5b4db',
  925.00, '2025-12-15', 'ach'
);

update public.time_entries
set invoice_id = 'b0000000-0000-0000-0000-202500000002'
where user_id  = '9133c4a3-2734-4390-b9b8-19ddd4eecb8e'
  and client_id = 'bd4a36be-2651-40e5-8a05-963f1dc5b4db'
  and status    = 'paid'
  and date_worked >= '2025-11-01'
  and date_worked <  '2025-12-01';


-- ── INV-2025-003: December 2025 — 24.5 hrs × $50 = $1,225 ───────────────────
insert into public.invoices (
  id, user_id, client_id, invoice_number, status,
  issue_date, due_date,
  subtotal, tax_amount, discount_amount, total_amount,
  amount_paid, balance_due, currency
) values (
  'b0000000-0000-0000-0000-202500000003',
  '9133c4a3-2734-4390-b9b8-19ddd4eecb8e',
  'bd4a36be-2651-40e5-8a05-963f1dc5b4db',
  'INV-2025-003', 'paid',
  '2026-01-01', '2026-01-31',
  1225.00, 0.00, 0.00, 1225.00,
  1225.00, 0.00, 'USD'
);

insert into public.payments (invoice_id, client_id, amount, payment_date, payment_method)
values (
  'b0000000-0000-0000-0000-202500000003',
  'bd4a36be-2651-40e5-8a05-963f1dc5b4db',
  1225.00, '2026-01-15', 'ach'
);

update public.time_entries
set invoice_id = 'b0000000-0000-0000-0000-202500000003'
where user_id  = '9133c4a3-2734-4390-b9b8-19ddd4eecb8e'
  and client_id = 'bd4a36be-2651-40e5-8a05-963f1dc5b4db'
  and status    = 'paid'
  and date_worked >= '2025-12-01'
  and date_worked <  '2026-01-01';

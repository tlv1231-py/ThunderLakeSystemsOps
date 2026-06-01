-- Create INV-2026-001 for Greenleaf April 2026 work and mark entries as invoiced/overdue
with new_invoice as (
  insert into public.invoices (
    user_id, client_id, invoice_number, status,
    issue_date, due_date,
    subtotal, tax_amount, discount_amount, total_amount,
    amount_paid, balance_due, currency
  )
  values (
    '9133c4a3-2734-4390-b9b8-19ddd4eecb8e',
    'bd4a36be-2651-40e5-8a05-963f1dc5b4db',
    'INV-2026-001',
    'overdue',
    '2026-05-01',
    '2026-05-15',
    950.00, 0.00, 0.00, 950.00,
    0.00, 950.00, 'USD'
  )
  returning id
),
update_entries as (
  update public.time_entries
  set
    status = 'invoiced',
    invoice_id = (select id from new_invoice)
  where user_id = '9133c4a3-2734-4390-b9b8-19ddd4eecb8e'
    and client_id = 'bd4a36be-2651-40e5-8a05-963f1dc5b4db'
    and status = 'paid'
    and date_worked >= '2026-04-01'
    and date_worked < '2026-05-01'
  returning id
)
update public.users
set invoice_number_sequence = 2
where id = '9133c4a3-2734-4390-b9b8-19ddd4eecb8e';

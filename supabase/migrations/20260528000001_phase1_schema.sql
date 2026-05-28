-- =============================================================================
-- Phase 1: ThunderLake Systems Ops — Full Schema, RLS, Triggers, Functions
-- =============================================================================

-- uuid-ossp not needed — gen_random_uuid() is built-in on Postgres 14+

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type billing_type as enum ('hourly', 'fixed', 'retainer');
create type invoice_status as enum ('draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'void');
create type entry_status as enum ('uninvoiced', 'invoiced', 'paid', 'written_off');
create type payment_method_type as enum ('ach', 'wire', 'check', 'venmo', 'paypal', 'cash', 'other');
create type line_item_type as enum ('time', 'fixed', 'expense', 'adjustment');
create type email_status_type as enum ('pending', 'sent', 'failed', 'bounced', 'opened');
create type email_template_type as enum ('invoice_send', 'reminder', 'overdue');
create type file_visibility as enum ('internal', 'client_visible');
create type event_visibility as enum ('internal', 'client_visible');

-- ---------------------------------------------------------------------------
-- Helper: updated_at auto-set
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Table: users (mirrors auth.users, extended with consultant profile)
-- ---------------------------------------------------------------------------
create table public.users (
  id                          uuid primary key references auth.users(id) on delete cascade,
  email                       text not null,
  name                        text,
  company_name                text,
  company_logo_url            text,
  default_currency            text not null default 'USD',
  default_tax_rate            numeric(5,4) not null default 0,
  default_invoice_terms_days  integer not null default 30,
  invoice_number_prefix       text not null default 'INV',
  invoice_number_sequence     integer not null default 1,
  billing_address             text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create trigger users_updated_at
  before update on public.users
  for each row execute function set_updated_at();

-- Auto-create user row on auth sign-up
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Table: reminder_schedules (defined before clients for FK reference)
-- ---------------------------------------------------------------------------
create table public.reminder_schedules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index reminder_schedules_user_id_idx on public.reminder_schedules(user_id);

create trigger reminder_schedules_updated_at
  before update on public.reminder_schedules
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.users(id) on delete cascade,
  company_name            text not null,
  contact_name            text,
  contact_email           text,
  contact_phone           text,
  billing_address         text,
  timezone                text default 'America/New_York',
  currency                text not null default 'USD',
  default_hourly_rate     numeric(10,2),
  invoice_terms_days      integer not null default 30,
  reminder_schedule_id    uuid references public.reminder_schedules(id) on delete set null,
  notes                   text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index clients_user_id_idx on public.clients(user_id);
create index clients_is_active_idx on public.clients(is_active);

create trigger clients_updated_at
  before update on public.clients
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: client_users (portal access contacts)
-- ---------------------------------------------------------------------------
create table public.client_users (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid not null references public.clients(id) on delete cascade,
  name                    text not null,
  email                   text not null,
  portal_access_enabled   boolean not null default false,
  created_at              timestamptz not null default now(),
  unique(client_id, email)
);

create index client_users_client_id_idx on public.client_users(client_id);
create index client_users_email_idx on public.client_users(email);

-- ---------------------------------------------------------------------------
-- Table: projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references public.clients(id) on delete cascade,
  name                  text not null,
  description           text,
  billing_type          billing_type not null default 'hourly',
  hourly_rate_override  numeric(10,2),
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index projects_client_id_idx on public.projects(client_id);
create index projects_is_active_idx on public.projects(is_active);

create trigger projects_updated_at
  before update on public.projects
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: invoices (accounting snapshot — immutability enforced below)
-- ---------------------------------------------------------------------------
create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  client_id         uuid not null references public.clients(id) on delete restrict,
  invoice_number    text not null,
  status            invoice_status not null default 'draft',
  issue_date        date not null,
  due_date          date not null,
  currency          text not null default 'USD',
  subtotal          numeric(12,2) not null default 0,
  tax_rate          numeric(5,4) not null default 0,
  tax_amount        numeric(12,2) not null default 0,
  discount_amount   numeric(12,2) not null default 0,
  total_amount      numeric(12,2) not null default 0,
  amount_paid       numeric(12,2) not null default 0,
  balance_due       numeric(12,2) not null default 0,
  email_sent_at     timestamptz,
  viewed_at         timestamptz,
  last_reminder_at  timestamptz,
  pdf_url           text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(user_id, invoice_number)
);

create index invoices_user_id_idx on public.invoices(user_id);
create index invoices_client_id_idx on public.invoices(client_id);
create index invoices_status_idx on public.invoices(status);
create index invoices_due_date_idx on public.invoices(due_date);

create trigger invoices_updated_at
  before update on public.invoices
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Invoice immutability trigger
-- Reject changes to financial/identifying fields once status != 'draft'
-- ---------------------------------------------------------------------------
create or replace function enforce_invoice_immutability()
returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' then
    if (
      new.subtotal       <> old.subtotal       or
      new.tax_amount     <> old.tax_amount     or
      new.discount_amount <> old.discount_amount or
      new.total_amount   <> old.total_amount   or
      new.currency       <> old.currency       or
      new.client_id      <> old.client_id
    ) then
      raise exception
        'Invoice % is locked (status: %). Financial fields cannot be modified after draft.',
        old.invoice_number, old.status
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger invoice_immutability_check
  before update on public.invoices
  for each row execute function enforce_invoice_immutability();

-- ---------------------------------------------------------------------------
-- Invoice number generation: {prefix}-{YYYY}-{padded sequence}
-- Atomically increments users.invoice_number_sequence
-- ---------------------------------------------------------------------------
create or replace function generate_invoice_number(p_user_id uuid)
returns text language plpgsql security definer as $$
declare
  v_prefix    text;
  v_sequence  integer;
  v_year      text;
begin
  update public.users
  set invoice_number_sequence = invoice_number_sequence + 1
  where id = p_user_id
  returning invoice_number_prefix, invoice_number_sequence, to_char(now(), 'YYYY')
  into v_prefix, v_sequence, v_year;

  if not found then
    raise exception 'User not found: %', p_user_id;
  end if;

  -- sequence was already incremented, use new value
  return v_prefix || '-' || v_year || '-' || lpad(v_sequence::text, 3, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Table: invoice_line_items
-- ---------------------------------------------------------------------------
create table public.invoice_line_items (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null references public.invoices(id) on delete cascade,
  type                line_item_type not null,
  time_entry_id       uuid,
  expense_entry_id    uuid,
  description         text not null,
  quantity            numeric(10,4) not null default 1,
  unit_rate           numeric(12,2) not null default 0,
  line_total          numeric(12,2) not null default 0,
  sort_order          integer not null default 0
);

create index invoice_line_items_invoice_id_idx on public.invoice_line_items(invoice_id);

-- ---------------------------------------------------------------------------
-- Table: time_entries
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete restrict,
  project_id    uuid references public.projects(id) on delete set null,
  date_worked   date not null,
  hours_decimal numeric(6,2) not null,
  description   text,
  billable      boolean not null default true,
  invoice_id    uuid references public.invoices(id) on delete set null,
  status        entry_status not null default 'uninvoiced',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index time_entries_user_id_idx on public.time_entries(user_id);
create index time_entries_client_id_idx on public.time_entries(client_id);
create index time_entries_project_id_idx on public.time_entries(project_id);
create index time_entries_status_idx on public.time_entries(status);
create index time_entries_date_worked_idx on public.time_entries(date_worked);

-- Now add FK on invoice_line_items.time_entry_id
alter table public.invoice_line_items
  add constraint invoice_line_items_time_entry_id_fkey
  foreign key (time_entry_id) references public.time_entries(id) on delete set null;

create trigger time_entries_updated_at
  before update on public.time_entries
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: expense_entries
-- ---------------------------------------------------------------------------
create table public.expense_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete restrict,
  project_id    uuid references public.projects(id) on delete set null,
  date_incurred date not null,
  description   text not null,
  amount        numeric(12,2) not null,
  currency      text not null default 'USD',
  billable      boolean not null default true,
  receipt_url   text,
  invoice_id    uuid references public.invoices(id) on delete set null,
  status        entry_status not null default 'uninvoiced',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index expense_entries_user_id_idx on public.expense_entries(user_id);
create index expense_entries_client_id_idx on public.expense_entries(client_id);
create index expense_entries_status_idx on public.expense_entries(status);

-- Now add FK on invoice_line_items.expense_entry_id
alter table public.invoice_line_items
  add constraint invoice_line_items_expense_entry_id_fkey
  foreign key (expense_entry_id) references public.expense_entries(id) on delete set null;

create trigger expense_entries_updated_at
  before update on public.expense_entries
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: payments
-- ---------------------------------------------------------------------------
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.invoices(id) on delete restrict,
  client_id         uuid not null references public.clients(id) on delete restrict,
  amount            numeric(12,2) not null,
  payment_date      date not null,
  payment_method    payment_method_type not null default 'other',
  reference_number  text,
  notes             text,
  created_at        timestamptz not null default now()
);

create index payments_invoice_id_idx on public.payments(invoice_id);
create index payments_client_id_idx on public.payments(client_id);

-- ---------------------------------------------------------------------------
-- Table: taxes
-- ---------------------------------------------------------------------------
create table public.taxes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null,
  rate        numeric(5,4) not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index taxes_user_id_idx on public.taxes(user_id);

create trigger taxes_updated_at
  before update on public.taxes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: email_templates (user_id nullable for system defaults)
-- ---------------------------------------------------------------------------
create table public.email_templates (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.users(id) on delete cascade,
  name              text not null,
  type              email_template_type not null,
  subject_template  text not null,
  body_template     text not null,
  is_default        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index email_templates_user_id_idx on public.email_templates(user_id);
create index email_templates_type_idx on public.email_templates(type);

create trigger email_templates_updated_at
  before update on public.email_templates
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed: 3 global default email templates (user_id = null)
-- ---------------------------------------------------------------------------
insert into public.email_templates (id, user_id, name, type, subject_template, body_template, is_default)
values
(
  gen_random_uuid(),
  null,
  'Default Invoice',
  'invoice_send',
  'Invoice {{invoice_number}} from {{company_name}}',
  'Hi {{contact_name}},

Please find attached invoice {{invoice_number}} for {{total_amount}} due on {{due_date}}.

You can view your invoice and payment history in the client portal:
{{portal_url}}

Thank you for your business.

{{company_name}}',
  true
),
(
  gen_random_uuid(),
  null,
  'Default Payment Reminder',
  'reminder',
  'Friendly reminder: Invoice {{invoice_number}} is due {{due_date}}',
  'Hi {{contact_name}},

This is a friendly reminder that invoice {{invoice_number}} for {{balance_due}} is due on {{due_date}}.

View your invoice:
{{portal_url}}

If you have already sent payment, please disregard this message.

Thank you,
{{company_name}}',
  true
),
(
  gen_random_uuid(),
  null,
  'Default Overdue Notice',
  'overdue',
  'Overdue: Invoice {{invoice_number}} — {{days_overdue}} days past due',
  'Hi {{contact_name}},

Invoice {{invoice_number}} for {{balance_due}} was due on {{due_date}} and is now {{days_overdue}} days overdue.

Please remit payment at your earliest convenience:
{{portal_url}}

If you have questions about this invoice or need to discuss payment arrangements, please reply to this email.

{{company_name}}',
  true
);

-- ---------------------------------------------------------------------------
-- Table: reminder_schedule_rules
-- ---------------------------------------------------------------------------
create table public.reminder_schedule_rules (
  id                      uuid primary key default gen_random_uuid(),
  reminder_schedule_id    uuid not null references public.reminder_schedules(id) on delete cascade,
  days_after_due          integer not null,
  email_template_id       uuid references public.email_templates(id) on delete set null,
  active                  boolean not null default true
);

create index reminder_schedule_rules_schedule_id_idx on public.reminder_schedule_rules(reminder_schedule_id);

-- ---------------------------------------------------------------------------
-- Table: email_logs
-- ---------------------------------------------------------------------------
create table public.email_logs (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid references public.clients(id) on delete set null,
  invoice_id            uuid references public.invoices(id) on delete set null,
  template_id           uuid references public.email_templates(id) on delete set null,
  recipient_email       text not null,
  subject               text not null,
  status                email_status_type not null default 'pending',
  provider_message_id   text,
  sent_at               timestamptz,
  opened_at             timestamptz,
  error_message         text
);

create index email_logs_invoice_id_idx on public.email_logs(invoice_id);
create index email_logs_client_id_idx on public.email_logs(client_id);
create index email_logs_status_idx on public.email_logs(status);

-- ---------------------------------------------------------------------------
-- Table: files
-- ---------------------------------------------------------------------------
create table public.files (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  client_id     uuid references public.clients(id) on delete set null,
  project_id    uuid references public.projects(id) on delete set null,
  file_name     text not null,
  file_url      text not null,
  file_type     text,
  file_size     bigint,
  uploaded_by   text,
  visibility    file_visibility not null default 'internal',
  uploaded_at   timestamptz not null default now()
);

create index files_user_id_idx on public.files(user_id);
create index files_client_id_idx on public.files(client_id);
create index files_visibility_idx on public.files(visibility);

-- ---------------------------------------------------------------------------
-- Table: activity_events
-- ---------------------------------------------------------------------------
create table public.activity_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  client_id   uuid references public.clients(id) on delete set null,
  project_id  uuid references public.projects(id) on delete set null,
  invoice_id  uuid references public.invoices(id) on delete set null,
  event_type  text not null,
  event_data  jsonb,
  visibility  event_visibility not null default 'internal',
  created_at  timestamptz not null default now()
);

create index activity_events_user_id_idx on public.activity_events(user_id);
create index activity_events_client_id_idx on public.activity_events(client_id);
create index activity_events_invoice_id_idx on public.activity_events(invoice_id);
create index activity_events_created_at_idx on public.activity_events(created_at desc);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.client_users enable row level security;
alter table public.projects enable row level security;
alter table public.time_entries enable row level security;
alter table public.expense_entries enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.payments enable row level security;
alter table public.taxes enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_logs enable row level security;
alter table public.reminder_schedules enable row level security;
alter table public.reminder_schedule_rules enable row level security;
alter table public.files enable row level security;
alter table public.activity_events enable row level security;

-- ---------------------------------------------------------------------------
-- Helper: is this the authenticated admin (consultant)?
-- ---------------------------------------------------------------------------
-- (Used inline via auth.uid() = user_id comparisons)

-- ---------------------------------------------------------------------------
-- Helper: is the caller a portal user for a given client?
-- Portal users authenticate via Supabase magic link.
-- Their email is matched against client_users.email with portal_access_enabled.
-- ---------------------------------------------------------------------------
create or replace function is_portal_user_for_client(p_client_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1
    from public.client_users cu
    where cu.client_id = p_client_id
      and cu.email = (select email from auth.users where id = auth.uid())
      and cu.portal_access_enabled = true
  );
$$;

-- ---------------------------------------------------------------------------
-- ADMIN RLS POLICIES (authenticated consultant)
-- ---------------------------------------------------------------------------

-- users: own row only
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);
create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- clients: own rows only
create policy "clients_all_own" on public.clients
  for all using (auth.uid() = user_id);

-- client_users: admin manages via client ownership
create policy "client_users_admin" on public.client_users
  for all using (
    exists (
      select 1 from public.clients c
      where c.id = client_users.client_id
        and c.user_id = auth.uid()
    )
  );

-- Portal: client_users can read their own row
create policy "client_users_portal_self" on public.client_users
  for select using (
    email = (select email from auth.users where id = auth.uid())
    and portal_access_enabled = true
  );

-- projects: admin via client ownership
create policy "projects_admin" on public.projects
  for all using (
    exists (
      select 1 from public.clients c
      where c.id = projects.client_id
        and c.user_id = auth.uid()
    )
  );

-- Portal: project read
create policy "projects_portal_read" on public.projects
  for select using (is_portal_user_for_client(client_id));

-- time_entries: admin own rows
create policy "time_entries_admin" on public.time_entries
  for all using (auth.uid() = user_id);

-- expense_entries: admin own rows
create policy "expense_entries_admin" on public.expense_entries
  for all using (auth.uid() = user_id);

-- invoices: admin own rows
create policy "invoices_admin" on public.invoices
  for all using (auth.uid() = user_id);

-- Portal: invoice read for own client
create policy "invoices_portal_read" on public.invoices
  for select using (is_portal_user_for_client(client_id));

-- invoice_line_items: admin via invoice ownership
create policy "invoice_line_items_admin" on public.invoice_line_items
  for all using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_line_items.invoice_id
        and i.user_id = auth.uid()
    )
  );

-- Portal: line items read via invoice
create policy "invoice_line_items_portal_read" on public.invoice_line_items
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_line_items.invoice_id
        and is_portal_user_for_client(i.client_id)
    )
  );

-- payments: admin via invoice ownership
create policy "payments_admin" on public.payments
  for all using (
    exists (
      select 1 from public.invoices i
      where i.id = payments.invoice_id
        and i.user_id = auth.uid()
    )
  );

-- Portal: payment read for own client
create policy "payments_portal_read" on public.payments
  for select using (is_portal_user_for_client(client_id));

-- taxes: admin own rows
create policy "taxes_admin" on public.taxes
  for all using (auth.uid() = user_id);

-- email_templates: own + system defaults (user_id is null)
create policy "email_templates_admin" on public.email_templates
  for select using (auth.uid() = user_id or user_id is null);
create policy "email_templates_admin_write" on public.email_templates
  for insert with check (auth.uid() = user_id);
create policy "email_templates_admin_update" on public.email_templates
  for update using (auth.uid() = user_id);
create policy "email_templates_admin_delete" on public.email_templates
  for delete using (auth.uid() = user_id);

-- email_logs: admin via client ownership
create policy "email_logs_admin" on public.email_logs
  for all using (
    (client_id is null)
    or exists (
      select 1 from public.clients c
      where c.id = email_logs.client_id
        and c.user_id = auth.uid()
    )
  );

-- reminder_schedules: admin own rows
create policy "reminder_schedules_admin" on public.reminder_schedules
  for all using (auth.uid() = user_id);

-- reminder_schedule_rules: admin via schedule ownership
create policy "reminder_schedule_rules_admin" on public.reminder_schedule_rules
  for all using (
    exists (
      select 1 from public.reminder_schedules rs
      where rs.id = reminder_schedule_rules.reminder_schedule_id
        and rs.user_id = auth.uid()
    )
  );

-- files: admin own rows
create policy "files_admin" on public.files
  for all using (auth.uid() = user_id);

-- Portal: files that are client_visible for own client
create policy "files_portal_read" on public.files
  for select using (
    visibility = 'client_visible'
    and client_id is not null
    and is_portal_user_for_client(client_id)
  );

-- activity_events: admin own rows
create policy "activity_events_admin" on public.activity_events
  for all using (auth.uid() = user_id);

-- Portal: client_visible events for own client
create policy "activity_events_portal_read" on public.activity_events
  for select using (
    visibility = 'client_visible'
    and client_id is not null
    and is_portal_user_for_client(client_id)
  );

-- =============================================================================
-- Storage bucket (invoices PDFs and uploaded files)
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

-- Storage policies
create policy "invoices_bucket_admin_all" on storage.objects
  for all using (
    bucket_id = 'invoices'
    and auth.role() = 'authenticated'
  );

create policy "uploads_bucket_admin_all" on storage.objects
  for all using (
    bucket_id = 'uploads'
    and auth.role() = 'authenticated'
  );


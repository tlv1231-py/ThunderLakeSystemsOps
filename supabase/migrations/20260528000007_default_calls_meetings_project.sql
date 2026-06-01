-- Auto-create "Calls & Meetings" project when a new client is inserted
create or replace function create_default_client_project()
returns trigger language plpgsql as $$
begin
  insert into public.projects (client_id, name, billing_type, is_active)
  values (new.id, 'Calls & Meetings', 'hourly', true);
  return new;
end;
$$;

create trigger on_client_created_default_project
  after insert on public.clients
  for each row execute function create_default_client_project();

-- Backfill existing clients that don't already have a "Calls & Meetings" project
insert into public.projects (client_id, name, billing_type, is_active)
select c.id, 'Calls & Meetings', 'hourly', true
from public.clients c
where not exists (
  select 1 from public.projects p
  where p.client_id = c.id
    and p.name = 'Calls & Meetings'
);

-- Fix client_users portal SELECT policy: replace auth.users subquery with auth.email()
-- The authenticated role cannot query auth.users directly from an RLS policy;
-- auth.email() reads from the JWT without a table lookup.
drop policy if exists "client_users_portal_self" on public.client_users;

create policy "client_users_portal_self" on public.client_users
  for select using (
    email = auth.email()
    and portal_access_enabled = true
  );

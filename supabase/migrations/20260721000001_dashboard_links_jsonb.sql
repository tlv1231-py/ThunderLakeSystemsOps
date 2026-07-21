drop table if exists dashboard_links;

create table dashboard_links (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  fields jsonb not null default '[]',
  created_at timestamptz default now()
);

alter table dashboard_links enable row level security;
create policy "users own their links" on dashboard_links
  for all using (auth.uid() = user_id);

alter publication supabase_realtime add table dashboard_links;
alter table dashboard_links replica identity full;

-- Add estimated_hours to projects table
alter table public.projects
  add column if not exists estimated_hours numeric(8,2);

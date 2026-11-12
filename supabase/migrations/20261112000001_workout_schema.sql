-- =============================================================================
-- Workout App Schema
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table: workout_sessions — one row per training session
-- ---------------------------------------------------------------------------
create table public.workout_sessions (
  id                           uuid primary key default gen_random_uuid(),
  user_id                      uuid not null references public.users(id) on delete cascade,
  session_date                 date not null,
  day_of_week                  text not null,
  focus                        text not null,
  workout_key                  text not null,
  travel_mode                  boolean not null default false,
  status                       text not null default 'in_progress',
  started_at                   timestamptz not null default now(),
  completed_at                 timestamptz,
  estimated_duration_minutes   integer,
  actual_duration_minutes      integer,
  notes                        text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  constraint workout_sessions_status_check check (status in ('in_progress', 'completed', 'abandoned'))
);

create trigger workout_sessions_updated_at
  before update on public.workout_sessions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: workout_session_sets — one row per set within a session
-- ---------------------------------------------------------------------------
create table public.workout_session_sets (
  id                     uuid primary key default gen_random_uuid(),
  session_id             uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_slug          text not null,
  exercise_order         integer not null,
  set_number             integer not null,
  prescribed_reps_min    integer,
  prescribed_reps_max    integer,
  prescribed_weight_lb   numeric,
  prescribed_band_lb     numeric,
  actual_reps            integer,
  actual_weight_lb       numeric,
  feedback               text,
  rir                    integer,
  completed              boolean not null default false,
  completed_at           timestamptz,
  created_at             timestamptz not null default now(),
  constraint workout_session_sets_feedback_check
    check (feedback in ('easy', 'about_right', 'hard', 'couldnt_complete') or feedback is null)
);

-- ---------------------------------------------------------------------------
-- Table: workout_progression — per-user per-exercise progression state
-- ---------------------------------------------------------------------------
create table public.workout_progression (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.users(id) on delete cascade,
  exercise_slug            text not null,
  current_weight_lb        numeric,
  current_band_lb          numeric,
  target_reps_min          integer,
  target_reps_max          integer,
  consecutive_successes    integer not null default 0,
  last_session_date        date,
  updated_at               timestamptz not null default now(),
  unique (user_id, exercise_slug)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.workout_sessions enable row level security;
create policy "users own workout sessions"
  on public.workout_sessions for all
  using (auth.uid() = user_id);

alter table public.workout_session_sets enable row level security;
create policy "users own sets via session"
  on public.workout_session_sets for all
  using (
    exists (
      select 1 from public.workout_sessions ws
      where ws.id = session_id and ws.user_id = auth.uid()
    )
  );

alter table public.workout_progression enable row level security;
create policy "users own progression"
  on public.workout_progression for all
  using (auth.uid() = user_id);

import { createClient } from "@/lib/supabase/server";
import type { WorkoutSetPlan, WorkoutExercisePlan, ProgressionRow } from "@/lib/workout/engine";

// Types returned from DB (db as any casts used since migration types aren't generated yet)
export interface DbWorkoutSession {
  id: string;
  session_date: string;
  day_of_week: string;
  focus: string;
  workout_key: string;
  travel_mode: boolean;
  status: "in_progress" | "completed" | "abandoned";
  started_at: string;
  completed_at: string | null;
  estimated_duration_minutes: number | null;
}

export interface DbWorkoutSet {
  id: string;
  session_id: string;
  exercise_slug: string;
  exercise_order: number;
  set_number: number;
  prescribed_reps_min: number | null;
  prescribed_reps_max: number | null;
  prescribed_weight_lb: number | null;
  prescribed_band_lb: number | null;
  actual_reps: number | null;
  actual_weight_lb: number | null;
  feedback: string | null;
  completed: boolean;
  completed_at: string | null;
}

export async function getActiveSession(userId: string): Promise<{ session: DbWorkoutSession; sets: DbWorkoutSet[] } | null> {
  const supabase = await createClient();
  const db = supabase as any;

  const today = new Date().toISOString().split("T")[0];
  const { data: session } = await db
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("session_date", today)
    .neq("status", "abandoned")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return null;

  const { data: sets } = await db
    .from("workout_session_sets")
    .select("*")
    .eq("session_id", session.id)
    .order("exercise_order", { ascending: true })
    .order("set_number", { ascending: true });

  return { session, sets: sets ?? [] };
}

export async function createSession(
  userId: string,
  sessionDate: string,
  dayOfWeek: string,
  focus: string,
  workoutKey: string,
  travelMode: boolean,
  estimatedMinutes: number,
  exercises: WorkoutExercisePlan[]
): Promise<{ session: DbWorkoutSession; sets: DbWorkoutSet[] }> {
  const supabase = await createClient();
  const db = supabase as any;

  const { data: session, error: sessionErr } = await db
    .from("workout_sessions")
    .insert({
      user_id: userId,
      session_date: sessionDate,
      day_of_week: dayOfWeek,
      focus,
      workout_key: workoutKey,
      travel_mode: travelMode,
      status: "in_progress",
      estimated_duration_minutes: estimatedMinutes,
    })
    .select()
    .single();

  if (sessionErr) throw sessionErr;

  const setRows = exercises.flatMap((ex) =>
    ex.sets.map((s) => ({
      session_id: session.id,
      exercise_slug: s.exerciseSlug,
      exercise_order: s.exerciseOrder,
      set_number: s.setNumber,
      prescribed_reps_min: s.prescribedRepsMin,
      prescribed_reps_max: s.prescribedRepsMax,
      prescribed_weight_lb: s.prescribedWeightLb,
      prescribed_band_lb: s.prescribedBandLb,
      completed: false,
    }))
  );

  const { data: sets, error: setsErr } = await db
    .from("workout_session_sets")
    .insert(setRows)
    .select();

  if (setsErr) throw setsErr;

  return { session, sets: sets ?? [] };
}

export async function getProgressionMap(
  userId: string,
  exerciseSlugs: string[]
): Promise<Record<string, ProgressionRow>> {
  if (exerciseSlugs.length === 0) return {};
  const supabase = await createClient();
  const db = supabase as any;

  const { data } = await db
    .from("workout_progression")
    .select("*")
    .eq("user_id", userId)
    .in("exercise_slug", exerciseSlugs);

  const map: Record<string, ProgressionRow> = {};
  for (const row of data ?? []) {
    map[row.exercise_slug] = row;
  }
  return map;
}

export async function upsertProgression(
  userId: string,
  exerciseSlug: string,
  weightLb: number | null,
  bandLb: number | null,
  repsMin: number | null,
  repsMax: number | null,
  consecutiveSuccesses: number,
  sessionDate: string
): Promise<void> {
  const supabase = await createClient();
  const db = supabase as any;

  await db.from("workout_progression").upsert(
    {
      user_id: userId,
      exercise_slug: exerciseSlug,
      current_weight_lb: weightLb,
      current_band_lb: bandLb,
      target_reps_min: repsMin,
      target_reps_max: repsMax,
      consecutive_successes: consecutiveSuccesses,
      last_session_date: sessionDate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,exercise_slug" }
  );
}

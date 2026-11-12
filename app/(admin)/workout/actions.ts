"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { WorkoutExercisePlan } from "@/lib/workout/engine";
import type { DbWorkoutSession } from "@/services/workout-service";

export async function startWorkoutAction(
  userId: string,
  today: string,
  dayOfWeek: string,
  focus: string,
  workoutKey: string,
  travelMode: boolean,
  estimatedMinutes: number,
  exercises: WorkoutExercisePlan[]
): Promise<{ session: DbWorkoutSession }> {
  const supabase = await createClient();
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const { data: session, error: sessionErr } = await db
    .from("workout_sessions")
    .insert({
      user_id: user.id,
      session_date: today,
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

  // Attach set IDs back to the exercises (mutate the plans in place)
  for (const ex of exercises) {
    for (const set of ex.sets) {
      const dbSet = (sets ?? []).find(
        (s: { exercise_slug: string; set_number: number; id: string }) =>
          s.exercise_slug === set.exerciseSlug && s.set_number === set.setNumber
      );
      if (dbSet) set.setId = dbSet.id;
    }
  }

  return { session };
}

export async function completeSetAction(
  setId: string,
  actualReps: number,
  actualWeightLb: number | null,
  feedback: string | null
): Promise<void> {
  const supabase = await createClient();
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const { error } = await db
    .from("workout_session_sets")
    .update({
      actual_reps: actualReps,
      actual_weight_lb: actualWeightLb,
      feedback,
      completed: true,
      completed_at: new Date().toISOString(),
    })
    .eq("id", setId);

  if (error) throw error;
}

export async function completeSessionAction(sessionId: string): Promise<void> {
  const supabase = await createClient();
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const startedRes = await db
    .from("workout_sessions")
    .select("started_at")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  const startedAt = startedRes.data?.started_at
    ? new Date(startedRes.data.started_at)
    : new Date();
  const actualMinutes = Math.round((Date.now() - startedAt.getTime()) / 60000);

  await db
    .from("workout_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      actual_duration_minutes: actualMinutes,
    })
    .eq("id", sessionId)
    .eq("user_id", user.id);

  revalidatePath("/workout");
}

export async function updateTravelModeAction(
  sessionId: string,
  travelMode: boolean
): Promise<void> {
  const supabase = await createClient();
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  await db
    .from("workout_sessions")
    .update({ travel_mode: travelMode })
    .eq("id", sessionId)
    .eq("user_id", user.id);
}

export async function abandonSessionAction(sessionId: string): Promise<void> {
  const supabase = await createClient();
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  await db
    .from("workout_sessions")
    .update({ status: "abandoned" })
    .eq("id", sessionId)
    .eq("user_id", user.id);

  revalidatePath("/workout");
}

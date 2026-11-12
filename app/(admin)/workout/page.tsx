import { createClient } from "@/lib/supabase/server";
import { getActiveSession, getProgressionMap } from "@/services/workout-service";
import { buildWorkoutPlan } from "@/lib/workout/engine";
import { WorkoutDashboard } from "@/components/workout/WorkoutDashboard";

export default async function WorkoutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().split("T")[0];
  const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

  // Check for an existing session today
  const existing = await getActiveSession(user.id);

  if (existing) {
    // Resume: rebuild the plan matching the session's workout key + travel mode
    const plan = buildWorkoutPlan(dayOfWeek, existing.session.travel_mode, {});

    // Merge DB completion state into plan sets
    if (plan) {
      for (const ex of plan.exercises) {
        for (const set of ex.sets) {
          const dbSet = existing.sets.find(
            (s) => s.exercise_slug === set.exerciseSlug && s.set_number === set.setNumber
          );
          if (dbSet) {
            set.setId = dbSet.id;
            set.completed = dbSet.completed;
            set.completedAt = dbSet.completed_at;
            set.actualReps = dbSet.actual_reps;
            set.actualWeightLb = dbSet.actual_weight_lb;
            set.feedback = dbSet.feedback;
            if (dbSet.prescribed_weight_lb !== null) set.prescribedWeightLb = dbSet.prescribed_weight_lb;
            if (dbSet.prescribed_band_lb !== null) set.prescribedBandLb = dbSet.prescribed_band_lb;
          }
        }
      }
    }

    return (
      <WorkoutDashboard
        initialSession={existing.session}
        initialPlan={plan}
        userId={user.id}
        today={today}
        dayOfWeek={dayOfWeek}
      />
    );
  }

  // No session yet — build the plan preview
  const slugs = collectSlugs(dayOfWeek);
  const progressionMap = await getProgressionMap(user.id, slugs);
  const plan = buildWorkoutPlan(dayOfWeek, false, progressionMap);

  return (
    <WorkoutDashboard
      initialSession={null}
      initialPlan={plan}
      userId={user.id}
      today={today}
      dayOfWeek={dayOfWeek}
      initialProgressionMap={progressionMap}
    />
  );
}

function collectSlugs(dayOfWeek: string): string[] {
  try {
    const strategy = require("@/config/workout-strategy.json");
    const entry = strategy.schedule[dayOfWeek];
    if (!entry) return [];
    const workout = strategy.workouts[entry.workout_key];
    if (!workout) return [];
    return workout.exercises.map((e: { slug: string }) => e.slug);
  } catch {
    return [];
  }
}

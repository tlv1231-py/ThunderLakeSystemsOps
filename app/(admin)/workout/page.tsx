import { createClient } from "@/lib/supabase/server";
import { getActiveSession, getLastCompletedSession, getProgressionMap } from "@/services/workout-service";
import { buildWorkoutPlan, getAllProgramDays } from "@/lib/workout/engine";
import { WorkoutDashboard } from "@/components/workout/WorkoutDashboard";

export default async function WorkoutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().split("T")[0];
  const allDays = getAllProgramDays();

  // Check for an existing session today (resume)
  const existing = await getActiveSession(user.id);

  if (existing) {
    const programDay = existing.session.day_of_week; // stored as "day_1" etc.
    const plan = buildWorkoutPlan(programDay, existing.session.travel_mode, {});

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
        suggestedDay={programDay}
        allDays={allDays}
      />
    );
  }

  // No session — suggest the next day based on last completed
  const lastSession = await getLastCompletedSession(user.id);
  const suggestedDay = computeNextDay(lastSession?.day_of_week ?? null, allDays.length);

  // Fetch progression for all exercises (so the picker can preview any day)
  const allSlugs = collectAllSlugs();
  const progressionMap = await getProgressionMap(user.id, allSlugs);
  const plan = buildWorkoutPlan(suggestedDay, false, progressionMap);

  return (
    <WorkoutDashboard
      initialSession={null}
      initialPlan={plan}
      userId={user.id}
      today={today}
      suggestedDay={suggestedDay}
      allDays={allDays}
      initialProgressionMap={progressionMap}
    />
  );
}

function computeNextDay(lastDayKey: string | null, totalDays: number): string {
  if (!lastDayKey) return "day_1";
  const lastNum = parseInt(lastDayKey.replace("day_", ""), 10);
  if (isNaN(lastNum)) return "day_1";
  const nextNum = (lastNum % totalDays) + 1;
  return `day_${nextNum}`;
}

function collectAllSlugs(): string[] {
  try {
    const strategy = require("@/config/workout-strategy.json");
    const slugs = new Set<string>();
    for (const workout of Object.values(strategy.workouts)) {
      for (const ex of (workout as any).exercises) {
        slugs.add(ex.slug);
      }
    }
    return [...slugs];
  } catch {
    return [];
  }
}

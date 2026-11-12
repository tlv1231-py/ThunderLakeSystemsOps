"use client";

import { Trophy, RotateCcw, TrendingUp } from "lucide-react";
import type { WorkoutPlan } from "@/lib/workout/engine";
import type { DbWorkoutSession } from "@/services/workout-service";
import { MUSCLE_COLORS } from "@/lib/workout/exercises";

interface WorkoutSummaryProps {
  session: DbWorkoutSession;
  plan: WorkoutPlan;
  onStartNew: () => void;
}

export function WorkoutSummary({ session, plan, onStartNew }: WorkoutSummaryProps) {
  const allSets = plan.exercises.flatMap((e) => e.sets);
  const completedSets = allSets.filter((s) => s.completed);
  const totalSets = allSets.length;
  const completionPct = totalSets > 0 ? Math.round((completedSets.length / totalSets) * 100) : 0;

  const startedAt = new Date(session.started_at);
  const completedAt = session.completed_at ? new Date(session.completed_at) : new Date();
  const durationMins = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);

  // Muscle volume estimate
  const muscleSetCounts: Record<string, number> = {};
  for (const ex of plan.exercises) {
    const doneSets = ex.sets.filter((s) => s.completed).length;
    for (const m of ex.primaryMuscles) {
      muscleSetCounts[m] = (muscleSetCounts[m] ?? 0) + doneSets;
    }
    for (const m of ex.secondaryMuscles) {
      muscleSetCounts[m] = (muscleSetCounts[m] ?? 0) + doneSets * 0.5;
    }
  }

  const muscleEntries = Object.entries(muscleSetCounts)
    .filter(([m]) => m !== "cardio")
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Hero */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <Trophy className="w-8 h-8 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-100">Workout Complete</h1>
        <p className="text-zinc-400 mt-1">{plan.focus}</p>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div>
            <p className="text-2xl font-bold text-zinc-100">{durationMins}</p>
            <p className="text-xs text-zinc-500 mt-0.5">minutes</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-100">{completedSets.length}</p>
            <p className="text-xs text-zinc-500 mt-0.5">sets done</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-100">{completionPct}%</p>
            <p className="text-xs text-zinc-500 mt-0.5">completion</p>
          </div>
        </div>
      </div>

      {/* Exercises */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 divide-y divide-zinc-800">
        <div className="px-4 py-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-zinc-500" />
          <p className="text-sm font-medium text-zinc-300">Session breakdown</p>
        </div>
        {plan.exercises.map((ex) => {
          const done = ex.sets.filter((s) => s.completed).length;
          const lastWeight = [...ex.sets].reverse().find((s) => s.actualWeightLb)?.actualWeightLb;
          const lastReps = [...ex.sets].reverse().find((s) => s.actualReps)?.actualReps;
          return (
            <div key={ex.slug} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 truncate">{ex.name}</p>
                <p className="text-xs text-zinc-500">
                  {done}/{ex.sets.length} sets
                  {lastWeight ? ` · ${lastWeight} lb` : ""}
                  {lastReps ? ` · ${lastReps} reps` : ""}
                </p>
              </div>
              <div className={`w-2 h-2 rounded-full ${done === ex.sets.length ? "bg-emerald-500" : done > 0 ? "bg-amber-500" : "bg-zinc-700"}`} />
            </div>
          );
        })}
      </div>

      {/* Muscle volume */}
      {muscleEntries.length > 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Estimated volume by muscle</p>
          <div className="space-y-2">
            {muscleEntries.map(([muscle, sets]) => {
              const maxSets = muscleEntries[0][1];
              const pct = maxSets > 0 ? (sets / maxSets) * 100 : 0;
              return (
                <div key={muscle} className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs border w-24 text-center ${MUSCLE_COLORS[muscle as keyof typeof MUSCLE_COLORS] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
                    {muscle.charAt(0).toUpperCase() + muscle.slice(1)}
                  </span>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500/60 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-500 w-12 text-right">{Math.round(sets)} sets</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-zinc-600 mt-3 italic">
            Volume estimate includes secondary muscle contributions at 0.5× weight.
          </p>
        </div>
      )}

      <button
        onClick={onStartNew}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors text-sm"
      >
        <RotateCcw className="w-4 h-4" />
        Back to workout home
      </button>
    </div>
  );
}

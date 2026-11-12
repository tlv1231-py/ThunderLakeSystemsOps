"use client";

import { useState } from "react";
import { Plane, Play, Dumbbell, Clock, ChevronRight } from "lucide-react";
import { buildWorkoutPlan } from "@/lib/workout/engine";
import type { WorkoutPlan, ProgressionRow } from "@/lib/workout/engine";
import type { DbWorkoutSession } from "@/services/workout-service";
import { MUSCLE_COLORS } from "@/lib/workout/exercises";
import { startWorkoutAction } from "@/app/(admin)/workout/actions";

interface WorkoutStartScreenProps {
  plan: WorkoutPlan | null;
  userId: string;
  today: string;
  dayOfWeek: string;
  progressionMap: Record<string, ProgressionRow>;
  onSessionStarted: (session: DbWorkoutSession, plan: WorkoutPlan) => void;
}

export function WorkoutStartScreen({
  plan,
  userId,
  today,
  dayOfWeek,
  progressionMap,
  onSessionStarted,
}: WorkoutStartScreenProps) {
  const [travelMode, setTravelMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const activePlan = travelMode
    ? buildWorkoutPlan(dayOfWeek, true, progressionMap)
    : plan;

  async function handleStart() {
    if (!activePlan) return;
    setLoading(true);
    try {
      const { session } = await startWorkoutAction(
        userId,
        today,
        dayOfWeek,
        activePlan.focus,
        activePlan.workoutKey,
        travelMode,
        activePlan.estimatedDurationMinutes,
        activePlan.exercises
      );
      onSessionStarted(session, activePlan);
    } catch (e) {
      console.error("Failed to start workout", e);
    } finally {
      setLoading(false);
    }
  }

  if (!activePlan) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">Workout</h1>
        <p className="text-zinc-400">
          {dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)} is a rest day. Enjoy your recovery.
        </p>
      </div>
    );
  }

  const totalSets = activePlan.exercises.reduce((n, e) => n + e.sets.length, 0);
  const muscleGroups = [...new Set(activePlan.exercises.flatMap((e) => e.primaryMuscles))];

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500 uppercase tracking-wider mb-1">
            {dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)}
          </p>
          <h1 className="text-2xl font-bold text-zinc-100">{activePlan.focus}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-zinc-400">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              ~{activePlan.estimatedDurationMinutes} min
            </span>
            <span className="flex items-center gap-1">
              <Dumbbell className="w-4 h-4" />
              {activePlan.exercises.length} exercises · {totalSets} sets
            </span>
          </div>
        </div>

        {/* Travel mode toggle */}
        <button
          onClick={() => setTravelMode((t) => !t)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
            travelMode
              ? "bg-sky-500/20 border-sky-500/40 text-sky-300"
              : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Plane className="w-4 h-4" />
          Travel Mode
        </button>
      </div>

      {travelMode && (
        <div className="bg-sky-500/10 border border-sky-500/20 rounded-lg px-4 py-3 text-sm text-sky-300">
          Bands-only mode — dumbbell exercises replaced with resistance band equivalents.
        </div>
      )}

      {/* Muscle groups */}
      <div className="flex flex-wrap gap-2">
        {muscleGroups.map((m) => (
          <span
            key={m}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${MUSCLE_COLORS[m as keyof typeof MUSCLE_COLORS] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </span>
        ))}
      </div>

      {/* Exercise list */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 divide-y divide-zinc-800">
        {activePlan.exercises.map((ex, i) => (
          <div key={ex.slug} className="flex items-center gap-3 px-4 py-3">
            <span className="text-zinc-600 text-sm w-5 text-right shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-zinc-200 font-medium text-sm truncate">{ex.name}</p>
              <p className="text-zinc-500 text-xs">
                {ex.sets.length} sets
                {ex.isAmrap
                  ? " · AMRAP"
                  : ex.isTimed
                  ? ` · ${ex.sets[0]?.prescribedRepsMin}s`
                  : ex.isCardio
                  ? ""
                  : ` · ${ex.sets[0]?.prescribedRepsMin}${
                      ex.sets[0]?.prescribedRepsMax !== ex.sets[0]?.prescribedRepsMin
                        ? `–${ex.sets[0]?.prescribedRepsMax}`
                        : ""
                    } reps`}
                {ex.sets[0]?.prescribedWeightLb
                  ? ` · ${ex.sets[0].prescribedWeightLb} lb`
                  : ex.sets[0]?.prescribedBandLb
                  ? ` · ${ex.sets[0].prescribedBandLb} lb band`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1 justify-end shrink-0">
              {ex.primaryMuscles.slice(0, 2).map((m) => (
                <span
                  key={m}
                  className={`px-1.5 py-0.5 rounded text-xs border ${MUSCLE_COLORS[m as keyof typeof MUSCLE_COLORS] ?? ""}`}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-zinc-950 font-bold text-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="animate-pulse">Starting…</span>
        ) : (
          <>
            <Play className="w-5 h-5 fill-current" />
            Start Workout
          </>
        )}
      </button>
    </div>
  );
}

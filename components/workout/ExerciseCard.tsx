"use client";

import { useState } from "react";
import { Check, ChevronRight, Timer, SkipForward } from "lucide-react";
import type { WorkoutExercisePlan, WorkoutSetPlan } from "@/lib/workout/engine";
import { MUSCLE_COLORS } from "@/lib/workout/exercises";

interface ExerciseCardProps {
  exercise: WorkoutExercisePlan;
  currentSetIdx: number;
  onSetComplete: (
    set: WorkoutSetPlan,
    actualReps: number,
    actualWeightLb: number | null,
    feedback: string | null
  ) => void;
  restCountdown: number | null;
  onSkipRest: () => void;
  isSaving: boolean;
  nextExercise?: WorkoutExercisePlan;
}

type FeedbackValue = "easy" | "about_right" | "hard" | "couldnt_complete";

const FEEDBACK_OPTIONS: { value: FeedbackValue; label: string; color: string }[] = [
  { value: "easy",           label: "Easy",    color: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30" },
  { value: "about_right",    label: "Right",   color: "bg-blue-500/20 border-blue-500/40 text-blue-300 hover:bg-blue-500/30" },
  { value: "hard",           label: "Hard",    color: "bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30" },
  { value: "couldnt_complete",label: "Failed", color: "bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30" },
];

export function ExerciseCard({
  exercise,
  currentSetIdx,
  onSetComplete,
  restCountdown,
  onSkipRest,
  isSaving,
  nextExercise,
}: ExerciseCardProps) {
  const currentSet = exercise.sets[currentSetIdx];
  const [pendingReps, setPendingReps] = useState<number>(
    currentSet?.prescribedRepsMax ?? currentSet?.prescribedRepsMin ?? 10
  );
  const [pendingWeight, setPendingWeight] = useState<number | null>(
    currentSet?.prescribedWeightLb ?? currentSet?.prescribedBandLb ?? null
  );
  const [awaitingFeedback, setAwaitingFeedback] = useState(false);
  const [capturedReps, setCapturedReps] = useState<number>(0);
  const [capturedWeight, setCapturedWeight] = useState<number | null>(null);

  // Reset input defaults when set changes
  const targetReps = currentSet?.prescribedRepsMax ?? currentSet?.prescribedRepsMin ?? 10;
  const targetWeight = currentSet?.prescribedWeightLb ?? currentSet?.prescribedBandLb ?? null;

  function handleCheckClick() {
    if (awaitingFeedback || restCountdown !== null || isSaving) return;
    // Capture the current input values and show feedback panel
    setCapturedReps(pendingReps);
    setCapturedWeight(pendingWeight);
    setAwaitingFeedback(true);
  }

  function handleFeedback(fb: FeedbackValue) {
    setAwaitingFeedback(false);
    // Reset inputs for next set
    setPendingReps(targetReps);
    setPendingWeight(targetWeight);
    onSetComplete(currentSet, capturedReps, capturedWeight, fb);
  }

  const isBand = currentSet?.prescribedBandLb !== null && currentSet?.prescribedWeightLb === null;
  const isBodyweight = !currentSet?.prescribedWeightLb && !currentSet?.prescribedBandLb;

  return (
    <div className="space-y-4">
      {/* Rest timer overlay */}
      {restCountdown !== null && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 text-center space-y-3">
          <p className="text-zinc-400 text-sm uppercase tracking-wider">Rest</p>
          <p className="text-5xl font-mono font-bold text-zinc-100">{restCountdown}s</p>
          <button
            onClick={onSkipRest}
            className="flex items-center gap-1.5 mx-auto text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <SkipForward className="w-4 h-4" />
            Skip rest
          </button>
        </div>
      )}

      {/* Main exercise card */}
      {restCountdown === null && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          {/* Exercise name + muscles */}
          <div className="px-5 pt-5 pb-4 border-b border-zinc-800">
            <h2 className="text-2xl font-bold text-zinc-100 leading-tight">
              {exercise.name}
              {exercise.isUnilateral && (
                <span className="ml-2 text-sm font-normal text-zinc-500">(each side)</span>
              )}
            </h2>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {exercise.primaryMuscles.map((m) => (
                <span
                  key={m}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium border ${MUSCLE_COLORS[m as keyof typeof MUSCLE_COLORS]}`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </span>
              ))}
              {exercise.secondaryMuscles.map((m) => (
                <span
                  key={m}
                  className="px-2 py-0.5 rounded-full text-xs border border-zinc-700 text-zinc-500"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>

          {/* Sets tracker */}
          <div className="px-5 py-4 border-b border-zinc-800">
            <div className="flex items-center gap-2 flex-wrap">
              {exercise.sets.map((s, si) => {
                const isActive = si === currentSetIdx;
                const isDone = s.completed;
                return (
                  <div
                    key={s.setNumber}
                    className={`flex items-center justify-center w-9 h-9 rounded-full border text-sm font-medium transition-all ${
                      isDone
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                        : isActive
                        ? "bg-zinc-700 border-zinc-500 text-zinc-100 ring-2 ring-emerald-500 ring-offset-2 ring-offset-zinc-900"
                        : "bg-zinc-800/50 border-zinc-700 text-zinc-600"
                    }`}
                  >
                    {isDone ? <Check className="w-4 h-4" /> : s.setNumber}
                  </div>
                );
              })}
              <span className="text-zinc-500 text-sm ml-1">
                Set {currentSetIdx + 1} of {exercise.sets.length}
              </span>
            </div>
          </div>

          {/* Prescription */}
          <div className="px-5 py-4 border-b border-zinc-800">
            <div className="flex items-center gap-6 flex-wrap">
              {/* Reps */}
              {!exercise.isCardio && (
                <div>
                  <p className="text-xs text-zinc-500 mb-1">
                    {exercise.isAmrap ? "Target" : exercise.isTimed ? "Time (s)" : "Reps"}
                  </p>
                  {exercise.isAmrap ? (
                    <p className="text-xl font-bold text-zinc-100">AMRAP</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPendingReps((r) => Math.max(1, r - 1))}
                        className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-lg"
                      >
                        −
                      </button>
                      <span className="text-xl font-bold text-zinc-100 w-8 text-center">{pendingReps}</span>
                      <button
                        onClick={() => setPendingReps((r) => r + 1)}
                        className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-lg"
                      >
                        +
                      </button>
                    </div>
                  )}
                  {!exercise.isAmrap && (
                    <p className="text-xs text-zinc-600 mt-0.5">
                      prescribed: {currentSet.prescribedRepsMin}
                      {currentSet.prescribedRepsMax !== currentSet.prescribedRepsMin
                        ? `–${currentSet.prescribedRepsMax}`
                        : ""}
                    </p>
                  )}
                </div>
              )}

              {/* Weight */}
              {!isBodyweight && !exercise.isCardio && (
                <div>
                  <p className="text-xs text-zinc-500 mb-1">{isBand ? "Band (lb)" : "Weight (lb)"}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPendingWeight((w) => w !== null ? Math.max(0, w - 2.5) : null)}
                      className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-lg"
                    >
                      −
                    </button>
                    <span className="text-xl font-bold text-zinc-100 w-12 text-center">
                      {pendingWeight ?? "BW"}
                    </span>
                    <button
                      onClick={() => setPendingWeight((w) => (w ?? 0) + 2.5)}
                      className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-lg"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* Rest period hint */}
              {exercise.restPeriodSeconds > 0 && (
                <div className="ml-auto text-right">
                  <p className="text-xs text-zinc-500">Rest after set</p>
                  <p className="text-sm text-zinc-400 flex items-center gap-1">
                    <Timer className="w-3.5 h-3.5" />
                    {exercise.restPeriodSeconds}s
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Technique cues */}
          <div className="px-5 py-4 border-b border-zinc-800">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Technique</p>
            <ul className="space-y-1">
              {exercise.techniqueCues.map((cue, i) => (
                <li key={i} className="text-sm text-zinc-400 flex gap-2">
                  <span className="text-zinc-600 shrink-0 mt-0.5">·</span>
                  {cue}
                </li>
              ))}
            </ul>
            {exercise.notes && (
              <p className="mt-2 text-xs text-zinc-500 italic">{exercise.notes}</p>
            )}
          </div>

          {/* Feedback panel (shown after check) */}
          {awaitingFeedback ? (
            <div className="px-5 py-4">
              <p className="text-sm text-zinc-400 mb-3">How did that feel?</p>
              <div className="grid grid-cols-4 gap-2">
                {FEEDBACK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleFeedback(opt.value)}
                    className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${opt.color}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Big check button */
            <div className="px-5 py-5 flex items-center justify-center">
              <button
                onClick={handleCheckClick}
                disabled={isSaving}
                className="w-20 h-20 rounded-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/40"
                aria-label="Complete set"
              >
                <Check className="w-9 h-9 text-zinc-950 stroke-[3]" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Next exercise preview */}
      {nextExercise && restCountdown === null && !awaitingFeedback && (
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 px-4 py-3">
          <p className="text-xs text-zinc-600 uppercase tracking-wider mb-1">Up next</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-400 font-medium">{nextExercise.name}</p>
              <p className="text-xs text-zinc-600 mt-0.5">
                {nextExercise.sets.length} sets
                {nextExercise.sets[0]?.prescribedWeightLb
                  ? ` · ${nextExercise.sets[0].prescribedWeightLb} lb`
                  : nextExercise.sets[0]?.prescribedBandLb
                  ? ` · ${nextExercise.sets[0].prescribedBandLb} lb band`
                  : ""}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-700" />
          </div>
        </div>
      )}
    </div>
  );
}

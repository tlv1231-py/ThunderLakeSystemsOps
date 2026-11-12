"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { buildWorkoutPlan } from "@/lib/workout/engine";
import { estimateRemainingTime } from "@/lib/workout/engine";
import type { WorkoutPlan, WorkoutExercisePlan, WorkoutSetPlan, ProgressionRow } from "@/lib/workout/engine";
import type { DbWorkoutSession } from "@/services/workout-service";
import {
  completeSetAction,
  completeSessionAction,
  updateTravelModeAction,
  startWorkoutAction,
} from "@/app/(admin)/workout/actions";
import { WorkoutHeader } from "./WorkoutHeader";
import { ExerciseCard } from "./ExerciseCard";

interface WorkoutPlayerProps {
  session: DbWorkoutSession;
  plan: WorkoutPlan;
  onComplete: (session: DbWorkoutSession) => void;
  onTravelToggle: (newPlan: WorkoutPlan) => void;
  userId: string;
  today: string;
  dayOfWeek: string;
  progressionMap: Record<string, ProgressionRow>;
}

export function WorkoutPlayer({
  session,
  plan,
  onComplete,
  onTravelToggle,
  userId,
  today,
  dayOfWeek,
  progressionMap,
}: WorkoutPlayerProps) {
  // Local plan state (mutable for travel mode switches)
  const [localPlan, setLocalPlan] = useState<WorkoutPlan>(plan);
  const [travelMode, setTravelMode] = useState(session.travel_mode);

  // Find first incomplete exercise+set
  function findFirstIncomplete(p: WorkoutPlan): { exIdx: number; setIdx: number } {
    for (let ei = 0; ei < p.exercises.length; ei++) {
      for (let si = 0; si < p.exercises[ei].sets.length; si++) {
        if (!p.exercises[ei].sets[si].completed) return { exIdx: ei, setIdx: si };
      }
    }
    return { exIdx: p.exercises.length - 1, setIdx: p.exercises[p.exercises.length - 1].sets.length - 1 };
  }

  const initial = findFirstIncomplete(plan);
  const [currentExIdx, setCurrentExIdx] = useState(initial.exIdx);
  const [currentSetIdx, setCurrentSetIdx] = useState(initial.setIdx);
  const [restCountdown, setRestCountdown] = useState<number | null>(null);
  const [savingSetId, setSavingSetId] = useState<string | null>(null);

  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    };
  }, []);

  function startRestTimer(seconds: number, onDone: () => void) {
    setRestCountdown(seconds);
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    restTimerRef.current = setInterval(() => {
      setRestCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(restTimerRef.current!);
          restTimerRef.current = null;
          setRestCountdown(null);
          onDone();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function skipRest() {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    restTimerRef.current = null;
    setRestCountdown(null);
  }

  function advanceToNext(p: WorkoutPlan, exIdx: number, setIdx: number) {
    const ex = p.exercises[exIdx];
    if (setIdx + 1 < ex.sets.length) {
      // More sets in this exercise
      setCurrentSetIdx(setIdx + 1);
    } else if (exIdx + 1 < p.exercises.length) {
      // Next exercise
      setCurrentExIdx(exIdx + 1);
      setCurrentSetIdx(0);
    } else {
      // Workout complete
      handleComplete();
    }
  }

  async function handleSetComplete(
    set: WorkoutSetPlan,
    actualReps: number,
    actualWeightLb: number | null,
    feedback: string | null
  ) {
    if (!set.setId) return;
    setSavingSetId(set.setId);

    // Optimistic update
    const updatedPlan: WorkoutPlan = {
      ...localPlan,
      exercises: localPlan.exercises.map((ex, ei) =>
        ei !== currentExIdx
          ? ex
          : {
              ...ex,
              sets: ex.sets.map((s, si) =>
                si !== currentSetIdx
                  ? s
                  : { ...s, completed: true, actualReps, actualWeightLb, feedback, completedAt: new Date().toISOString() }
              ),
            }
      ),
    };
    setLocalPlan(updatedPlan);

    try {
      await completeSetAction(set.setId, actualReps, actualWeightLb, feedback);
    } catch (e) {
      console.error("Failed to save set", e);
    } finally {
      setSavingSetId(null);
    }

    const ex = localPlan.exercises[currentExIdx];
    const isLastSetOfExercise = currentSetIdx === ex.sets.length - 1;
    const hasRestPeriod = ex.restPeriodSeconds > 0 && !isLastSetOfExercise;

    if (hasRestPeriod) {
      startRestTimer(ex.restPeriodSeconds, () => {
        advanceToNext(updatedPlan, currentExIdx, currentSetIdx);
      });
    } else {
      advanceToNext(updatedPlan, currentExIdx, currentSetIdx);
    }
  }

  async function handleComplete() {
    try {
      await completeSessionAction(session.id);
      onComplete({ ...session, status: "completed", completed_at: new Date().toISOString() });
    } catch (e) {
      console.error("Failed to complete session", e);
    }
  }

  async function handleTravelToggle() {
    const newTravel = !travelMode;
    setTravelMode(newTravel);

    // Build new plan
    const newPlan = buildWorkoutPlan(dayOfWeek, newTravel, progressionMap);
    if (!newPlan) return;

    // Preserve completion state from current plan
    for (const ex of newPlan.exercises) {
      const existing = localPlan.exercises.find((e) => e.slug === ex.slug);
      if (existing) {
        for (const set of ex.sets) {
          const existingSet = existing.sets.find((s) => s.setNumber === set.setNumber);
          if (existingSet) {
            set.setId = existingSet.setId;
            set.completed = existingSet.completed;
            set.completedAt = existingSet.completedAt;
            set.actualReps = existingSet.actualReps;
            set.actualWeightLb = existingSet.actualWeightLb;
            set.feedback = existingSet.feedback;
          }
        }
      }
    }

    setLocalPlan(newPlan);
    onTravelToggle(newPlan);

    try {
      await updateTravelModeAction(session.id, newTravel);
    } catch (e) {
      console.error("Failed to update travel mode", e);
    }
  }

  const currentEx = localPlan.exercises[currentExIdx];
  const currentSet = currentEx?.sets[currentSetIdx];
  const completedSets = localPlan.exercises.flatMap((e) => e.sets).filter((s) => s.completed).length;
  const totalSets = localPlan.exercises.flatMap((e) => e.sets).length;
  const remainingMins = estimateRemainingTime(localPlan.exercises, currentExIdx, currentSetIdx);

  if (!currentEx || !currentSet) return null;

  return (
    <div className="flex flex-col h-full max-w-3xl">
      <WorkoutHeader
        focus={localPlan.focus}
        currentExercise={currentExIdx + 1}
        totalExercises={localPlan.exercises.length}
        completedSets={completedSets}
        totalSets={totalSets}
        remainingMinutes={remainingMins}
        travelMode={travelMode}
        onTravelToggle={handleTravelToggle}
        sessionStartedAt={session.started_at}
      />

      <div className="flex-1 mt-4">
        <ExerciseCard
          exercise={currentEx}
          currentSetIdx={currentSetIdx}
          onSetComplete={handleSetComplete}
          restCountdown={restCountdown}
          onSkipRest={skipRest}
          isSaving={savingSetId !== null}
          nextExercise={localPlan.exercises[currentExIdx + 1]}
        />
      </div>
    </div>
  );
}

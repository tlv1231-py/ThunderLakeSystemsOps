/**
 * Workout programming engine — pure deterministic logic, no Supabase.
 *
 * Sources:
 * - Progressive overload: Schoenfeld (2010), "The Mechanisms of Muscle Hypertrophy"
 * - Double progression: widely used hypertrophy model (increase reps to top of range, then increase weight)
 * - Rest periods: Schoenfeld et al. (2016), "Longer Interset Rest Periods Enhance Muscle Strength and Hypertrophy"
 * - Rep ranges: American College of Sports Medicine position stand on resistance training
 */

import strategy from "@/config/workout-strategy.json";
import { EXERCISES, getTravelSubstitution } from "./exercises";
import type { ExerciseDef } from "./exercises";

export interface StrategyExercise {
  slug: string;
  sets: number;
  reps_min?: number;
  reps_max?: number;
  amrap?: boolean;
  is_cardio?: boolean;
  is_timed?: boolean;
  starting_weight_lb?: number;
  starting_band_lb?: number;
  notes?: string;
}

export interface ProgressionRow {
  exercise_slug: string;
  current_weight_lb: number | null;
  current_band_lb: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  consecutive_successes: number;
  last_session_date: string | null;
}

export interface WorkoutSetPlan {
  setId?: string;
  exerciseSlug: string;
  exerciseOrder: number;
  setNumber: number;
  prescribedRepsMin: number | null;
  prescribedRepsMax: number | null;
  prescribedWeightLb: number | null;
  prescribedBandLb: number | null;
  isAmrap: boolean;
  isTimed: boolean;
  actualReps: number | null;
  actualWeightLb: number | null;
  feedback: string | null;
  completed: boolean;
  completedAt: string | null;
}

export interface WorkoutExercisePlan {
  slug: string;
  name: string;
  order: number;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  isTravelSafe: boolean;
  isCardio: boolean;
  isTimed: boolean;
  isAmrap: boolean;
  isUnilateral: boolean;
  techniqueCues: string[];
  demoGifUrl?: string;
  restPeriodSeconds: number;
  notes: string;
  sets: WorkoutSetPlan[];
}

export interface WorkoutPlan {
  workoutKey: string;
  focus: string;
  dayOfWeek: string;
  exercises: WorkoutExercisePlan[];
  estimatedDurationMinutes: number;
  travelMode: boolean;
}

const DB_WEIGHTS = strategy.equipment.dumbbells as number[];
const BAND_WEIGHTS = strategy.equipment.bands as number[];

function nextDbWeight(current: number): number {
  const idx = DB_WEIGHTS.indexOf(current);
  if (idx === -1) return DB_WEIGHTS[0];
  return DB_WEIGHTS[Math.min(idx + 1, DB_WEIGHTS.length - 1)];
}

function nextBandWeight(current: number): number {
  const idx = BAND_WEIGHTS.indexOf(current);
  if (idx === -1) return BAND_WEIGHTS[0];
  return BAND_WEIGHTS[Math.min(idx + 1, BAND_WEIGHTS.length - 1)];
}

function getRestPeriod(exerciseDef: ExerciseDef, stratEx: StrategyExercise): number {
  if (stratEx.is_cardio) return 0;
  if (stratEx.is_timed) return strategy.progression.rest_periods_seconds.isolation;
  const reps = stratEx.reps_max ?? 15;
  if (exerciseDef.primaryMuscles.includes("cardio")) return 0;
  if (reps <= 10) return strategy.progression.rest_periods_seconds.compound_heavy;
  if (reps <= 15) return strategy.progression.rest_periods_seconds.compound_volume;
  return strategy.progression.rest_periods_seconds.isolation;
}

export function resolveWeight(
  stratEx: StrategyExercise,
  progression: ProgressionRow | null,
  travelMode: boolean
): { weightLb: number | null; bandLb: number | null } {
  const usesBand = stratEx.starting_band_lb !== undefined;
  if (travelMode && !stratEx.slug.startsWith("band-") && stratEx.starting_band_lb !== undefined) {
    const bandLb = progression?.current_band_lb ?? stratEx.starting_band_lb ?? BAND_WEIGHTS[0];
    return { weightLb: null, bandLb };
  }
  if (usesBand) {
    const bandLb = progression?.current_band_lb ?? stratEx.starting_band_lb ?? BAND_WEIGHTS[0];
    return { weightLb: null, bandLb };
  }
  const weightLb = progression?.current_weight_lb ?? stratEx.starting_weight_lb ?? null;
  return { weightLb, bandLb: null };
}

export function buildWorkoutPlan(
  dayOfWeek: string,
  travelMode: boolean,
  progressionMap: Record<string, ProgressionRow>
): WorkoutPlan | null {
  const scheduleEntry = (strategy.schedule as Record<string, { workout_key: string; focus: string }>)[dayOfWeek];
  if (!scheduleEntry) return null;

  const workoutDef = (strategy.workouts as Record<string, { exercises: StrategyExercise[] }>)[scheduleEntry.workout_key];
  if (!workoutDef) return null;

  const exercises = workoutDef.exercises.map((stratEx, order) => {
    const resolvedSlug = travelMode
      ? (getTravelSubstitution(stratEx.slug)?.slug ?? stratEx.slug)
      : stratEx.slug;

    const ex: ExerciseDef | undefined = EXERCISES[resolvedSlug] ?? EXERCISES[stratEx.slug];
    if (!ex) return null;

    const prog = progressionMap[resolvedSlug] ?? progressionMap[stratEx.slug] ?? null;
    const { weightLb, bandLb } = resolveWeight(stratEx, prog, travelMode);
    const restSecs = getRestPeriod(ex, stratEx);

    const sets: WorkoutSetPlan[] = Array.from({ length: stratEx.sets }, (_, i) => ({
      exerciseSlug: resolvedSlug,
      exerciseOrder: order,
      setNumber: i + 1,
      prescribedRepsMin: stratEx.reps_min ?? null,
      prescribedRepsMax: stratEx.reps_max ?? null,
      prescribedWeightLb: weightLb,
      prescribedBandLb: bandLb,
      isAmrap: stratEx.amrap === true,
      isTimed: stratEx.is_timed === true,
      actualReps: null,
      actualWeightLb: null,
      feedback: null,
      completed: false,
      completedAt: null,
    }));

    return {
      slug: resolvedSlug,
      name: ex.name,
      order,
      primaryMuscles: ex.primaryMuscles as string[],
      secondaryMuscles: ex.secondaryMuscles as string[],
      equipment: ex.equipment as string[],
      isTravelSafe: ex.isTravelSafe,
      isCardio: ex.isCardio === true,
      isTimed: ex.isTimed === true,
      isAmrap: ex.isAmrap === true,
      isUnilateral: ex.isUnilateral === true,
      techniqueCues: ex.techniqueCues,
      demoGifUrl: ex.demoGifUrl,
      restPeriodSeconds: restSecs,
      notes: stratEx.notes ?? "",
      sets,
    } as WorkoutExercisePlan;
  }).filter((e): e is WorkoutExercisePlan => e !== null);

  return {
    workoutKey: scheduleEntry.workout_key,
    focus: scheduleEntry.focus,
    dayOfWeek,
    exercises,
    estimatedDurationMinutes: estimateWorkoutDuration(exercises),
    travelMode,
  };
}

// Average seconds per rep for hypertrophy tempo (2 up / 3 down)
const SECONDS_PER_REP = 5;
// Transition time between exercises (setup, equipment change)
const TRANSITION_SECONDS = 30;

export function estimateWorkoutDuration(exercises: WorkoutExercisePlan[]): number {
  let totalSeconds = 0;
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (ex.isCardio) {
        const mins = set.prescribedRepsMin ?? 20;
        totalSeconds += mins * 60;
      } else if (ex.isTimed) {
        totalSeconds += (set.prescribedRepsMin ?? 60);
      } else {
        const reps = set.isAmrap ? 8 : (set.prescribedRepsMax ?? set.prescribedRepsMin ?? 10);
        totalSeconds += reps * SECONDS_PER_REP;
      }
      // Add rest between sets (last set gets no rest — we'll rest before next exercise)
      if (set.setNumber < ex.sets.length) {
        totalSeconds += ex.restPeriodSeconds;
      }
    }
    totalSeconds += TRANSITION_SECONDS;
  }
  return Math.ceil(totalSeconds / 60);
}

export function estimateRemainingTime(
  exercises: WorkoutExercisePlan[],
  currentExerciseIdx: number,
  currentSetIdx: number
): number {
  let totalSeconds = 0;
  for (let ei = currentExerciseIdx; ei < exercises.length; ei++) {
    const ex = exercises[ei];
    const startSet = ei === currentExerciseIdx ? currentSetIdx : 0;
    for (let si = startSet; si < ex.sets.length; si++) {
      const set = ex.sets[si];
      if (ex.isCardio) {
        const mins = set.prescribedRepsMin ?? 20;
        totalSeconds += mins * 60;
      } else if (ex.isTimed) {
        totalSeconds += (set.prescribedRepsMin ?? 60);
      } else {
        const reps = set.isAmrap ? 8 : (set.prescribedRepsMax ?? set.prescribedRepsMin ?? 10);
        totalSeconds += reps * SECONDS_PER_REP;
      }
      if (si < ex.sets.length - 1) {
        totalSeconds += ex.restPeriodSeconds;
      }
    }
    if (ei < exercises.length - 1) totalSeconds += TRANSITION_SECONDS;
  }
  return Math.ceil(totalSeconds / 60);
}

export interface ProgressionUpdate {
  newWeightLb: number | null;
  newBandLb: number | null;
  newConsecutiveSuccesses: number;
  didProgress: boolean;
}

export function evaluateProgression(
  current: ProgressionRow,
  stratEx: StrategyExercise,
  repsAchieved: number,
  feedback: string | null
): ProgressionUpdate {
  const targetMax = current.target_reps_max ?? stratEx.reps_max ?? 10;
  const succeedThreshold = strategy.progression.increase_weight_after_consecutive_successes;
  const success = repsAchieved >= targetMax && feedback !== "couldnt_complete";
  const newSuccesses = success ? current.consecutive_successes + 1 : 0;
  const shouldProgress = newSuccesses >= succeedThreshold;

  if (!shouldProgress) {
    return {
      newWeightLb: current.current_weight_lb,
      newBandLb: current.current_band_lb,
      newConsecutiveSuccesses: newSuccesses,
      didProgress: false,
    };
  }

  const newWeightLb = current.current_weight_lb !== null
    ? nextDbWeight(current.current_weight_lb)
    : null;
  const newBandLb = current.current_band_lb !== null
    ? nextBandWeight(current.current_band_lb)
    : null;

  return {
    newWeightLb,
    newBandLb,
    newConsecutiveSuccesses: 0,
    didProgress: true,
  };
}

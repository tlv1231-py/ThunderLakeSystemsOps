"use client";

import { useState, useCallback } from "react";
import type { WorkoutPlan } from "@/lib/workout/engine";
import type { DbWorkoutSession, DbWorkoutSet } from "@/services/workout-service";
import type { ProgressionRow } from "@/lib/workout/engine";
import { WorkoutStartScreen } from "./WorkoutStartScreen";
import { WorkoutPlayer } from "./WorkoutPlayer";
import { WorkoutSummary } from "./WorkoutSummary";

interface WorkoutDashboardProps {
  initialSession: DbWorkoutSession | null;
  initialPlan: WorkoutPlan | null;
  userId: string;
  today: string;
  dayOfWeek: string;
  initialProgressionMap?: Record<string, ProgressionRow>;
}

export function WorkoutDashboard({
  initialSession,
  initialPlan,
  userId,
  today,
  dayOfWeek,
  initialProgressionMap = {},
}: WorkoutDashboardProps) {
  const [session, setSession] = useState<DbWorkoutSession | null>(initialSession);
  const [plan, setPlan] = useState<WorkoutPlan | null>(initialPlan);
  const [isDone, setIsDone] = useState(initialSession?.status === "completed");

  const handleSessionStarted = useCallback((newSession: DbWorkoutSession, newPlan: WorkoutPlan) => {
    setSession(newSession);
    setPlan(newPlan);
    setIsDone(false);
  }, []);

  const handleWorkoutComplete = useCallback((completedSession: DbWorkoutSession) => {
    setSession(completedSession);
    setIsDone(true);
  }, []);

  const handleTravelToggle = useCallback((newPlan: WorkoutPlan) => {
    setPlan(newPlan);
  }, []);

  if (isDone && session && plan) {
    return (
      <WorkoutSummary
        session={session}
        plan={plan}
        onStartNew={() => {
          setSession(null);
          setIsDone(false);
        }}
      />
    );
  }

  if (!session) {
    return (
      <WorkoutStartScreen
        plan={plan}
        userId={userId}
        today={today}
        dayOfWeek={dayOfWeek}
        progressionMap={initialProgressionMap}
        onSessionStarted={handleSessionStarted}
      />
    );
  }

  return (
    <WorkoutPlayer
      session={session}
      plan={plan!}
      onComplete={handleWorkoutComplete}
      onTravelToggle={handleTravelToggle}
      userId={userId}
      today={today}
      dayOfWeek={dayOfWeek}
      progressionMap={initialProgressionMap}
    />
  );
}

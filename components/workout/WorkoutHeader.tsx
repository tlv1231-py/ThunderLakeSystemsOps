"use client";

import { useEffect, useState } from "react";
import { Plane, Clock } from "lucide-react";

interface WorkoutHeaderProps {
  focus: string;
  currentExercise: number;
  totalExercises: number;
  completedSets: number;
  totalSets: number;
  remainingMinutes: number;
  travelMode: boolean;
  onTravelToggle: () => void;
  sessionStartedAt: string;
}

export function WorkoutHeader({
  focus,
  currentExercise,
  totalExercises,
  completedSets,
  totalSets,
  remainingMinutes,
  travelMode,
  onTravelToggle,
  sessionStartedAt,
}: WorkoutHeaderProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(sessionStartedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionStartedAt]);

  const elapsedMins = Math.floor(elapsed / 60);
  const elapsedSecs = elapsed % 60;
  const progress = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;

  const eta = new Date(Date.now() + remainingMinutes * 60 * 1000);
  const etaStr = eta.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">{focus}</p>
          <p className="text-sm text-zinc-300 mt-0.5">
            Exercise {currentExercise} of {totalExercises}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Elapsed */}
          <div className="text-right">
            <p className="text-xs text-zinc-500">Elapsed</p>
            <p className="text-sm font-mono text-zinc-300">
              {elapsedMins}:{String(elapsedSecs).padStart(2, "0")}
            </p>
          </div>

          {/* Remaining */}
          <div className="text-right">
            <p className="text-xs text-zinc-500">~Remaining</p>
            <p className="text-sm font-medium text-zinc-200">
              {remainingMinutes} min
            </p>
            <p className="text-xs text-zinc-500">done by {etaStr}</p>
          </div>

          {/* Travel toggle */}
          <button
            onClick={onTravelToggle}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              travelMode
                ? "bg-sky-500/20 border-sky-500/40 text-sky-300"
                : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Plane className="w-3.5 h-3.5" />
            {travelMode ? "Travel" : "Travel"}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-zinc-500">
          <span>{completedSets} sets done</span>
          <span>{totalSets - completedSets} remaining</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

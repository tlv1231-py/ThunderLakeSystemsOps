import { createClient } from "@/lib/supabase/server";
import { StrategyHub } from "@/components/strategy/StrategyHub";
import type { StrategyCard, StrategyTask, StrategyNote, StrategyImage } from "@/components/strategy/StrategyHub";

export default async function StrategyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = supabase as any;

  const [cardsRes, tasksRes, notesRes, imagesRes] = await Promise.all([
    db.from("strategy_cards").select("*").order("created_at", { ascending: false }),
    db.from("strategy_tasks").select("*").order("created_at", { ascending: false }),
    db.from("strategy_notes").select("*").order("updated_at", { ascending: false }),
    db.from("strategy_images").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <StrategyHub
      initialCards={(cardsRes.data ?? []) as StrategyCard[]}
      initialTasks={(tasksRes.data ?? []) as StrategyTask[]}
      initialNotes={(notesRes.data ?? []) as StrategyNote[]}
      initialImages={(imagesRes.data ?? []) as StrategyImage[]}
      userEmail={user?.email ?? ""}
    />
  );
}

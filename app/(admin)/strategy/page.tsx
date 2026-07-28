import { createClient } from "@/lib/supabase/server";
import { StrategyHub } from "@/components/strategy/StrategyHub";
import type {
  StrategyCard, StrategyTask, StrategyNote, StrategyImage,
  StrategyPrefs, StrategyColumn, StrategyReaction, StrategyComment, StrategyMessage,
} from "@/components/strategy/StrategyHub";
import { listTeamMembersAction } from "@/app/actions/team";
import { ADMIN_EMAIL } from "@/lib/constants";

export default async function StrategyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const db = supabase as any;
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [cardsRes, tasksRes, notesRes, imagesRes, prefsRes, colsRes, reactionsRes, commentsRes, allPrefsRes, chatRes] =
    await Promise.all([
      db.from("strategy_cards").select("*").order("created_at", { ascending: false }),
      db.from("strategy_tasks").select("*").order("created_at", { ascending: false }),
      db.from("strategy_notes").select("*").order("updated_at", { ascending: false }),
      db.from("strategy_images").select("*").order("created_at", { ascending: false }),
      db.from("strategy_preferences").select("*").eq("user_id", user!.id).maybeSingle(),
      db.from("strategy_columns").select("*").order("position", { ascending: true }),
      db.from("strategy_reactions").select("id,item_id,reaction,user_id"),
      db.from("strategy_comments").select("id,item_id,item_type,content,author_email,created_at").order("created_at", { ascending: true }),
      db.from("strategy_preferences").select("*"),
      db.from("strategy_chat").select("*").order("created_at", { ascending: true }).limit(300),
    ]);

  const teamMembers = isAdmin ? await listTeamMembersAction().catch(() => []) : [];

  return (
    <StrategyHub
      initialCards={(cardsRes.data ?? []) as StrategyCard[]}
      initialTasks={(tasksRes.data ?? []) as StrategyTask[]}
      initialNotes={(notesRes.data ?? []) as StrategyNote[]}
      initialImages={(imagesRes.data ?? []) as StrategyImage[]}
      initialColumns={(colsRes.data ?? []) as StrategyColumn[]}
      initialReactions={(reactionsRes.data ?? []) as StrategyReaction[]}
      initialComments={(commentsRes.data ?? []) as StrategyComment[]}
      initialPrefs={(prefsRes.data ?? null) as StrategyPrefs | null}
      allPrefs={(allPrefsRes.data ?? []) as StrategyPrefs[]}
      teamMembers={teamMembers}
      userEmail={user?.email ?? ""}
      userId={user?.id ?? ""}
      isAdmin={isAdmin}
      initialMessages={(chatRes.data ?? []) as StrategyMessage[]}
      briefToken={process.env.STRATEGY_BRIEF_TOKEN ?? ""}
    />
  );
}

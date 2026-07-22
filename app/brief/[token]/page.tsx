import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function displayName(email: string) {
  if (!email) return "";
  return email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const S: Record<string, React.CSSProperties> = {
  page:        { fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 820, margin: "40px auto", padding: "0 24px", color: "#111", lineHeight: 1.7, fontSize: 15 },
  h1:          { fontSize: 26, fontWeight: 800, borderBottom: "2px solid #111", paddingBottom: 10, marginBottom: 4 },
  meta:        { color: "#999", fontSize: 12, marginBottom: 40 },
  sectionHead: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#888", marginTop: 52, marginBottom: 14, paddingBottom: 6, borderBottom: "1px solid #e5e7eb" },
  colHead:     { fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#333", marginTop: 28 },
  card:        { borderLeft: "3px solid #ddd", paddingLeft: 12, marginBottom: 14, paddingTop: 4, paddingBottom: 4 },
  cardChosen:  { borderLeft: "3px solid #f59e0b", paddingLeft: 12, marginBottom: 14, paddingTop: 4, paddingBottom: 4 },
  reactions:   { fontSize: 12, color: "#888", marginTop: 2 },
  notes:       { fontSize: 13, color: "#666", marginTop: 4 },
  domainOk:    { fontSize: 13, fontWeight: 600, color: "#16a34a", marginTop: 2 },
  domainNo:    { fontSize: 13, fontWeight: 600, color: "#dc2626", marginTop: 2 },
  comment:     { fontSize: 13, color: "#444", marginTop: 3 },
  addedBy:     { fontSize: 11, color: "#bbb", marginTop: 3 },
  tag:         { fontSize: 11, background: "#f3f4f6", padding: "2px 7px", borderRadius: 4, color: "#555", textTransform: "uppercase", fontWeight: 700, marginLeft: 8, display: "inline-block" },
  task:        { padding: "8px 0", borderBottom: "1px solid #f0f0f0" },
  noteContent: { whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, color: "#444", background: "#f9fafb", padding: "12px 16px", borderRadius: 6, margin: 0 },
  imgGrid:     { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, marginTop: 12 },
  imgCap:      { fontSize: 13, color: "#555", margin: "6px 0 0" },
  footer:      { marginTop: 60, fontSize: 11, color: "#ccc", textAlign: "center", paddingBottom: 40 },
};

export default async function BriefPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!process.env.STRATEGY_BRIEF_TOKEN || token !== process.env.STRATEGY_BRIEF_TOKEN) {
    notFound();
  }

  const db = createAdminClient() as any;

  const [cardsRes, tasksRes, notesRes, imagesRes, colsRes, reactionsRes, commentsRes] = await Promise.all([
    db.from("strategy_cards").select("*").order("position", { ascending: true }),
    db.from("strategy_tasks").select("*").order("position", { ascending: true }),
    db.from("strategy_notes").select("*").order("updated_at", { ascending: false }),
    db.from("strategy_images").select("*").order("created_at", { ascending: true }),
    db.from("strategy_columns").select("*").order("position", { ascending: true }),
    db.from("strategy_reactions").select("*"),
    db.from("strategy_comments").select("*").order("created_at", { ascending: true }),
  ]);

  const cards     = cardsRes.data     ?? [];
  const tasks     = tasksRes.data     ?? [];
  const notes     = notesRes.data     ?? [];
  const images    = imagesRes.data    ?? [];
  const columns   = colsRes.data      ?? [];
  const reactions = reactionsRes.data ?? [];
  const comments  = commentsRes.data  ?? [];

  const imageUrls: Record<string, string> = {};
  await Promise.all(
    images.map(async (img: any) => {
      const { data } = await db.storage.from("strategy-images").createSignedUrl(img.storage_path, 86400);
      if (data?.signedUrl) imageUrls[img.id] = data.signedUrl;
    })
  );

  const now = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  const totalCards = cards.length;
  const totalTasks = tasks.length;

  return (
    <div style={S.page}>
      <h1 style={S.h1}>ThunderLake Systems — Strategy Hub</h1>
      <p style={S.meta}>
        AI brief · {now} · {columns.length} columns · {totalCards} ideas · {totalTasks} tasks · {notes.length} notes · {images.length} images
      </p>

      {/* ── IDEAS BOARD ────────────────────────────────── */}
      <p style={S.sectionHead}>Ideas Board</p>
      {columns.map((col: any) => {
        const colCards = [...cards.filter((c: any) => c.category === col.id)]
          .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return (
          <div key={col.id}>
            <p style={S.colHead}>
              {col.name} <span style={{ fontWeight: 400, color: "#aaa" }}>({colCards.length})</span>
            </p>
            {colCards.length === 0 && <p style={{ color: "#ccc", fontSize: 13 }}>No cards yet</p>}
            {colCards.map((card: any) => {
              const ups   = reactions.filter((r: any) => r.item_id === card.id && r.reaction === "up").length;
              const downs = reactions.filter((r: any) => r.item_id === card.id && r.reaction === "down").length;
              const cardComments = comments.filter((c: any) => c.item_id === card.id && c.item_type === "card");
              const style = { ...(card.is_chosen ? S.cardChosen : S.card), ...(card.color ? { borderLeftColor: card.color } : {}) };
              return (
                <div key={card.id} style={style}>
                  <span style={{ fontWeight: card.is_chosen ? 700 : 400 }}>
                    {card.is_chosen && "★ "}{card.content}
                  </span>
                  {card.status && card.status !== "idea" && (
                    <span style={S.tag}>{card.status}</span>
                  )}
                  {(ups > 0 || downs > 0) && (
                    <div style={S.reactions}>👍 {ups}&nbsp;&nbsp;👎 {downs}</div>
                  )}
                  {card.notes && <div style={S.notes}>Notes: {card.notes}</div>}
                  {card.domain_available === true  && <div style={S.domainOk}>Domain: Available ✓</div>}
                  {card.domain_available === false && <div style={S.domainNo}>Domain: Taken ✗</div>}
                  {cardComments.map((c: any) => (
                    <div key={c.id} style={S.comment}>
                      <strong>{displayName(c.author_email)}:</strong> {c.content}
                    </div>
                  ))}
                  <div style={S.addedBy}>Added by {displayName(card.author_email)}</div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* ── TASKS ────────────────────────────────────── */}
      <p style={S.sectionHead}>Tasks</p>
      {tasks.length === 0 && <p style={{ color: "#ccc", fontSize: 13 }}>No tasks yet</p>}
      {[...tasks].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)).map((task: any) => (
        <div key={task.id} style={S.task}>
          <span style={S.tag}>{task.status.replace("_", " ")}</span>
          <span style={{ fontWeight: 500, marginLeft: 10 }}>{task.title}</span>
          {task.assignee && <span style={{ fontSize: 12, color: "#999", marginLeft: 8 }}>— {task.assignee}</span>}
          {task.description && <div style={{ fontSize: 13, color: "#666", marginTop: 3, marginLeft: 4 }}>{task.description}</div>}
          <span style={{ fontSize: 11, color: "#bbb", marginLeft: 4 }}>Added by {displayName(task.author_email)}</span>
        </div>
      ))}

      {/* ── NOTES ────────────────────────────────────── */}
      <p style={S.sectionHead}>Notes</p>
      {notes.length === 0 && <p style={{ color: "#ccc", fontSize: 13 }}>No notes yet</p>}
      {notes.map((note: any) => (
        <div key={note.id} style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{note.title || "Untitled"}</p>
          {note.updated_by_email && (
            <p style={{ fontSize: 11, color: "#bbb", marginBottom: 8 }}>Last edited by {displayName(note.updated_by_email)}</p>
          )}
          {note.content ? (
            <pre style={S.noteContent}>{note.content}</pre>
          ) : (
            <p style={{ color: "#ccc", fontSize: 13 }}>Empty note</p>
          )}
        </div>
      ))}

      {/* ── MOODBOARD ────────────────────────────────── */}
      <p style={S.sectionHead}>Moodboard</p>
      {images.length === 0 && <p style={{ color: "#ccc", fontSize: 13 }}>No images yet</p>}
      <div style={S.imgGrid}>
        {images.map((img: any) => (
          <div key={img.id}>
            {imageUrls[img.id] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrls[img.id]} alt={img.caption || ""} style={{ width: "100%", borderRadius: 8, display: "block" }} />
            )}
            {img.caption && <p style={S.imgCap}>{img.caption}</p>}
            <p style={S.addedBy}>Added by {displayName(img.author_email)}</p>
          </div>
        ))}
      </div>

      <p style={S.footer}>ThunderLake Systems · Strategy Hub AI Brief · {now}</p>
    </div>
  );
}

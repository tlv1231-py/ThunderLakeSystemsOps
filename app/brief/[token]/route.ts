import { createAdminClient } from "@/lib/supabase/admin";

// force-dynamic so the token check always runs server-side;
// Cache-Control lets Vercel's edge cache the response 5 min so DB isn't hit on every view
export const dynamic = "force-dynamic";

function esc(s: string) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function displayName(email: string) {
  if (!email) return "";
  return email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!process.env.STRATEGY_BRIEF_TOKEN || token !== process.env.STRATEGY_BRIEF_TOKEN) {
    return new Response("Not found", { status: 404 });
  }

  const db = createAdminClient() as any;

  const [cardsRes, tasksRes, notesRes, imagesRes, colsRes, reactionsRes, commentsRes] = await Promise.all([
    db.from("strategy_cards").select("id,content,position,category,color,is_chosen,status,notes,domain_available,author_email,created_at").order("position", { ascending: true }),
    db.from("strategy_tasks").select("id,title,status,assignee,description,author_email,position").order("position", { ascending: true }),
    db.from("strategy_notes").select("id,title,content,updated_at,updated_by_email").order("updated_at", { ascending: false }),
    db.from("strategy_images").select("id,storage_path,caption,author_email,created_at").order("created_at", { ascending: true }),
    db.from("strategy_columns").select("id,name,position").order("position", { ascending: true }),
    db.from("strategy_reactions").select("item_id,reaction"),
    db.from("strategy_comments").select("id,item_id,item_type,content,author_email,created_at").order("created_at", { ascending: true }),
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

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;max-width:820px;margin:40px auto;padding:0 24px 60px;color:#111;line-height:1.7;font-size:15px}
    h1{font-size:26px;font-weight:800;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:4px}
    .meta{color:#999;font-size:12px;margin-bottom:40px}
    .section{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-top:52px;margin-bottom:14px;padding-bottom:6px;border-bottom:1px solid #e5e7eb}
    .col-head{font-size:16px;font-weight:700;color:#333;margin-top:28px;margin-bottom:8px}
    .col-count{font-weight:400;color:#aaa}
    .card{border-left:3px solid #ddd;padding:4px 0 4px 12px;margin-bottom:14px}
    .card-title{font-weight:400}
    .card-title.chosen{font-weight:700}
    .tag{font-size:11px;background:#f3f4f6;padding:2px 7px;border-radius:4px;color:#555;text-transform:uppercase;font-weight:700;margin-left:8px}
    .reactions{font-size:12px;color:#888;margin-top:2px}
    .notes{font-size:13px;color:#666;margin-top:4px}
    .domain-ok{font-size:13px;font-weight:600;color:#16a34a;margin-top:2px}
    .domain-no{font-size:13px;font-weight:600;color:#dc2626;margin-top:2px}
    .comment{font-size:13px;color:#444;margin-top:3px}
    .added-by{font-size:11px;color:#bbb;margin-top:3px}
    .task{padding:8px 0;border-bottom:1px solid #f0f0f0}
    .note-title{font-size:16px;font-weight:700;margin-bottom:4px;margin-top:28px}
    .note-body{white-space:pre-wrap;font-family:inherit;font-size:13px;color:#444;background:#f9fafb;padding:12px 16px;border-radius:6px;margin-top:8px}
    .img-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:12px}
    .img-grid img{width:100%;border-radius:8px;display:block}
    .img-cap{font-size:13px;color:#555;margin-top:6px}
    .empty{color:#ccc;font-size:13px}
    .footer{margin-top:60px;font-size:11px;color:#ccc;text-align:center}
  `;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ThunderLake Strategy Hub — AI Brief</title>
<style>${css}</style>
</head>
<body>
<h1>ThunderLake Systems — Strategy Hub</h1>
<p class="meta">AI brief · ${esc(now)} · ${columns.length} columns · ${cards.length} ideas · ${tasks.length} tasks · ${notes.length} notes · ${images.length} images</p>
`;

  // ── IDEAS BOARD
  html += `<p class="section">Ideas Board</p>\n`;
  for (const col of columns) {
    const colCards = [...cards.filter((c: any) => c.category === col.id)]
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    html += `<p class="col-head">${esc(col.name)} <span class="col-count">(${colCards.length})</span></p>\n`;
    if (colCards.length === 0) { html += `<p class="empty">No cards yet</p>\n`; continue; }
    for (const card of colCards) {
      const ups   = reactions.filter((r: any) => r.item_id === card.id && r.reaction === "up").length;
      const downs = reactions.filter((r: any) => r.item_id === card.id && r.reaction === "down").length;
      const cardComments = comments.filter((c: any) => c.item_id === card.id && c.item_type === "card");
      const borderColor = card.color ? ` style="border-left-color:${esc(card.color)}"` : "";
      html += `<div class="card"${borderColor}>\n`;
      html += `<span class="card-title${card.is_chosen ? " chosen" : ""}">${card.is_chosen ? "★ " : ""}${esc(card.content)}</span>`;
      if (card.status && card.status !== "idea") html += `<span class="tag">${esc(card.status)}</span>`;
      html += `\n`;
      if (ups > 0 || downs > 0) html += `<div class="reactions">👍 ${ups}&nbsp;&nbsp;👎 ${downs}</div>\n`;
      if (card.notes) html += `<div class="notes">Notes: ${esc(card.notes)}</div>\n`;
      if (card.domain_available === true)  html += `<div class="domain-ok">Domain: Available ✓</div>\n`;
      if (card.domain_available === false) html += `<div class="domain-no">Domain: Taken ✗</div>\n`;
      for (const c of cardComments) html += `<div class="comment"><strong>${esc(displayName(c.author_email))}:</strong> ${esc(c.content)}</div>\n`;
      html += `<div class="added-by">Added by ${esc(displayName(card.author_email))}</div>\n`;
      html += `</div>\n`;
    }
  }

  // ── TASKS
  html += `<p class="section">Tasks</p>\n`;
  if (tasks.length === 0) { html += `<p class="empty">No tasks yet</p>\n`; }
  for (const task of [...tasks].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))) {
    html += `<div class="task"><span class="tag">${esc(task.status.replace("_", " "))}</span> <strong>${esc(task.title)}</strong>`;
    if (task.assignee) html += ` <span style="font-size:12px;color:#999">— ${esc(task.assignee)}</span>`;
    if (task.description) html += `<br><span style="font-size:13px;color:#666">${esc(task.description)}</span>`;
    html += `<div class="added-by">Added by ${esc(displayName(task.author_email))}</div></div>\n`;
  }

  // ── NOTES
  html += `<p class="section">Notes</p>\n`;
  if (notes.length === 0) { html += `<p class="empty">No notes yet</p>\n`; }
  for (const note of notes) {
    html += `<p class="note-title">${esc(note.title || "Untitled")}</p>\n`;
    if (note.updated_by_email) html += `<div class="added-by">Last edited by ${esc(displayName(note.updated_by_email))}</div>\n`;
    if (note.content) html += `<pre class="note-body">${esc(note.content)}</pre>\n`;
    else html += `<p class="empty">Empty note</p>\n`;
  }

  // ── MOODBOARD
  html += `<p class="section">Moodboard</p>\n`;
  if (images.length === 0) { html += `<p class="empty">No images yet</p>\n`; }
  else {
    html += `<div class="img-grid">\n`;
    for (const img of images) {
      html += `<div>`;
      if (imageUrls[img.id]) html += `<img src="${esc(imageUrls[img.id])}" alt="${esc(img.caption || "")}">`;
      if (img.caption) html += `<p class="img-cap">${esc(img.caption)}</p>`;
      html += `<div class="added-by">Added by ${esc(displayName(img.author_email))}</div>`;
      html += `</div>\n`;
    }
    html += `</div>\n`;
  }

  html += `<p class="footer">ThunderLake Systems · Strategy Hub AI Brief · ${esc(now)}</p>\n</body>\n</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}

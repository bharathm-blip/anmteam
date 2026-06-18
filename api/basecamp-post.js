// ─────────────────────────────────────────────────────────────────────────────
// /api/basecamp-post — posts an event into Basecamp 4 and @mentions specific people.
// Uses auto-refreshing token store (falls back to BASECAMP_ACCESS_TOKEN env).
//
// Body: { title, body, mentionIds: ["49887210", ...] }
//
// Env vars: BASECAMP_ACCOUNT_ID, BASECAMP_PROJECT_ID, BASECAMP_MESSAGE_BOARD_ID,
//           SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (for token store),
//           plus BASECAMP_CLIENT_ID/SECRET for refresh.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { getFreshBasecampToken } from "./_basecamp-token.js";

const UA = "ANM Portal (tax@anmoffice.in)";

function mentionTags(ids) {
  if (!ids || !ids.length) return "";
  return ids.filter(Boolean).map(id =>
    `<bc-attachment content-type="application/vnd.basecamp.mention" data-person-id="${id}"></bc-attachment>`
  ).join(" ");
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const accountId = process.env.BASECAMP_ACCOUNT_ID;
  const projectId = process.env.BASECAMP_PROJECT_ID;
  const boardId = process.env.BASECAMP_MESSAGE_BOARD_ID;
  if (!accountId || !projectId || !boardId) {
    return res.status(200).json({ skipped: true, reason: "Basecamp not fully configured" });
  }

  const { title, body, mentionIds } = req.body || {};
  if (!title) return res.status(400).json({ error: "Missing title" });

  // Get a token (auto-refresh if Supabase + token store available; else env)
  let token;
  try {
    const url = process.env.SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && serviceKey) {
      const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
      token = await getFreshBasecampToken(admin);
    } else {
      token = process.env.BASECAMP_ACCESS_TOKEN;
    }
  } catch (e) {
    token = process.env.BASECAMP_ACCESS_TOKEN;
  }
  if (!token) return res.status(200).json({ skipped: true, reason: "No Basecamp token" });

  const mentions = mentionTags(mentionIds);
  const content = `<div>${body ? `${escapeHtml(body)}<br>` : ""}${mentions ? `<br>${mentions}` : ""}</div>`;

  try {
    const r = await fetch(`https://3.basecampapi.com/${accountId}/buckets/${projectId}/message_boards/${boardId}/messages.json`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ subject: title, content, status: "active" }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return res.status(200).json({ success: true, id: data.id, mentioned: (mentionIds || []).length });
    return res.status(400).json({ error: (data && data.error) || "Basecamp post failed", detail: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

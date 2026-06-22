// ─────────────────────────────────────────────────────────────────────────────
// /api/announce — send a bulk announcement (holiday, event, notice) to all active
// staff as an in-app notification, and optionally post it to Basecamp.
// Admin/HR only.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { getFreshBasecampToken } from "./_basecamp-token.js";

const UA = "ANM Portal (tax@anmoffice.in)";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: "Supabase not configured." });

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { callerToken, title, message, alsoBasecamp } = req.body || {};
  if (!callerToken) return res.status(401).json({ error: "Missing session." });
  if (!message || !message.trim()) return res.status(400).json({ error: "Message is required." });

  const { data: caller } = await admin.auth.getUser(callerToken);
  if (!caller?.user) return res.status(401).json({ error: "Invalid session." });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", caller.user.id).single();
  if (!["admin", "hr"].includes(prof?.role)) return res.status(403).json({ error: "Only Admin/Management can send announcements." });

  // Step 1 - in-app notifications to all active users
  const { data: people } = await admin.from("profiles").select("id, basecamp_person_id, active");
  const active = (people || []).filter((p) => p.active !== false);
  const fullMsg = title ? `📢 ${title}\n${message}` : `📢 ${message}`;
  if (active.length) {
    const rows = active.map((p) => ({ user_id: p.id, type: "announcement", message: fullMsg }));
    await admin.from("notifications").insert(rows);
  }

  // Step 2 - optional Basecamp post, mentions everyone with a basecamp id
  let basecamp = { posted: false };
  if (alsoBasecamp) {
    const accountId = process.env.BASECAMP_ACCOUNT_ID, projectId = process.env.BASECAMP_PROJECT_ID, boardId = process.env.BASECAMP_MESSAGE_BOARD_ID;
    if (accountId && projectId && boardId) {
      try {
        let token;
        try { token = await getFreshBasecampToken(admin); } catch { token = process.env.BASECAMP_ACCESS_TOKEN; }
        if (token) {
          const ids = active.map((p) => p.basecamp_person_id).filter(Boolean);
          const mentions = ids.map((id) => `<bc-attachment content-type="application/vnd.basecamp.mention" data-person-id="${id}"></bc-attachment>`).join(" ");
          const html = `<div>${String(message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}${mentions ? `<br><br>${mentions}` : ""}</div>`;
          const r = await fetch(`https://3.basecampapi.com/${accountId}/buckets/${projectId}/message_boards/${boardId}/messages.json`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": UA },
            body: JSON.stringify({ subject: `📢 ${title || "Announcement"}`, content: html, status: "active" }),
          });
          basecamp = { posted: r.ok };
        }
      } catch (e) { basecamp = { posted: false, error: e.message }; }
    }
  }

  return res.status(200).json({ success: true, notified: active.length, basecamp });
}

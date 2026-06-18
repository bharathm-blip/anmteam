// ─────────────────────────────────────────────────────────────────────────────
// /api/basecamp-test — posts a test message to Basecamp and returns a detailed
// diagnosis (which env vars are missing, token status, Basecamp's exact reply).
// Admin/HR only.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { getFreshBasecampToken } from "./_basecamp-token.js";

const UA = "ANM Portal (tax@anmoffice.in)";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supaUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !serviceKey) return res.status(500).json({ ok: false, stage: "server", error: "Supabase not configured." });

  const admin = createClient(supaUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Auth: admin/hr only
  const { callerToken } = req.body || {};
  if (!callerToken) return res.status(401).json({ ok: false, stage: "auth", error: "Missing session." });
  const { data: caller } = await admin.auth.getUser(callerToken);
  if (!caller?.user) return res.status(401).json({ ok: false, stage: "auth", error: "Invalid session." });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", caller.user.id).single();
  if (!["admin", "hr"].includes(prof?.role)) return res.status(403).json({ ok: false, stage: "auth", error: "Admin/Management only." });

  // Step 1 - Check env vars
  const accountId = process.env.BASECAMP_ACCOUNT_ID;
  const projectId = process.env.BASECAMP_PROJECT_ID;
  const boardId = process.env.BASECAMP_MESSAGE_BOARD_ID;
  const missing = [];
  if (!accountId) missing.push("BASECAMP_ACCOUNT_ID");
  if (!projectId) missing.push("BASECAMP_PROJECT_ID");
  if (!boardId) missing.push("BASECAMP_MESSAGE_BOARD_ID");
  if (missing.length) {
    return res.status(200).json({ ok: false, stage: "env", error: "Missing Vercel environment variables: " + missing.join(", "), hint: "Add them in Vercel → Settings → Environment Variables, then redeploy." });
  }

  // Step 2 - Get a token
  let token, tokenSource = "store";
  try {
    token = await getFreshBasecampToken(admin);
  } catch (e) {
    token = process.env.BASECAMP_ACCESS_TOKEN; tokenSource = "env";
  }
  if (!token) {
    return res.status(200).json({ ok: false, stage: "token", error: "No Basecamp token found.", hint: "Re-run the /api/basecamp-connect step to store a token." });
  }

  // Step 3 - Verify token works
  try {
    const who = await fetch("https://launchpad.37signals.com/authorization.json", {
      headers: { "Authorization": `Bearer ${token}`, "User-Agent": UA },
    });
    if (!who.ok) {
      const d = await who.json().catch(() => ({}));
      return res.status(200).json({ ok: false, stage: "token", error: "Token rejected by Basecamp — expired or invalid.", detail: d, hint: "Re-run /api/basecamp-connect to refresh." });
    }
  } catch (e) {
    return res.status(200).json({ ok: false, stage: "token", error: "Could not reach Basecamp: " + e.message });
  }

  // Step 4 - Try to post a test message to the board
  try {
    const r = await fetch(`https://3.basecampapi.com/${accountId}/buckets/${projectId}/message_boards/${boardId}/messages.json`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ subject: "✅ ANM Portal test message", content: "<div>This is a test from the ANM Portal. If you can see this in Basecamp, the connection works.</div>", status: "active" }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      return res.status(200).json({ ok: true, stage: "done", message: "Test message posted! Check your Basecamp message board.", tokenSource, postId: data.id });
    }
    // Common: 404 wrong project/board id, 403 no access to project
    return res.status(200).json({
      ok: false, stage: "post",
      httpStatus: r.status,
      error: r.status === 404 ? "Basecamp returned 404 — the PROJECT_ID or MESSAGE_BOARD_ID is wrong, or the connected account cannot see that project."
           : r.status === 403 ? "Basecamp returned 403 — the connected user does not have access to that project/board."
           : "Basecamp rejected the post.",
      detail: data,
      hint: "Double-check BASECAMP_PROJECT_ID and BASECAMP_MESSAGE_BOARD_ID from the project URLs, and that the authorizing user is a member of that project.",
    });
  } catch (e) {
    return res.status(200).json({ ok: false, stage: "post", error: e.message });
  }
}

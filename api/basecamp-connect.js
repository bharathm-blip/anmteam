// ─────────────────────────────────────────────────────────────────────────────
// /api/basecamp-connect?code=XXXX
// One-time: exchanges the OAuth authorization code for access + refresh tokens
// and stores them in `integration_tokens`. After this, tokens auto-refresh and
// you never need to touch BASECAMP_ACCESS_TOKEN again.
//
// Visit in browser after authorizing:
//   https://portal.anmoffice.in/api/basecamp-connect?code=THE_CODE
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//           BASECAMP_CLIENT_ID, BASECAMP_CLIENT_SECRET, and the redirect URI
//           must match the one registered (uses BASECAMP_REDIRECT_URI or default).
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const code = req.query.code;
  res.setHeader("Content-Type", "text/html");

  const clientId = process.env.BASECAMP_CLIENT_ID;
  const clientSecret = process.env.BASECAMP_CLIENT_SECRET;
  const redirect = process.env.BASECAMP_REDIRECT_URI || "https://portal.anmoffice.in/api/basecamp-callback";
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const page = (ok, msg) => `<!doctype html><html><head><meta charset="utf-8"><title>Basecamp Connect</title>
    <style>body{font-family:system-ui,Arial,sans-serif;background:#1A2240;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:20px}
    .c{background:#fff;color:#1C1A16;border-radius:16px;padding:32px;max-width:560px;box-shadow:0 20px 60px #00000044}
    h2{margin:0 0 10px;color:${ok ? "#1A7F5A" : "#C0392B"}}</style></head>
    <body><div class="c"><h2>${ok ? "✅ Basecamp connected" : "⚠️ Connection problem"}</h2><p>${msg}</p></div></body></html>`;

  if (!code) return res.status(400).send(page(false, "No authorization code in the URL. Start from the authorization link in the setup guide."));
  if (!clientId || !clientSecret) return res.status(500).send(page(false, "Server missing BASECAMP_CLIENT_ID / BASECAMP_CLIENT_SECRET."));
  if (!url || !serviceKey) return res.status(500).send(page(false, "Server missing Supabase configuration."));

  try {
    const tokenUrl = `https://launchpad.37signals.com/authorization/token?type=web_server&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&client_secret=${encodeURIComponent(clientSecret)}&code=${encodeURIComponent(code)}`;
    const r = await fetch(tokenUrl, { method: "POST", headers: { "User-Agent": "ANM Portal (tax@anmoffice.in)" } });
    const data = await r.json();
    if (!r.ok || !data.access_token) return res.status(400).send(page(false, "Token exchange failed: " + (data.error || JSON.stringify(data))));

    const expiresInSec = data.expires_in || 1209600;
    const expiry = new Date(Date.now() + expiresInSec * 1000).toISOString();
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // Upsert the single basecamp row
    await admin.from("integration_tokens").upsert({
      provider: "basecamp",
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_at: expiry,
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider" });

    return res.status(200).send(page(true, "Tokens stored securely. The portal will now auto-refresh access and post to Basecamp. You can close this page."));
  } catch (e) {
    return res.status(500).send(page(false, "Error: " + e.message));
  }
}

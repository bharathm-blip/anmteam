// ─────────────────────────────────────────────────────────────────────────────
// /api/basecamp-callback
// Landing page for the Basecamp OAuth redirect. Shows the `code` so you can
// copy it for the one-time token exchange (Step 2 of SETUP-BASECAMP.md).
// ─────────────────────────────────────────────────────────────────────────────
export default function handler(req, res) {
  const code = req.query.code || "";
  res.setHeader("Content-Type", "text/html");
  res.status(200).send(`<!doctype html><html><head><meta charset="utf-8">
    <title>Basecamp Authorization</title>
    <style>body{font-family:system-ui,Arial,sans-serif;background:#1A2240;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:20px}
    .card{background:#fff;color:#1C1A16;border-radius:16px;padding:32px;max-width:560px;box-shadow:0 20px 60px #00000044}
    code{display:block;background:#F5F4F0;padding:14px;border-radius:8px;margin:14px 0;word-break:break-all;font-size:14px;border:1px solid #E2DDD4}
    h2{margin:0 0 8px}</style></head>
    <body><div class="card">
    <h2>${code ? "✅ Authorization code received" : "⚠️ No code found"}</h2>
    ${code ? `<p>Copy this code and use it in Step 2 of the Basecamp setup guide to get your access token:</p><code>${code}</code><p style="font-size:13px;color:#7A7060">This code is single-use and expires in ~10 minutes. Exchange it for a token now.</p>` : `<p>Open the authorization URL from the setup guide first.</p>`}
    </div></body></html>`);
}

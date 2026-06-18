# Connecting ANM Portal to Basecamp 4

This posts every attendance punch, leave application, and expense claim into a
Basecamp project as a live activity feed. Staff still submit in the portal;
Basecamp becomes the shared "what's happening" board.

There are two parts:
- **Part A** — pin the portal as a link inside Basecamp (2 minutes, no code)
- **Part B** — connect the API so events post automatically (~30 minutes, one-time)

═══════════════════════════════════════════════════════════════════════════════
PART A — Pin the portal link in Basecamp (do this now)
═══════════════════════════════════════════════════════════════════════════════

1. Open Basecamp → go to the project where your team works (or make a new
   project called "Attendance & HR").
2. On the project page, find the **"Doors"** / card area, or use the message
   board.
3. Easiest: click the **+** (or "Add a tool / link") → choose to add a link →
   paste your portal URL (e.g. https://portal.anmoffice.in) → name it
   "ANM Portal — Punch In / Leave / Claims".
   - Alternatively pin a message on the Message Board titled "ANM Portal" with
     the link in the body, and "Pin" it to the top.
4. Done — your team taps it to jump straight to the portal.

═══════════════════════════════════════════════════════════════════════════════
PART B — Auto-post events into Basecamp (one-time API setup)
═══════════════════════════════════════════════════════════════════════════════

Basecamp 4 uses OAuth 2. You'll register an app, authorize it once, get a token,
and paste a few IDs into Vercel. Follow carefully — copy each value somewhere safe.

────────────────────────────────────────────────────────────────────────────
STEP 1 — Register a Basecamp integration app
────────────────────────────────────────────────────────────────────────────
1. Go to **https://launchpad.37signals.com/integrations** (sign in with the
   Basecamp account that owns your office workspace).
2. Click **Register one now** / **Register a new application**.
3. Fill in:
   - **Name:** ANM Portal
   - **Company / Website:** https://portal.anmoffice.in (or anmoffice.in)
   - **Products:** tick **Basecamp 4**
   - **Redirect URI:** `https://portal.anmoffice.in/api/basecamp-callback`
     (if you don't have the custom domain yet, use your vercel URL +
      `/api/basecamp-callback`)
4. Save. You'll get a **Client ID** and **Client Secret**. Copy both.

────────────────────────────────────────────────────────────────────────────
STEP 2 — Authorize the app (get the access token)
────────────────────────────────────────────────────────────────────────────
This is a one-time browser dance. The simplest manual way:

1. In your browser, visit this URL (replace YOUR_CLIENT_ID and the redirect):
   ```
   https://launchpad.37signals.com/authorization/new?type=web_server&client_id=YOUR_CLIENT_ID&redirect_uri=https://portal.anmoffice.in/api/basecamp-callback
   ```
2. Click **Yes, I'll allow access**. Basecamp redirects to your redirect URI with
   `?code=XXXXX` in the address bar. **Copy that code** (the XXXXX part).
3. Exchange the code for a token. In a terminal run (replace the 3 values):
   ```
   curl -s -X POST "https://launchpad.37signals.com/authorization/token?type=web_server&client_id=YOUR_CLIENT_ID&redirect_uri=https://portal.anmoffice.in/api/basecamp-callback&client_secret=YOUR_CLIENT_SECRET&code=XXXXX"
   ```
4. The response contains `"access_token":"..."`. **Copy the access_token.**
   (Tokens expire; for a small office the simplest path is to re-run this when
    it stops working, or later add auto-refresh. We can automate refresh if you
    want — ask me.)

────────────────────────────────────────────────────────────────────────────
STEP 3 — Find your Account ID, Project ID, and Chat/Board ID
────────────────────────────────────────────────────────────────────────────
1. **Account ID:** open Basecamp in your browser. The URL looks like
   `https://3.basecamp.com/4567890/...` → **4567890** is your account id.

2. **Project (bucket) ID:** open the project you want events posted to. URL looks
   like `https://3.basecamp.com/4567890/projects/87654321` → **87654321** is the
   project id.

3. **Where to post — pick ONE:**
   - **Campfire chat (recommended for a feed):** in that project open the
     "Campfire" chat. URL: `.../buckets/87654321/chats/99999999` → chat id is
     **99999999**.
   - **Message board:** open the Message Board. URL:
     `.../buckets/87654321/message_boards/55555555` → board id is **55555555**.

   (If a URL doesn't show the id, append `.json` to the project API URL, or just
    ask me and I'll help you find it.)

────────────────────────────────────────────────────────────────────────────
STEP 4 — Add the values to Vercel
────────────────────────────────────────────────────────────────────────────
Vercel → your project → **Settings → Environment Variables** → add:

| Name | Value |
|---|---|
| `BASECAMP_ACCESS_TOKEN`     | the access_token from Step 2 |
| `BASECAMP_ACCOUNT_ID`       | account id from Step 3 (e.g. 4567890) |
| `BASECAMP_PROJECT_ID`       | project id from Step 3 (e.g. 87654321) |
| `BASECAMP_CHAT_ID`          | campfire chat id (if using chat) |
| `BASECAMP_MESSAGE_BOARD_ID` | message board id (if using the board instead) |

You only need CHAT_ID **or** MESSAGE_BOARD_ID. If both are set, the portal posts
to the Campfire chat.

Then **Redeploy** so the variables take effect.

────────────────────────────────────────────────────────────────────────────
STEP 5 — Test
────────────────────────────────────────────────────────────────────────────
1. In the portal, punch attendance (or apply for leave).
2. Open the Basecamp project's Campfire/Message Board → you should see a new line:
   "🕐 Bharath M punched IN at 10:04".
3. If nothing appears, check Vercel → your deployment → Functions logs for
   `/api/basecamp-post` to see the error (usually a wrong id or expired token).

════════════════════════════════════════════════════════════════════════════════
NOTES & LIMITATIONS
════════════════════════════════════════════════════════════════════════════════
- This is **one-way**: portal → Basecamp. Staff cannot submit from inside
  Basecamp (Basecamp has no way to host custom forms — see our earlier note).
- If the token expires and posts stop, re-run Step 2 to get a fresh token, or
  ask me to add automatic token refresh (uses the refresh_token).
- If Basecamp env vars are NOT set, the portal simply skips posting — nothing
  breaks. So you can deploy now and add Basecamp later.
- Want only a daily summary in Basecamp instead of every event? The daily-summary
  function can post there too — ask me to point it at Basecamp.

# Connecting ANM Portal to Basecamp — Notification Routing

This sets up **targeted Basecamp notifications** that follow your approval flow:

- **Leave / Reimbursement applied** → the **Pool Lead** is @mentioned in Basecamp
- **Recommended by the Lead** → **Admin + HR + Management** are @mentioned
- **Approved / Rejected** → the **staff member** is @mentioned
- **Daily summary + leave status** → posted each evening, @mentioning Management/HR/Admin

Staff submit and approve **in the portal**; Basecamp delivers the notifications.
Notifications work for every Basecamp user — no premium plan needed for @mentions.

═══════════════════════════════════════════════════════════════════════════════
OVERVIEW OF WHAT YOU'LL DO (≈45 min, one-time)
═══════════════════════════════════════════════════════════════════════════════
A. Run one SQL script (adds a Basecamp-ID field to each employee)
B. Create a Basecamp project + message board for notifications
C. Register a Basecamp integration app and get an access token
D. Pull everyone's Basecamp Person ID and paste into the portal
E. Add 4 values to Vercel and redeploy
F. Test

═══════════════════════════════════════════════════════════════════════════════
A. RUN THE SQL  (Supabase → SQL Editor)
═══════════════════════════════════════════════════════════════════════════════
Run **supabase/schema-v9-basecamp.sql**. It adds a `basecamp_person_id`
column to profiles. Safe to re-run.

═══════════════════════════════════════════════════════════════════════════════
B. MAKE A BASECAMP PROJECT + MESSAGE BOARD
═══════════════════════════════════════════════════════════════════════════════
1. In Basecamp, create a project, e.g. **"ANM HR Notifications"**.
2. Make sure the people who should get notified (leads, HR, management, admin,
   and staff who need approve/reject pings) are **added to this project**.
   (A person only gets an @mention notification if they can access the project.)
3. The project already has a **Message Board** tool — that's where the portal posts.

═══════════════════════════════════════════════════════════════════════════════
C. REGISTER THE APP + CONNECT (with auto-refresh — set & forget)
═══════════════════════════════════════════════════════════════════════════════
1. Go to **https://launchpad.37signals.com/integrations** → **Register a new app**.
   - Name: ANM Portal
   - Redirect URI: `https://portal.anmoffice.in/api/basecamp-callback`
   - Product: **Basecamp 4**
   - Save → copy **Client ID** and **Client Secret**.
2. Add these to Vercel now (Settings → Environment Variables), then redeploy:
   - `BASECAMP_CLIENT_ID`, `BASECAMP_CLIENT_SECRET`
   - `BASECAMP_ACCOUNT_ID`, `BASECAMP_PROJECT_ID`, `BASECAMP_MESSAGE_BOARD_ID`
   - (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY should already be set)
3. Authorize once — visit in your browser (replace CLIENT_ID):
   ```
   https://launchpad.37signals.com/authorization/new?type=web_server&client_id=CLIENT_ID&redirect_uri=https://portal.anmoffice.in/api/basecamp-callback
   ```
   Click **Yes, I'll allow access** → you'll be redirected and shown a **code**.
4. Connect & store tokens — visit (paste the code from step 3):
   ```
   https://portal.anmoffice.in/api/basecamp-connect?code=THE_CODE
   ```
   You'll see "✅ Basecamp connected". The portal now stores the access +
   refresh tokens and **auto-refreshes forever** — you never touch tokens again.

   (You no longer need to set BASECAMP_ACCESS_TOKEN by hand. It's optional as a
    fallback only.)

═══════════════════════════════════════════════════════════════════════════════
D. LINK PEOPLE — ONE CLICK (auto-match)
═══════════════════════════════════════════════════════════════════════════════
1. In the portal: **Admin → Basecamp → 🔄 Auto-match Person IDs**.
2. It pulls everyone from Basecamp, matches by email, and fills each person's
   Basecamp Person ID automatically. You'll get a report:
   - **Matched** — linked successfully
   - **Unmatched** — portal users whose email wasn't found in Basecamp (fix the
     email, or add them to Basecamp, then run again)
   - **Extra** — Basecamp people with no portal account (ignore or invite)
3. Re-run any time you add new staff. Done.

   (You can still paste an ID manually in Admin → Employees → person → Details
    if someone uses different emails in the two systems.)

═══════════════════════════════════════════════════════════════════════════════
FINDING PROJECT + BOARD ID (for step C2)
═══════════════════════════════════════════════════════════════════════════════
- Account ID: your Basecamp URL `https://3.basecamp.com/4567890/...` → 4567890.
- Project ID: open the notification project → `.../projects/87654321` → 87654321.
- Board ID: in that project open the Message Board → `.../message_boards/55555555`
  → 55555555.

═══════════════════════════════════════════════════════════════════════════════
F. TEST
═══════════════════════════════════════════════════════════════════════════════
1. As a staff member with their Basecamp ID set, apply for leave.
   → The pool lead (if their Basecamp ID is set) gets an @mention in the project.
2. As the lead, open Approvals → Recommend.
   → Admin/HR/Management get @mentioned.
3. As management, Approve.
   → The staff member gets @mentioned with the approval.
4. Daily summary: Reports → "Generate & Send Now" (or wait for 7 PM cron).
   → A "📊 Daily Summary" message appears @mentioning management/HR/admin.

═══════════════════════════════════════════════════════════════════════════════
HOW THE ROUTING MAPS TO YOUR FLOW
═══════════════════════════════════════════════════════════════════════════════
| Event | Who gets the Basecamp @mention |
|---|---|
| Staff applies for leave/reimbursement | Their Pool Lead |
| Lead clicks "Recommend" | Admin + HR + Management |
| Management Approves / Rejects | The staff member who applied |
| Reimbursement assigned by HR/Mgmt directly | That HR/Mgmt person |
| Daily summary (7 PM) + leave status | Admin + HR + Management |

NOTES
- If a person's Basecamp Person ID is blank in the portal, they simply won't be
  @mentioned (everything else still works). So fill IDs for at least the
  leads, HR, management, admin first; add staff as you go.
- One-way only: portal → Basecamp. Staff cannot submit from inside Basecamp.
- Tokens now auto-refresh (stored securely after step C4). You should never need
  to touch them again. If you ever re-authorize, just repeat steps C3–C4.
- The portal's own in-app notifications keep working regardless of Basecamp.

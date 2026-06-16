# ANM Portal v3 — New Features Setup

This update adds: employee management, leave types/quotas, company settings,
attendance login+logout, reimbursement file uploads, and report exports.

## 🔧 One-time setup steps (do these in order)

### 1️⃣ Run the new SQL scripts in Supabase
Go to Supabase → SQL Editor → New Query, then run these **in order**:

1. **`supabase/schema-v3-additions.sql`** — adds new columns & tables (logout time,
   attachments, leave types, quotas, company settings, employee active flag)
2. **`supabase/storage-setup.sql`** — creates the file-upload bucket for invoices

(Your original `schema.sql` should already be run from before.)

### 2️⃣ Add the SERVICE ROLE key to Vercel (for "Add Employee")
The admin "Add Employee" feature needs a secure server key.

1. Supabase → **Settings → API** → copy the **`service_role`** key (the SECRET one)
2. Vercel → your project → **Settings → Environment Variables** → add:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://tlxhbhybnpairbhnwnxa.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (the service_role secret key) |

⚠️ The service_role key is powerful — only ever put it in Vercel env variables,
NEVER in frontend code or GitHub. (It's used only by the /api/create-employee function.)

3. **Redeploy** so the new variables take effect.

### 3️⃣ Done — new features now live:

**Admin → Employees**
- ➕ Add Employee (creates login with default password, prompts reset on first login)
- Assign a Pool Lead to each employee (dropdown)
- Set per-employee leave quota overrides (expand "Quotas")
- Deactivate / Reactivate employees (left staff lose access but data is kept)

**Admin → Leave Types**
- Add/edit/remove leave types and set default days per year

**Admin → Company Details**
- Edit company name, HR email, phone, address — updates everywhere live

**Attendance (all staff)**
- "Log In" button captures current time
- "Log Out" button captures end time — both recorded
- Senior/Management approve as before

**Expenses**
- Upload invoice files (any type) when submitting
- Senior sees & opens attachments before approving ("Verify & Recommend")

**Reports (Admin + Management)**
- Choose Attendance / Leaves / Reimbursements
- Period: Daily / Weekly / Monthly / Custom date range
- Download as Excel (CSV) or PDF (print-to-PDF, ANM letterhead)

## Notes
- Existing logins keep working
- All changes sync live across devices

---

## 📊 Daily Summary Feature (v3.1)

Sends a day-wise summary (present count, absentees, leave & expense activity)
as an **in-app notification** to all Management & Admin users.

### Automatic (daily)
- Configured via Vercel Cron in `vercel.json`
- Default: **7:00 PM IST** (`"schedule": "30 13 * * *"` = 13:30 UTC)
- To change the time: edit the cron schedule in `vercel.json` and redeploy
  - Format is UTC. IST = UTC + 5:30. Examples:
    - 6:00 PM IST → `30 12 * * *`
    - 8:00 AM IST → `30 2 * * *`

### On-demand
- Management/Admin → **Reports** tab → "📤 Generate & Send Now" button
- Instantly computes today's summary and notifies all managers

### Requirements
The daily summary uses the same `SUPABASE_SERVICE_ROLE_KEY` you already set
for Add Employee. No extra setup needed.

**Optional** — to secure the cron endpoint, add a Vercel env var:
| Name | Value |
|---|---|
| `CRON_SECRET` | any random string |

(Vercel automatically sends this to scheduled cron calls.)

### Note on Vercel Cron
- Cron jobs require a Vercel **Pro** plan (Hobby plan allows 2 cron jobs but
  runs them once per day max — which is exactly our need, so the free tier works).
- If cron doesn't fire on the free plan, just use the on-demand button, or
  upgrade to Pro for guaranteed scheduling.

---

## ✨ v4 Visual Enhancements

This version adds polish + an employee profile system. New SQL already included
in `schema-v3-additions.sql` (profile photo columns + avatars storage bucket) —
just re-run that script in Supabase SQL Editor (safe to re-run).

**What's new visually:**
- Time-based greeting ("Good morning/afternoon/evening")
- Live work-hours timer on dashboard once logged in (⏱ 3h 24m today)
- Circular progress rings for leave balances
- Smooth fade-in animations + tap feedback
- Confetti celebration when your leave/expense is approved
- Empty states with friendly icons
- **Profile tab** — every employee can upload a profile photo and edit
  their phone, designation, and emergency contact
- Photos appear in approvals, reviews, admin list, and the header

**Setup:** Re-run `schema-v3-additions.sql` (adds photo columns + avatars bucket).
No new env variables needed.

---

## 🎉 v5 — Logo, AI Assistant, Calendar & Management Dashboard

**1. Official logo** — the real ANM 50-years logo is now used throughout
(header, login, footer, app icon). File: `public/anm-logo.jpeg`. No setup needed.

**2. Management Dashboard ("Overview" tab)** — HR & Admin see live cards:
today's present count, on-leave count, absentees, late comers (after 9:30 AM),
pending leave approvals, and pending claim totals — plus detail lists.

**3. AI Assistant ("Assistant" tab)** — HR & Admin can ask natural questions:
- "Who is present today?" / "Who is absent today?"
- "Who is on leave this week / next week?"
- "Show pending claims above 5000"
- "Who came late today?"
- "How many staff total?"

It answers instantly from your live portal data — **no external AI service**,
so your data never leaves Supabase. (It's a smart rule-based engine.)

**4. Team Calendar ("Calendar" tab)** — HR & Admin get a monthly calendar
showing which days have staff on leave; tap any day to see who's on leave and
who's available.

These three tabs are visible only to Management (hr) and Admin roles.
No new SQL or environment variables needed for these features.

**5. Credits** — footer now shows "Developed by Bharath".

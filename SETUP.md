# ANM Portal v2 — Real Application Setup

React + Supabase + WhatsApp · Full production app with login, database, real-time sync.

## ⚡ Setup Order (do these once)

### 1️⃣ Run the database scripts in Supabase
1. Go to your Supabase project → **SQL Editor** → **New Query**
2. Open `supabase/schema.sql` → copy ALL → paste → click **RUN**
3. New Query again → open `supabase/seed-users.sql`
   - **First** replace the `919XXXXXXXXX` phone numbers with real ones (optional, can do later in Admin)
   - copy ALL → paste → **RUN**
4. ✅ This creates all tables, security rules, and 6 staff logins

### 2️⃣ Default login credentials
All 6 staff can now log in with:
- **Password:** `Anm@2026`
- Emails: bharath.m@anmoffice.in, balaji.s@anmoffice.in, tax@anmoffice.in,
  sukruthi.r@anmoffice.in, kavitha.d@anmoffice.in, admin@anmoffice.in
- On first login → app forces them to set a new password ✅

### 3️⃣ Deploy to Vercel
```bash
cd anm-portal-v2
npx vercel
```
Answer prompts (link to existing project = N, name = teamanm).

### 4️⃣ Add environment variables in Vercel
Vercel Dashboard → your project → **Settings → Environment Variables** → add:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | https://tlxhbhybnpairbhnwnxa.supabase.co |
| `VITE_SUPABASE_ANON_KEY` | (your anon key — already in .env) |
| `WHATSAPP_TOKEN` | (from Meta, when ready) |
| `WHATSAPP_PHONE_ID` | (from Meta, when ready) |

Then **Redeploy** so the variables take effect.

### 5️⃣ Done!
Your live app is at `https://teamanm.vercel.app` with real logins.

---

## Local Development
```bash
npm install
npm run dev    # opens http://localhost:5173
```
The `.env` file already has your Supabase keys for local testing.

## Notes
- **Email password reset** works out of the box (free)
- **WhatsApp** activates once you add the Meta tokens (Step 4)
- **Mobile OTP** can be added later (needs paid SMS provider)
- All data is now stored in Supabase and syncs live across all devices

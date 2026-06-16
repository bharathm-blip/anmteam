# ANM Portal v6 — Workflow & Designations Update

## 🔧 One-time setup

### Run the new SQL script
Supabase → SQL Editor → New Query → paste **`supabase/schema-v6-additions.sql`** → Run.
(Safe to re-run. Adds: designations table, configurable late cutoff, reimbursement
work-assigner column.)

Earlier scripts (schema.sql, schema-v3-additions.sql, storage-setup.sql) should
already be run. No new environment variables needed.

---

## ✨ What changed in v6

### 1. Designations (managed list)
- New **Admin → Designations** sub-tab: create / rename / remove designations
  (e.g. "Consultant"). Manageable by Admin, Management (HR).
- Assign when adding an employee, in the employee Details panel, or each person
  picks theirs in their Profile.

### 2. Pool Lead = Senior/Lead (one concept)
- A person with role **Senior/Lead** is a Pool Lead. (A "Consultant" designation
  is typically a Pool Lead.)
- Each Staff member has **"Reports to (Lead)"** — that lead handles their requests.
- The dropdown only appears for Staff.

### 3. Attendance flow (2-step)
- **Staff** punches login/logout → their **Pool Lead recommends** → **Management/HR approves**.
- **Pool Lead's own** attendance → **Management/HR approves directly** (1 step).

### 4. Leave flow (2-step) — same as attendance
- **Staff** applies → **Pool Lead recommends** → **Management/HR approves**.
- **Pool Lead's own** leave → **Management/HR approves directly**.

### 5. Reimbursement flow (work-assigner based)
- Submitter **selects who assigned the work** (a Lead, or Management/HR).
- If a **Lead** → that Lead **verifies & recommends** → **Management/HR approves**.
- If **Management/HR** → they **approve directly** (1 step).

### 6. Configurable late-comer cutoff
- **Admin → Company Details → Attendance Timing**: set Office Start Time and
  **Late Comer Cutoff** (default 10:15).
- Used in the Management dashboard, AI assistant, and the daily summary.

---

## Who approves what

| Who submits | Attendance / Leave | Reimbursement |
|---|---|---|
| Staff | Lead recommends → Management/HR approves | Picks assigner; Lead recommends → Mgmt approves, or Mgmt approves directly |
| Pool Lead | Management/HR approves directly | Picks assigner (Mgmt) → Mgmt approves |

**Note on terms:** "Consultant" = Pool Lead (Senior/Lead role). "HR" = Management
(the `Management` role). The portal uses the labels Senior/Lead and Management.

---

## ⚠️ After deploying
Go to **Admin → Employees** and set **"Reports to (Lead)"** for each Staff member,
so their attendance/leave routes to the correct Pool Lead for recommendation.

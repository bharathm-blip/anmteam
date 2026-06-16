-- ════════════════════════════════════════════════════════════════════════════
-- ANM PORTAL — v6 SCHEMA ADDITIONS
-- Run AFTER schema.sql and schema-v3-additions.sql. Safe to re-run.
-- Adds: designations table, configurable late-comer cutoff, reimbursement
--       work-assigner column.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. DESIGNATIONS (managed list, e.g. Consultant, Senior Auditor) ─────────
create table if not exists designations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean default true,
  created_at timestamptz default now()
);

insert into designations (name)
select * from (values ('Article Assistant'),('Audit Assistant'),('Senior Auditor'),('Tax Consultant'),('Consultant'),('Manager'),('Partner')) as v(name)
where not exists (select 1 from designations);

-- ── 2. COMPANY SETTINGS: configurable late-comer cutoff time ────────────────
alter table company_settings add column if not exists office_start_time text default '10:00';
alter table company_settings add column if not exists late_cutoff_time  text default '10:15';
update company_settings set late_cutoff_time = '10:15', office_start_time = '10:00' where id = 1 and late_cutoff_time is null;

-- ── 3. REIMBURSEMENTS: who assigned the work (recommender) ──────────────────
alter table reimbursements add column if not exists assigner_id uuid references profiles(id);
-- assigner_id = the Pool Lead / HR / Management who assigned the work.
-- If that person is HR/Management → they approve directly (status jumps to pending_hr's approver).
-- If a Pool Lead → they recommend, then HR/Management approves.

-- ── 4. RLS for designations ─────────────────────────────────────────────────
alter table designations enable row level security;
drop policy if exists "desig read" on designations;
create policy "desig read" on designations for select using (true);
drop policy if exists "desig write" on designations;
create policy "desig write" on designations for all
  using ( my_role() in ('admin','hr') ) with check ( my_role() in ('admin','hr') );

-- ── 5. Realtime ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table designations;

-- ✅ DONE.

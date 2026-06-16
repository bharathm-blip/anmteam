-- ════════════════════════════════════════════════════════════════════════════
-- ANM PORTAL — v3 SCHEMA ADDITIONS
-- Run this AFTER your existing schema.sql, in Supabase SQL Editor.
-- Safe to run once. Adds: logout time, attachments, leave quotas,
-- company settings, employee active/inactive, pool lead assignment.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. PROFILES: add active flag + ensure lead/quota columns ────────────────
alter table profiles add column if not exists active boolean default true;
alter table profiles add column if not exists assigned_lead_id uuid references profiles(id);
-- (role, team, phone already exist)

-- ── 2. ATTENDANCE: add logout time + working duration ───────────────────────
alter table attendance add column if not exists logout_time text;
-- login_time already exists; logout recorded when staff clicks "Log Out"

-- ── 3. REIMBURSEMENTS: add attachments (array of file URLs) ─────────────────
alter table reimbursements add column if not exists attachments jsonb default '[]'::jsonb;
-- stores [{name, url, size}] for uploaded invoice files

-- ── 4. LEAVE TYPES & QUOTAS ─────────────────────────────────────────────────
-- Default quotas (company-wide), editable by admin
create table if not exists leave_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  default_qty int not null default 0,
  active      boolean default true,
  created_at  timestamptz default now()
);

-- Per-employee overrides (optional; falls back to default_qty)
create table if not exists leave_quotas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  leave_type_id uuid not null references leave_types(id) on delete cascade,
  qty           int not null,
  unique (user_id, leave_type_id)
);

-- Seed default leave types (only if table empty)
insert into leave_types (name, default_qty)
select * from (values
  ('Annual Leave', 18),
  ('Sick Leave', 10),
  ('Casual Leave', 8),
  ('Maternity Leave', 180),
  ('Paternity Leave', 15),
  ('Compensatory Leave', 0),
  ('Unpaid Leave', 0)
) as v(name, qty)
where not exists (select 1 from leave_types);

-- ── 5. COMPANY SETTINGS (single row, editable by admin) ─────────────────────
create table if not exists company_settings (
  id          int primary key default 1,
  name        text,
  tagline     text,
  email       text,
  hr_email    text,
  phone       text,
  address     text,
  updated_at  timestamptz default now(),
  constraint single_row check (id = 1)
);

insert into company_settings (id, name, tagline, email, hr_email, phone, address)
values (1,
  'M/s A Narasimha Murthy & Co.',
  'Chartered Accountants | 50 Years of Excellence',
  'tax@anmoffice.in',
  'bharath.m@anmoffice.in',
  '+91 8660735588',
  'Pratham, Kuvempu Road, Shivamogga')
on conflict (id) do nothing;

-- ── 6. RLS for new tables ───────────────────────────────────────────────────
alter table leave_types      enable row level security;
alter table leave_quotas     enable row level security;
alter table company_settings enable row level security;

-- everyone can read; only admin can write
drop policy if exists "lt read" on leave_types;
create policy "lt read" on leave_types for select using (true);
drop policy if exists "lt write" on leave_types;
create policy "lt write" on leave_types for all using (my_role() = 'admin') with check (my_role() = 'admin');

drop policy if exists "lq read" on leave_quotas;
create policy "lq read" on leave_quotas for select using (true);
drop policy if exists "lq write" on leave_quotas;
create policy "lq write" on leave_quotas for all using (my_role() = 'admin') with check (my_role() = 'admin');

drop policy if exists "cs read" on company_settings;
create policy "cs read" on company_settings for select using (true);
drop policy if exists "cs write" on company_settings;
create policy "cs write" on company_settings for update using (my_role() = 'admin') with check (my_role() = 'admin');

-- ── 7. Allow admin to update any profile (for role/lead/active/quota mgmt) ───
drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles for update
  using ( id = auth.uid() or my_role() = 'admin' );

-- allow admin to insert profiles (when adding employees)
drop policy if exists "admin insert profile" on profiles;
create policy "admin insert profile" on profiles for insert
  with check ( my_role() = 'admin' or auth.uid() = id );

-- ── 8. Realtime for new tables ──────────────────────────────────────────────
alter publication supabase_realtime add table leave_types;
alter publication supabase_realtime add table leave_quotas;
alter publication supabase_realtime add table company_settings;

-- ✅ DONE. Next: create a Storage bucket named 'attachments' (see instructions).

-- ── v4: Profile photo + extra profile fields ────────────────────────────────
alter table profiles add column if not exists photo_url text;
alter table profiles add column if not exists designation text;
alter table profiles add column if not exists date_joined date;
alter table profiles add column if not exists emergency_contact text;

-- Avatars storage bucket (public read)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar upload" on storage.objects;
create policy "avatar upload" on storage.objects for insert
  to authenticated with check ( bucket_id = 'avatars' );
drop policy if exists "avatar read" on storage.objects;
create policy "avatar read" on storage.objects for select
  to authenticated using ( bucket_id = 'avatars' );
drop policy if exists "avatar update" on storage.objects;
create policy "avatar update" on storage.objects for update
  to authenticated using ( bucket_id = 'avatars' );

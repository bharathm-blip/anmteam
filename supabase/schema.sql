-- ════════════════════════════════════════════════════════════════════════════
-- ANM LEAVE & EXPENSE PORTAL — DATABASE SCHEMA
-- M/s A Narasimha Murthy & Co.
--
-- HOW TO USE:
--   1. Open your Supabase project → SQL Editor → New Query
--   2. Paste this entire file → click RUN
--   3. Then run the SECOND script (seed-users.sql) to create staff logins
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. PROFILES TABLE (extends auth.users) ─────────────────────────────────
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null,
  phone         text,                         -- for WhatsApp (format 919XXXXXXXXX)
  role          text not null default 'member' check (role in ('member','lead','hr','admin')),
  team          text not null default 'General',
  avatar        text,
  must_reset_pw boolean default true,         -- force password reset on first login
  created_at    timestamptz default now()
);

-- ── 2. ATTENDANCE TABLE ─────────────────────────────────────────────────────
create table if not exists attendance (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  date            date not null,
  login_time      text not null,
  note            text,
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by     uuid references profiles(id),
  approver_remark text,
  approved_at     timestamptz,
  created_at      timestamptz default now(),
  unique (user_id, date)                      -- one entry per person per day
);

-- ── 3. LEAVES TABLE ─────────────────────────────────────────────────────────
create table if not exists leaves (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  type          text not null,
  from_date     date not null,
  to_date       date not null,
  days          int not null,
  reason        text,
  status        text not null default 'pending_lead'
                check (status in ('pending_lead','pending_hr','approved','rejected')),
  lead_id       uuid references profiles(id),
  hr_id         uuid references profiles(id),
  lead_comment  text,
  lead_at       timestamptz,
  hr_comment    text,
  hr_at         timestamptz,
  submitted_at  timestamptz default now()
);

-- ── 4. REIMBURSEMENTS TABLE ─────────────────────────────────────────────────
create table if not exists reimbursements (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  category      text not null,
  amount        numeric not null,
  description   text,
  invoice_note  text,
  status        text not null default 'pending_lead'
                check (status in ('pending_lead','pending_hr','approved','rejected')),
  lead_id       uuid references profiles(id),
  hr_id         uuid references profiles(id),
  lead_comment  text,
  lead_at       timestamptz,
  hr_comment    text,
  hr_at         timestamptz,
  submitted_at  timestamptz default now()
);

-- ── 5. NOTIFICATIONS TABLE ──────────────────────────────────────────────────
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  message     text not null,
  type        text not null,                  -- 'leave'|'reimbursement'|'attendance'
  ref_id      uuid,
  read        boolean default false,
  created_at  timestamptz default now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- AUTO-CREATE PROFILE WHEN A NEW AUTH USER IS ADDED
-- ════════════════════════════════════════════════════════════════════════════
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email, phone, role, team, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.email,
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'role', 'member'),
    coalesce(new.raw_user_meta_data->>'team', 'General'),
    coalesce(new.raw_user_meta_data->>'avatar', upper(left(new.email,2)))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════════════════════════════════════
alter table profiles       enable row level security;
alter table attendance     enable row level security;
alter table leaves         enable row level security;
alter table reimbursements enable row level security;
alter table notifications  enable row level security;

-- Helper: get current user's role
create or replace function my_role() returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer stable;

-- Helper: get current user's team
create or replace function my_team() returns text as $$
  select team from profiles where id = auth.uid();
$$ language sql security definer stable;

-- ── PROFILES policies ───────────────────────────────────────────────────────
create policy "view profiles" on profiles for select
  using ( true );                              -- everyone can see names/teams (needed for approver lookups)
create policy "update own profile" on profiles for update
  using ( id = auth.uid() or my_role() = 'admin' );

-- ── ATTENDANCE policies ─────────────────────────────────────────────────────
create policy "att select" on attendance for select using (
  user_id = auth.uid()
  or my_role() in ('hr','admin')
  or (my_role() = 'lead' and exists (select 1 from profiles p where p.id = attendance.user_id and p.team = my_team()))
);
create policy "att insert own" on attendance for insert with check ( user_id = auth.uid() );
create policy "att update approver" on attendance for update using (
  my_role() in ('hr','admin')
  or (my_role() = 'lead' and exists (select 1 from profiles p where p.id = attendance.user_id and p.team = my_team()))
);

-- ── LEAVES policies ─────────────────────────────────────────────────────────
create policy "leave select" on leaves for select using (
  user_id = auth.uid() or lead_id = auth.uid() or my_role() in ('hr','admin')
);
create policy "leave insert own" on leaves for insert with check ( user_id = auth.uid() );
create policy "leave update approver" on leaves for update using (
  lead_id = auth.uid() or my_role() in ('hr','admin')
);

-- ── REIMBURSEMENTS policies ─────────────────────────────────────────────────
create policy "reimb select" on reimbursements for select using (
  user_id = auth.uid() or lead_id = auth.uid() or my_role() in ('hr','admin')
);
create policy "reimb insert own" on reimbursements for insert with check ( user_id = auth.uid() );
create policy "reimb update approver" on reimbursements for update using (
  lead_id = auth.uid() or my_role() in ('hr','admin')
);

-- ── NOTIFICATIONS policies ──────────────────────────────────────────────────
create policy "notif select own" on notifications for select using ( user_id = auth.uid() );
create policy "notif insert any"  on notifications for insert with check ( true );
create policy "notif update own"  on notifications for update using ( user_id = auth.uid() );

-- ════════════════════════════════════════════════════════════════════════════
-- ENABLE REALTIME (live sync across devices)
-- ════════════════════════════════════════════════════════════════════════════
alter publication supabase_realtime add table attendance;
alter publication supabase_realtime add table leaves;
alter publication supabase_realtime add table reimbursements;
alter publication supabase_realtime add table notifications;

-- ✅ DONE. Now run seed-users.sql to create staff login accounts.

-- ════════════════════════════════════════════════════════════════════════════
-- ANM PORTAL — v11 FIX: attendance approval visibility
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- PROBLEM: the old attendance policies let a Lead see/approve only staff on the
-- SAME TEAM (p.team = my_team()). But approval routing now uses "Reports to Lead"
-- (profiles.assigned_lead_id). So a Lead often couldn't even READ the staff
-- member's pending attendance — it never appeared in their Approvals queue.
--
-- FIX: rewrite the attendance SELECT and UPDATE policies to match the app logic:
--   • the employee can see their own
--   • HR / Admin can see all
--   • a Lead can see/approve attendance of staff whose assigned_lead_id = the lead
--   • a Lead can also see staff on their team who have NO lead assigned (fallback)
-- ════════════════════════════════════════════════════════════════════════════

-- Helper: the caller's own id (auth.uid()) is used directly.

drop policy if exists "att select" on attendance;
create policy "att select" on attendance for select using (
  user_id = auth.uid()
  or my_role() in ('hr','admin')
  or (
    my_role() = 'lead'
    and exists (
      select 1 from profiles p
      where p.id = attendance.user_id
        and (
          p.assigned_lead_id = auth.uid()
          or (p.assigned_lead_id is null and p.team = my_team())
        )
    )
  )
);

drop policy if exists "att update approver" on attendance;
create policy "att update approver" on attendance for update using (
  my_role() in ('hr','admin')
  or (
    my_role() = 'lead'
    and exists (
      select 1 from profiles p
      where p.id = attendance.user_id
        and (
          p.assigned_lead_id = auth.uid()
          or (p.assigned_lead_id is null and p.team = my_team())
        )
    )
  )
);

-- ✅ DONE. Leads will now see their team members' pending attendance for approval,
--    and HR/Management continue to see everything.

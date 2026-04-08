-- ============================================================
-- 009_fix_task_delete_rls.sql
-- The existing "tasks_delete" policy (from 001) only permits
-- super_admin to delete tasks.  "tasks_delete_general" (from
-- 005) covers general-task creators, but approval-task
-- creators have no delete policy, so their deletes are
-- silently rejected by RLS with no error returned.
--
-- Fix: add a policy that allows any authenticated user to
-- delete tasks they submitted, regardless of task_type.
-- The existing super_admin policy is left in place.
-- ============================================================

CREATE POLICY "tasks_delete_submitter" ON public.tasks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = submitted_by);

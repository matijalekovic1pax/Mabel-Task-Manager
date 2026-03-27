-- ============================================================
-- 005b_fix_rls_recursion.sql
-- Fixes infinite recursion between tasks and task_assignees
-- RLS policies caused by mutual cross-table references.
-- ============================================================

-- ============================================================
-- 1. Helper function: is_task_assignee()
--    SECURITY DEFINER bypasses RLS so policies on `tasks` can
--    safely query task_assignees without triggering recursion.
-- ============================================================

CREATE OR REPLACE FUNCTION is_task_assignee(p_task_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM task_assignees
    WHERE task_id = p_task_id AND assignee_id = p_user_id
  );
$$;

-- ============================================================
-- 2. Fix task_assignees_select — remove self-referential and
--    cross-table subqueries that caused the recursion loop.
-- ============================================================

DROP POLICY IF EXISTS "task_assignees_select" ON task_assignees;

CREATE POLICY "task_assignees_select" ON task_assignees
  FOR SELECT USING (
    -- You can see a row if you are the assignee in it
    assignee_id = auth.uid()
    -- Or you assigned someone (you are the assigner)
    OR assigned_by = auth.uid()
    -- Or you are CEO / super_admin
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('ceo', 'super_admin')
    )
  );

-- ============================================================
-- 3. Fix tasks policies that referenced task_assignees —
--    replace inline subqueries with the SECURITY DEFINER fn.
-- ============================================================

-- tasks_select_general_private
DROP POLICY IF EXISTS "tasks_select_general_private" ON tasks;

CREATE POLICY "tasks_select_general_private" ON tasks
  FOR SELECT USING (
    task_type = 'general'
    AND visibility = 'private'
    AND (
      auth.uid() = submitted_by
      OR is_task_assignee(id, auth.uid())
    )
  );

-- tasks_update_general
DROP POLICY IF EXISTS "tasks_update_general" ON tasks;

CREATE POLICY "tasks_update_general" ON tasks
  FOR UPDATE USING (
    task_type = 'general'
    AND (
      auth.uid() = submitted_by
      OR is_task_assignee(id, auth.uid())
    )
  );

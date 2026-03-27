-- ============================================================
-- 005_general_tasks.sql
-- Expands Mabel into a full company task manager.
-- Keeps the existing CEO approval workflow intact and adds
-- a parallel general task system where any employee can
-- create tasks and assign them to multiple team members.
-- ============================================================

-- ============================================================
-- 1. Extend enums
-- ============================================================

-- General-task lifecycle statuses
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'todo';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'done';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'cancelled';

-- New notification types for general tasks
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'task_assigned';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'task_completed';

-- ============================================================
-- 2. Add new columns to tasks
-- ============================================================

-- task_type distinguishes the two parallel workflows:
--   'approval' = existing CEO approval flow (default for all existing rows)
--   'general'  = new peer-to-peer task system
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'approval'
    CHECK (task_type IN ('approval', 'general'));

-- visibility controls who can see general tasks
--   'company' = all active employees (default)
--   'private' = only creator + assignees
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'company'
    CHECK (visibility IN ('private', 'company'));

-- ============================================================
-- 3. New table: task_assignees
--    Enables multiple assignees per general task.
-- ============================================================

CREATE TABLE IF NOT EXISTS task_assignees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  assignee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, assignee_id)
);

ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

-- Anyone who can see the task can also see its assignee list
CREATE POLICY "task_assignees_select" ON task_assignees
  FOR SELECT USING (
    -- Task creator or any assignee on this task can see the assignee list
    auth.uid() IN (
      SELECT submitted_by FROM tasks WHERE id = task_assignees.task_id
    )
    OR auth.uid() = task_assignees.assignee_id
    OR auth.uid() IN (
      SELECT ta.assignee_id FROM task_assignees ta WHERE ta.task_id = task_assignees.task_id
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ceo', 'super_admin')
    )
  );

-- Task creator or admin can add assignees
CREATE POLICY "task_assignees_insert" ON task_assignees
  FOR INSERT WITH CHECK (
    auth.uid() = assigned_by
    AND (
      auth.uid() IN (SELECT submitted_by FROM tasks WHERE id = task_assignees.task_id)
      OR EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ceo', 'super_admin')
      )
    )
  );

-- Task creator or admin can remove assignees
CREATE POLICY "task_assignees_delete" ON task_assignees
  FOR DELETE USING (
    auth.uid() IN (SELECT submitted_by FROM tasks WHERE id = task_assignees.task_id)
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ceo', 'super_admin')
    )
  );

-- ============================================================
-- 4. Update RLS on tasks for the new general task visibility
-- ============================================================

-- team_members (and everyone) can see company-visible general tasks
CREATE POLICY "tasks_select_general_company" ON tasks
  FOR SELECT USING (
    task_type = 'general'
    AND visibility = 'company'
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true
    )
  );

-- Creator or any assignee can see their own private general tasks
CREATE POLICY "tasks_select_general_private" ON tasks
  FOR SELECT USING (
    task_type = 'general'
    AND visibility = 'private'
    AND (
      auth.uid() = submitted_by
      OR auth.uid() IN (
        SELECT assignee_id FROM task_assignees WHERE task_id = tasks.id
      )
    )
  );

-- Any active user can INSERT a general task (they must be the creator)
CREATE POLICY "tasks_insert_general" ON tasks
  FOR INSERT WITH CHECK (
    task_type = 'general'
    AND auth.uid() = submitted_by
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true
    )
  );

-- Creator or assignee can update status/fields of a general task
CREATE POLICY "tasks_update_general" ON tasks
  FOR UPDATE USING (
    task_type = 'general'
    AND (
      auth.uid() = submitted_by
      OR auth.uid() IN (
        SELECT assignee_id FROM task_assignees WHERE task_id = tasks.id
      )
    )
  );

-- Creator or super_admin can delete their own general tasks
CREATE POLICY "tasks_delete_general" ON tasks
  FOR DELETE USING (
    task_type = 'general'
    AND (
      auth.uid() = submitted_by
      OR EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
      )
    )
  );

-- ============================================================
-- 5. RPC: update_general_task_status()
--    Server-enforced status transitions for general tasks.
--    Only the creator or an assignee can call this.
-- ============================================================

CREATE OR REPLACE FUNCTION update_general_task_status(
  p_task_id   UUID,
  p_status    TEXT,   -- 'todo' | 'in_progress' | 'done' | 'cancelled'
  p_note      TEXT    DEFAULT NULL
)
RETURNS tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task          tasks%ROWTYPE;
  v_actor_id      UUID := auth.uid();
  v_from_status   task_status;
  v_to_status     task_status;
  v_actor_profile profiles%ROWTYPE;
BEGIN
  -- Validate target status
  IF p_status NOT IN ('todo', 'in_progress', 'done', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status for general task: %', p_status;
  END IF;

  -- Load task with lock
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  -- Must be a general task
  IF v_task.task_type <> 'general' THEN
    RAISE EXCEPTION 'update_general_task_status can only be used on general tasks';
  END IF;

  -- Caller must be active
  SELECT * INTO v_actor_profile FROM profiles WHERE id = v_actor_id;
  IF NOT FOUND OR NOT v_actor_profile.is_active THEN
    RAISE EXCEPTION 'Inactive users cannot update tasks';
  END IF;

  -- Caller must be the creator or an assignee (or CEO/super_admin)
  IF v_actor_id <> v_task.submitted_by
     AND NOT EXISTS (SELECT 1 FROM task_assignees WHERE task_id = p_task_id AND assignee_id = v_actor_id)
     AND v_actor_profile.role NOT IN ('ceo', 'super_admin')
  THEN
    RAISE EXCEPTION 'Only the task creator or an assignee can update the status';
  END IF;

  -- Cannot move out of a terminal state
  IF v_task.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'Task is already in a terminal state (%)', v_task.status;
  END IF;

  v_from_status := v_task.status;
  v_to_status   := p_status::task_status;

  -- Update the task
  UPDATE tasks SET
    status      = v_to_status,
    updated_at  = NOW(),
    resolved_at = CASE WHEN p_status IN ('done', 'cancelled') THEN NOW() ELSE resolved_at END,
    resolved_by = CASE WHEN p_status IN ('done', 'cancelled') THEN v_actor_id ELSE resolved_by END
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  -- Log the event
  INSERT INTO task_events (task_id, actor_id, action, from_status, to_status, note)
  VALUES (p_task_id, v_actor_id, 'status_update', v_from_status, v_to_status, p_note);

  -- Notify creator when task is done (if someone else marked it done)
  IF p_status = 'done' AND v_actor_id <> v_task.submitted_by THEN
    INSERT INTO notifications (recipient_id, type, title, message, task_id)
    VALUES (
      v_task.submitted_by,
      'task_completed',
      'Task completed',
      format('"%s" has been marked as done by %s', v_task.title, v_actor_profile.full_name),
      p_task_id
    );
  END IF;

  RETURN v_task;
END;
$$;

-- ============================================================
-- 6. Trigger: notify_task_assigned()
--    Fires after each INSERT on task_assignees.
--    Sends a task_assigned notification to the new assignee.
-- ============================================================

CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task    tasks%ROWTYPE;
  v_assigner profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_task    FROM tasks    WHERE id = NEW.task_id;
  SELECT * INTO v_assigner FROM profiles WHERE id = NEW.assigned_by;

  -- Don't notify if the person assigned themselves
  IF NEW.assignee_id = NEW.assigned_by THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (recipient_id, type, title, message, task_id)
  VALUES (
    NEW.assignee_id,
    'task_assigned',
    'New task assigned to you',
    format('"%s" was assigned to you by %s', v_task.title, v_assigner.full_name),
    NEW.task_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_task_assignee_insert ON task_assignees;
CREATE TRIGGER on_task_assignee_insert
  AFTER INSERT ON task_assignees
  FOR EACH ROW EXECUTE FUNCTION notify_task_assigned();

-- ============================================================
-- 7. Register update_general_task_status in the Functions type
--    (Supabase type generation — no-op in SQL, for documentation)
-- ============================================================

-- Function signature for TypeScript type generation reference:
-- update_general_task_status(p_task_id uuid, p_status text, p_note text) RETURNS tasks

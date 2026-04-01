-- ============================================================
-- 006_fix_general_task_status.sql
-- Fixes two bugs in update_general_task_status() introduced in 005:
--   1. The function did not set app.task_transition = '1' before
--      UPDATE, so trg_enforce_task_status_transition blocked it.
--   2. The function inserted action = 'status_update' into task_events
--      but the task_events_action_check constraint did not include it.
-- ============================================================

-- Fix 1: add 'status_update' to the allowed actions constraint
ALTER TABLE public.task_events DROP CONSTRAINT IF EXISTS task_events_action_check;

ALTER TABLE public.task_events
  ADD CONSTRAINT task_events_action_check
  CHECK (action IN (
    'request_info',
    'delegate',
    'approve',
    'reject',
    'defer',
    'resolve',
    'mark_ready',
    'provide_info',
    'status_update'
  ));

-- Fix 2: replace function — set the transition flag before UPDATE
CREATE OR REPLACE FUNCTION update_general_task_status(
  p_task_id UUID,
  p_status  TEXT,
  p_note    TEXT DEFAULT NULL
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
  IF p_status NOT IN ('todo', 'in_progress', 'done', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status for general task: %', p_status;
  END IF;

  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.task_type <> 'general' THEN
    RAISE EXCEPTION 'update_general_task_status can only be used on general tasks';
  END IF;

  SELECT * INTO v_actor_profile FROM profiles WHERE id = v_actor_id;
  IF NOT FOUND OR NOT v_actor_profile.is_active THEN
    RAISE EXCEPTION 'Inactive users cannot update tasks';
  END IF;

  IF v_actor_id <> v_task.submitted_by
     AND NOT EXISTS (SELECT 1 FROM task_assignees WHERE task_id = p_task_id AND assignee_id = v_actor_id)
     AND v_actor_profile.role NOT IN ('ceo', 'super_admin')
  THEN
    RAISE EXCEPTION 'Only the task creator or an assignee can update the status';
  END IF;

  IF v_task.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'Task is already in a terminal state (%)', v_task.status;
  END IF;

  v_from_status := v_task.status;
  v_to_status   := p_status::task_status;

  -- Satisfy the enforce_task_status_transition trigger
  PERFORM set_config('app.task_transition', '1', true);

  UPDATE tasks SET
    status      = v_to_status,
    updated_at  = NOW(),
    resolved_at = CASE WHEN p_status IN ('done', 'cancelled') THEN NOW() ELSE resolved_at END,
    resolved_by = CASE WHEN p_status IN ('done', 'cancelled') THEN v_actor_id ELSE resolved_by END
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  PERFORM set_config('app.task_transition', '0', true);

  INSERT INTO task_events (task_id, actor_id, action, from_status, to_status, note)
  VALUES (p_task_id, v_actor_id, 'status_update', v_from_status, v_to_status, p_note);

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

-- ============================================================
-- 013_general_task_transitions.sql
-- Role-gated, named-action transitions for general tasks.
--
-- Replaces the permissive update_general_task_status(), which let
-- any actor (creator, assignee, admin) perform every transition
-- and logged everything as 'status_update'.
--
-- This migration:
--   1. Extends task_events_action_check with the new semantic
--      action names.
--   2. Creates transition_general_task(p_task_id, p_action, p_note)
--      which maps each action to its target status and enforces:
--        - assignee-only:    start, send_for_review, block, resume
--        - creator/admin:    approve_close, send_back, cancel
--        - admin bypass:     CEO / super_admin can run any action
--        - note required:    block, send_back, cancel
--   3. Leaves update_general_task_status() in place (unused by the
--      app after this migration; safe to drop in a future cleanup).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Extend allowed actions on task_events
-- ------------------------------------------------------------

ALTER TABLE public.task_events DROP CONSTRAINT IF EXISTS task_events_action_check;

ALTER TABLE public.task_events
  ADD CONSTRAINT task_events_action_check
  CHECK (action IN (
    -- Approval workflow
    'request_info',
    'delegate',
    'approve',
    'reject',
    'defer',
    'resolve',
    'mark_ready',
    'provide_info',
    -- Legacy (existing rows only; new code no longer writes this)
    'status_update',
    -- General workflow (new, named transitions)
    'start',
    'send_for_review',
    'approve_close',
    'send_back',
    'block',
    'resume',
    'cancel'
  ));

-- ------------------------------------------------------------
-- 2. transition_general_task()
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transition_general_task(
  p_task_id UUID,
  p_action  TEXT,
  p_note    TEXT DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task          public.tasks%ROWTYPE;
  v_actor_id      UUID := auth.uid();
  v_actor_profile public.profiles%ROWTYPE;
  v_action        TEXT := lower(trim(p_action));
  v_note          TEXT := NULLIF(trim(COALESCE(p_note, '')), '');
  v_is_admin      BOOLEAN := false;
  v_is_creator    BOOLEAN := false;
  v_is_assignee   BOOLEAN := false;
  v_from_status   task_status;
  v_to_status     task_status;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Load actor profile
  SELECT * INTO v_actor_profile FROM public.profiles WHERE id = v_actor_id;
  IF NOT FOUND OR v_actor_profile.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Inactive users cannot transition tasks';
  END IF;

  v_is_admin := v_actor_profile.role IN ('ceo', 'super_admin');

  -- Load and lock task
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.task_type <> 'general' THEN
    RAISE EXCEPTION 'transition_general_task can only be used on general tasks';
  END IF;

  IF v_task.is_archived THEN
    RAISE EXCEPTION 'Task is archived';
  END IF;

  IF v_task.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'Task is already in a terminal state (%)', v_task.status;
  END IF;

  v_is_creator  := v_task.submitted_by = v_actor_id;
  v_is_assignee := EXISTS (
    SELECT 1 FROM public.task_assignees
    WHERE task_id = p_task_id AND assignee_id = v_actor_id
  );

  -- Caller must have some relationship to the task
  IF NOT (v_is_admin OR v_is_creator OR v_is_assignee) THEN
    RAISE EXCEPTION 'You do not have access to this task';
  END IF;

  v_from_status := v_task.status;

  -- ----------------------------------------------------------
  -- Action routing: enforce from-state, target state, and role
  -- ----------------------------------------------------------
  CASE v_action
    WHEN 'start' THEN
      IF v_from_status <> 'todo' THEN
        RAISE EXCEPTION 'start is only valid from todo';
      END IF;
      IF NOT (v_is_assignee OR v_is_admin) THEN
        RAISE EXCEPTION 'Only an assignee can start the task';
      END IF;
      v_to_status := 'in_progress';

    WHEN 'send_for_review' THEN
      IF v_from_status <> 'in_progress' THEN
        RAISE EXCEPTION 'send_for_review is only valid from in_progress';
      END IF;
      IF NOT (v_is_assignee OR v_is_admin) THEN
        RAISE EXCEPTION 'Only an assignee can send the task for review';
      END IF;
      v_to_status := 'in_review';

    WHEN 'block' THEN
      IF v_from_status <> 'in_progress' THEN
        RAISE EXCEPTION 'block is only valid from in_progress';
      END IF;
      IF NOT (v_is_assignee OR v_is_admin) THEN
        RAISE EXCEPTION 'Only an assignee can mark the task blocked';
      END IF;
      IF v_note IS NULL THEN
        RAISE EXCEPTION 'A note explaining the blocker is required';
      END IF;
      v_to_status := 'blocked';

    WHEN 'resume' THEN
      IF v_from_status <> 'blocked' THEN
        RAISE EXCEPTION 'resume is only valid from blocked';
      END IF;
      IF NOT (v_is_assignee OR v_is_admin) THEN
        RAISE EXCEPTION 'Only an assignee can resume the task';
      END IF;
      v_to_status := 'in_progress';

    WHEN 'approve_close' THEN
      IF v_from_status <> 'in_review' THEN
        RAISE EXCEPTION 'approve_close is only valid from in_review';
      END IF;
      IF NOT (v_is_creator OR v_is_admin) THEN
        RAISE EXCEPTION 'Only the task creator can approve and close';
      END IF;
      v_to_status := 'done';

    WHEN 'send_back' THEN
      IF v_from_status <> 'in_review' THEN
        RAISE EXCEPTION 'send_back is only valid from in_review';
      END IF;
      IF NOT (v_is_creator OR v_is_admin) THEN
        RAISE EXCEPTION 'Only the task creator can send the task back';
      END IF;
      IF v_note IS NULL THEN
        RAISE EXCEPTION 'A note explaining what needs to change is required';
      END IF;
      v_to_status := 'in_progress';

    WHEN 'cancel' THEN
      IF NOT (v_is_creator OR v_is_admin) THEN
        RAISE EXCEPTION 'Only the task creator can cancel the task';
      END IF;
      IF v_note IS NULL THEN
        RAISE EXCEPTION 'A note explaining the cancellation is required';
      END IF;
      v_to_status := 'cancelled';

    ELSE
      RAISE EXCEPTION 'Unsupported general-task action: %', p_action;
  END CASE;

  -- ----------------------------------------------------------
  -- Apply the transition
  -- ----------------------------------------------------------
  PERFORM set_config('app.task_transition', '1', true);

  UPDATE public.tasks t
  SET
    status      = v_to_status,
    updated_at  = NOW(),
    resolved_at = CASE WHEN v_to_status IN ('done', 'cancelled') THEN NOW() ELSE t.resolved_at END,
    resolved_by = CASE WHEN v_to_status IN ('done', 'cancelled') THEN v_actor_id ELSE t.resolved_by END
  WHERE t.id = p_task_id
  RETURNING * INTO v_task;

  PERFORM set_config('app.task_transition', '0', true);

  -- Log event with the semantic action name
  INSERT INTO public.task_events (task_id, actor_id, action, from_status, to_status, note)
  VALUES (p_task_id, v_actor_id, v_action, v_from_status, v_to_status, v_note);

  -- ----------------------------------------------------------
  -- Notifications (mirrors the old function's behavior)
  -- ----------------------------------------------------------

  -- Sent for review → notify creator
  IF v_action = 'send_for_review' AND v_actor_id <> v_task.submitted_by THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
    VALUES (
      v_task.submitted_by, 'task_updated', 'Task ready for review',
      format('"%s" has been sent for review by %s', v_task.title, v_actor_profile.full_name),
      p_task_id
    );
  END IF;

  -- Blocked → notify creator
  IF v_action = 'block' AND v_actor_id <> v_task.submitted_by THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
    VALUES (
      v_task.submitted_by, 'task_updated', 'Task is blocked',
      format('"%s" has been marked as blocked by %s', v_task.title, v_actor_profile.full_name),
      p_task_id
    );
  END IF;

  -- Approved & closed → notify creator (if someone else closed it)
  IF v_action = 'approve_close' AND v_actor_id <> v_task.submitted_by THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
    VALUES (
      v_task.submitted_by, 'task_completed', 'Task completed',
      format('"%s" has been approved and closed by %s', v_task.title, v_actor_profile.full_name),
      p_task_id
    );
  END IF;

  -- Sent back → notify assignees
  IF v_action = 'send_back' THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
    SELECT ta.assignee_id, 'task_updated', 'Task sent back for rework',
      format('"%s" has been sent back for rework by %s', v_task.title, v_actor_profile.full_name),
      p_task_id
    FROM public.task_assignees ta
    WHERE ta.task_id = p_task_id AND ta.assignee_id <> v_actor_id;
  END IF;

  -- Cancelled → notify assignees
  IF v_action = 'cancel' THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
    SELECT ta.assignee_id, 'task_updated', 'Task cancelled',
      format('"%s" has been cancelled by %s', v_task.title, v_actor_profile.full_name),
      p_task_id
    FROM public.task_assignees ta
    WHERE ta.task_id = p_task_id AND ta.assignee_id <> v_actor_id;
  END IF;

  RETURN v_task;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_general_task(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_general_task(uuid, text, text) TO authenticated;

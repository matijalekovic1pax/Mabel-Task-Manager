-- ============================================================
-- 014_general_task_complete_reopen.sql
-- Adds two actions to the general-task workflow:
--   - complete: assignee closes the task without a review step
--                (in_progress → done, no note required)
--   - reopen:   creator re-raises a done task because they are
--                not satisfied (done → in_progress, note required)
--
-- Not every task needs a formal review. This keeps send_for_review
-- available for the cases that do, and lets the creator reopen a
-- task that was closed too early.
-- ============================================================

-- 1. Extend allowed action names on task_events
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
    -- Legacy
    'status_update',
    -- General workflow
    'start',
    'send_for_review',
    'approve_close',
    'send_back',
    'block',
    'resume',
    'cancel',
    -- New in 014
    'complete',
    'reopen'
  ));

-- 2. Replace transition_general_task with the new action routing.
-- Signature is unchanged; callers just pass the new action names.
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

  SELECT * INTO v_actor_profile FROM public.profiles WHERE id = v_actor_id;
  IF NOT FOUND OR v_actor_profile.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Inactive users cannot transition tasks';
  END IF;

  v_is_admin := v_actor_profile.role IN ('ceo', 'super_admin');

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

  -- cancelled is terminal; done is escapable only via reopen (checked per-action)
  IF v_task.status = 'cancelled' THEN
    RAISE EXCEPTION 'Task is cancelled and cannot be modified';
  END IF;

  v_is_creator  := v_task.submitted_by = v_actor_id;
  v_is_assignee := EXISTS (
    SELECT 1 FROM public.task_assignees
    WHERE task_id = p_task_id AND assignee_id = v_actor_id
  );

  IF NOT (v_is_admin OR v_is_creator OR v_is_assignee) THEN
    RAISE EXCEPTION 'You do not have access to this task';
  END IF;

  v_from_status := v_task.status;

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

    WHEN 'complete' THEN
      IF v_from_status <> 'in_progress' THEN
        RAISE EXCEPTION 'complete is only valid from in_progress';
      END IF;
      IF NOT (v_is_assignee OR v_is_admin) THEN
        RAISE EXCEPTION 'Only an assignee can complete the task';
      END IF;
      v_to_status := 'done';

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

    WHEN 'reopen' THEN
      IF v_from_status <> 'done' THEN
        RAISE EXCEPTION 'reopen is only valid from done';
      END IF;
      IF NOT (v_is_creator OR v_is_admin) THEN
        RAISE EXCEPTION 'Only the task creator can reopen a completed task';
      END IF;
      IF v_note IS NULL THEN
        RAISE EXCEPTION 'A note explaining why the task is being reopened is required';
      END IF;
      v_to_status := 'in_progress';

    WHEN 'cancel' THEN
      IF v_from_status = 'done' THEN
        RAISE EXCEPTION 'Use reopen to re-raise a completed task';
      END IF;
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

  PERFORM set_config('app.task_transition', '1', true);

  UPDATE public.tasks t
  SET
    status      = v_to_status,
    updated_at  = NOW(),
    -- Clear resolution stamp on reopen so subsequent close records the latest actor
    resolved_at = CASE
                    WHEN v_to_status IN ('done', 'cancelled') THEN NOW()
                    WHEN v_action = 'reopen' THEN NULL
                    ELSE t.resolved_at
                  END,
    resolved_by = CASE
                    WHEN v_to_status IN ('done', 'cancelled') THEN v_actor_id
                    WHEN v_action = 'reopen' THEN NULL
                    ELSE t.resolved_by
                  END
  WHERE t.id = p_task_id
  RETURNING * INTO v_task;

  PERFORM set_config('app.task_transition', '0', true);

  INSERT INTO public.task_events (task_id, actor_id, action, from_status, to_status, note)
  VALUES (p_task_id, v_actor_id, v_action, v_from_status, v_to_status, v_note);

  -- ----------------------------------------------------------
  -- Notifications
  -- ----------------------------------------------------------

  IF v_action = 'send_for_review' AND v_actor_id <> v_task.submitted_by THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
    VALUES (
      v_task.submitted_by, 'task_updated', 'Task ready for review',
      format('"%s" has been sent for review by %s', v_task.title, v_actor_profile.full_name),
      p_task_id
    );
  END IF;

  IF v_action = 'block' AND v_actor_id <> v_task.submitted_by THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
    VALUES (
      v_task.submitted_by, 'task_updated', 'Task is blocked',
      format('"%s" has been marked as blocked by %s', v_task.title, v_actor_profile.full_name),
      p_task_id
    );
  END IF;

  -- Closed by assignee directly (without review) or via approve_close
  IF v_action IN ('complete', 'approve_close') AND v_actor_id <> v_task.submitted_by THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
    VALUES (
      v_task.submitted_by, 'task_completed', 'Task completed',
      format('"%s" has been marked as done by %s', v_task.title, v_actor_profile.full_name),
      p_task_id
    );
  END IF;

  IF v_action = 'send_back' THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
    SELECT ta.assignee_id, 'task_updated', 'Task sent back for rework',
      format('"%s" has been sent back for rework by %s', v_task.title, v_actor_profile.full_name),
      p_task_id
    FROM public.task_assignees ta
    WHERE ta.task_id = p_task_id AND ta.assignee_id <> v_actor_id;
  END IF;

  -- Creator reopened a done task → notify assignees it's back in play
  IF v_action = 'reopen' THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
    SELECT ta.assignee_id, 'task_updated', 'Task reopened',
      format('"%s" has been reopened by %s', v_task.title, v_actor_profile.full_name),
      p_task_id
    FROM public.task_assignees ta
    WHERE ta.task_id = p_task_id AND ta.assignee_id <> v_actor_id;
  END IF;

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

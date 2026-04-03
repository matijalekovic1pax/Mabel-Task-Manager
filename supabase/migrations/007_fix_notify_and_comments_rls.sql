-- ============================================================
-- 007_fix_notify_and_comments_rls.sql
-- Fixes two outstanding issues:
--   1. notify_task_event() has no ELSE clause → "case not found"
--      error when action = 'status_update' is inserted
--   2. comments_select / comments_insert RLS policies check
--      tasks.assigned_to (approval workflow field) instead of
--      task_assignees join table (general task assignees)
-- ============================================================

-- Fix 1: Add ELSE NULL to the CASE in notify_task_event()
CREATE OR REPLACE FUNCTION public.notify_task_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
BEGIN
  SELECT *
  INTO v_task
  FROM public.tasks
  WHERE id = NEW.task_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  CASE NEW.action
    WHEN 'delegate' THEN
      IF v_task.assigned_to IS NOT NULL AND v_task.assigned_to <> NEW.actor_id THEN
        INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
        VALUES (
          v_task.assigned_to,
          'task_delegated',
          'Task delegated to you',
          format('%s: %s', v_task.reference_number, v_task.title),
          v_task.id
        );
      END IF;

    WHEN 'request_info' THEN
      IF v_task.submitted_by <> NEW.actor_id THEN
        INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
        VALUES (
          v_task.submitted_by,
          'needs_more_info',
          'More information needed',
          format('%s: %s', v_task.reference_number, v_task.title),
          v_task.id
        );
      END IF;

    WHEN 'provide_info' THEN
      INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
      SELECT
        p.id,
        'info_provided',
        'Information provided',
        format('%s: %s', v_task.reference_number, v_task.title),
        v_task.id
      FROM public.profiles p
      WHERE p.role IN ('ceo', 'super_admin')
        AND p.is_active = true
        AND p.id <> NEW.actor_id;

    WHEN 'mark_ready' THEN
      INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
      SELECT
        p.id,
        'task_updated',
        'Task ready for review',
        format('%s: %s', v_task.reference_number, v_task.title),
        v_task.id
      FROM public.profiles p
      WHERE p.role IN ('ceo', 'super_admin')
        AND p.is_active = true
        AND p.id <> NEW.actor_id;

    WHEN 'approve' THEN
      IF v_task.submitted_by <> NEW.actor_id THEN
        INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
        VALUES (
          v_task.submitted_by,
          'task_resolved',
          'Task approved',
          format('%s: %s', v_task.reference_number, v_task.title),
          v_task.id
        );
      END IF;

    WHEN 'reject' THEN
      IF v_task.submitted_by <> NEW.actor_id THEN
        INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
        VALUES (
          v_task.submitted_by,
          'task_resolved',
          'Task rejected',
          format('%s: %s', v_task.reference_number, v_task.title),
          v_task.id
        );
      END IF;

    WHEN 'resolve' THEN
      IF v_task.submitted_by <> NEW.actor_id THEN
        INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
        VALUES (
          v_task.submitted_by,
          'task_resolved',
          'Task resolved',
          format('%s: %s', v_task.reference_number, v_task.title),
          v_task.id
        );
      END IF;

    WHEN 'defer' THEN
      IF v_task.submitted_by <> NEW.actor_id THEN
        INSERT INTO public.notifications (recipient_id, type, title, message, task_id)
        VALUES (
          v_task.submitted_by,
          'task_updated',
          'Task deferred',
          format('%s: %s', v_task.reference_number, v_task.title),
          v_task.id
        );
      END IF;

    ELSE
      -- 'status_update' and any future actions are handled by their
      -- respective RPC functions directly; nothing to do here.
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

-- Fix 2: Update comments RLS to also allow general task assignees
-- (tasks.assigned_to is only set for approval-workflow delegation;
--  general task assignees live in task_assignees join table)

DROP POLICY IF EXISTS "comments_select" ON public.task_comments;
DROP POLICY IF EXISTS "comments_insert" ON public.task_comments;

CREATE POLICY "comments_select"
  ON public.task_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_comments.task_id
      AND (
        tasks.submitted_by = auth.uid()
        OR tasks.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.task_assignees
          WHERE task_assignees.task_id = task_comments.task_id
            AND task_assignees.assignee_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('ceo', 'super_admin')
        )
      )
    )
  );

CREATE POLICY "comments_insert"
  ON public.task_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_comments.task_id
      AND (
        tasks.submitted_by = auth.uid()
        OR tasks.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.task_assignees
          WHERE task_assignees.task_id = task_comments.task_id
            AND task_assignees.assignee_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('ceo', 'super_admin')
        )
      )
    )
  );

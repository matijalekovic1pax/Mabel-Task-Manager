-- ============================================================
-- Existing DB Upgrade Migration (008-011 only)
-- Use this when base schema (001-007) already exists.
-- ============================================================
-- >>> BEGIN 008_fix_preset_users_domains.sql
-- ============================================================
-- Normalize preset users to canonical @1pax.com addresses
-- and ensure roles are synchronized for already-created profiles.
-- ============================================================

-- Canonical allow-list entries
INSERT INTO public.allowed_emails (email, role)
VALUES
  ('matija.lekovic@1pax.com', 'super_admin'),
  ('mabel.miranda@1pax.com', 'ceo'),
  ('mm@1pax.com', 'ceo')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;

-- Remove stale domain variants from the allow-list
DELETE FROM public.allowed_emails
WHERE lower(email) IN ('mabel.miranda@onepacks.com', 'mm@onepacks.com');

-- Normalize profile emails if legacy domain values exist
UPDATE public.profiles
SET email = 'mabel.miranda@1pax.com'
WHERE lower(email) = 'mabel.miranda@onepacks.com';

UPDATE public.profiles
SET email = 'mm@1pax.com'
WHERE lower(email) = 'mm@onepacks.com';

-- Keep role assignments correct for both canonical + legacy records
UPDATE public.profiles
SET role = 'super_admin'
WHERE lower(email) = 'matija.lekovic@1pax.com'
  AND role != 'super_admin';

UPDATE public.profiles
SET role = 'ceo'
WHERE lower(email) IN (
  'mabel.miranda@1pax.com',
  'mabel.miranda@onepacks.com',
  'mm@1pax.com',
  'mm@onepacks.com'
)
  AND role != 'ceo';

-- <<< END 008_fix_preset_users_domains.sql

-- >>> BEGIN 009_task_events_and_transition_fn.sql
-- ============================================================
-- Task events + transition RPC
-- ============================================================

-- Enforce delegated tasks always having an assignee.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tasks_delegated_requires_assignee'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_delegated_requires_assignee
      CHECK (status <> 'delegated' OR assigned_to IS NOT NULL);
  END IF;
END $$;

-- Immutable workflow event log
CREATE TABLE IF NOT EXISTS public.task_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id    UUID NOT NULL REFERENCES public.profiles(id),
  action      TEXT NOT NULL,
  from_status task_status NOT NULL,
  to_status   task_status NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'task_events_action_check'
  ) THEN
    ALTER TABLE public.task_events
      ADD CONSTRAINT task_events_action_check
      CHECK (
        action IN (
          'request_info',
          'delegate',
          'approve',
          'reject',
          'defer',
          'resolve',
          'mark_ready',
          'provide_info'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_events_task_created
  ON public.task_events(task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_events_actor_created
  ON public.task_events(actor_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_task_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND current_setting('app.task_transition', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Task status changes must use transition_task()';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_task_status_transition ON public.tasks;
CREATE TRIGGER trg_enforce_task_status_transition
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_task_status_transition();

ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_events_select" ON public.task_events;

CREATE POLICY "task_events_select"
  ON public.task_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      JOIN public.profiles me ON me.id = auth.uid()
      WHERE t.id = task_events.task_id
        AND me.is_active = true
        AND (
          me.role IN ('ceo', 'super_admin')
          OR t.submitted_by = auth.uid()
          OR t.assigned_to = auth.uid()
        )
    )
  );

CREATE OR REPLACE FUNCTION public.transition_task(
  p_task_id uuid,
  p_action text,
  p_note text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role user_role;
  v_actor_active boolean;
  v_is_admin boolean := false;
  v_task public.tasks%ROWTYPE;
  v_updated public.tasks%ROWTYPE;
  v_action text := lower(trim(p_action));
  v_note text := NULLIF(trim(COALESCE(p_note, '')), '');
  v_new_status task_status;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role, is_active
  INTO v_actor_role, v_actor_active
  FROM public.profiles
  WHERE id = v_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for authenticated user';
  END IF;

  IF v_actor_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Inactive users cannot transition tasks';
  END IF;

  v_is_admin := v_actor_role IN ('ceo', 'super_admin');

  SELECT *
  INTO v_task
  FROM public.tasks
  WHERE id = p_task_id
    AND is_archived = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found or archived';
  END IF;

  IF NOT (
    v_is_admin
    OR v_task.submitted_by = v_actor_id
    OR v_task.assigned_to = v_actor_id
  ) THEN
    RAISE EXCEPTION 'You do not have access to this task';
  END IF;

  CASE v_action
    WHEN 'approve' THEN
      IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only CEO or super_admin can approve';
      END IF;
      IF v_task.status IN ('approved', 'rejected', 'resolved') THEN
        RAISE EXCEPTION 'Cannot approve a final-status task';
      END IF;
      v_new_status := 'approved';

    WHEN 'reject' THEN
      IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only CEO or super_admin can reject';
      END IF;
      IF v_task.status IN ('approved', 'rejected', 'resolved') THEN
        RAISE EXCEPTION 'Cannot reject a final-status task';
      END IF;
      v_new_status := 'rejected';

    WHEN 'defer' THEN
      IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only CEO or super_admin can defer';
      END IF;
      IF v_task.status IN ('approved', 'rejected', 'resolved') THEN
        RAISE EXCEPTION 'Cannot defer a final-status task';
      END IF;
      v_new_status := 'deferred';

    WHEN 'resolve' THEN
      IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only CEO or super_admin can resolve';
      END IF;
      IF v_task.status IN ('approved', 'rejected', 'resolved') THEN
        RAISE EXCEPTION 'Cannot resolve a final-status task';
      END IF;
      v_new_status := 'resolved';

    WHEN 'request_info' THEN
      IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only CEO or super_admin can request more information';
      END IF;
      IF v_task.status IN ('approved', 'rejected', 'resolved') THEN
        RAISE EXCEPTION 'Cannot request info on a final-status task';
      END IF;
      v_new_status := 'needs_more_info';

    WHEN 'delegate' THEN
      IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only CEO or super_admin can delegate';
      END IF;
      IF v_task.status IN ('approved', 'rejected', 'resolved') THEN
        RAISE EXCEPTION 'Cannot delegate a final-status task';
      END IF;
      IF p_assigned_to IS NULL THEN
        RAISE EXCEPTION 'Delegation requires assigned_to';
      END IF;

      PERFORM 1
      FROM public.profiles assignee
      WHERE assignee.id = p_assigned_to
        AND assignee.is_active = true;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Delegation assignee must be an active user';
      END IF;

      v_new_status := 'delegated';

    WHEN 'mark_ready' THEN
      IF v_task.status <> 'delegated' THEN
        RAISE EXCEPTION 'mark_ready is only valid from delegated';
      END IF;
      IF v_task.assigned_to IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Only assignee can mark delegated task as ready';
      END IF;
      v_new_status := 'in_review';

    WHEN 'provide_info' THEN
      IF v_task.status <> 'needs_more_info' THEN
        RAISE EXCEPTION 'provide_info is only valid from needs_more_info';
      END IF;
      IF v_task.submitted_by IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Only submitter can provide requested info';
      END IF;
      v_new_status := 'pending';

    ELSE
      RAISE EXCEPTION 'Unsupported transition action: %', p_action;
  END CASE;

  PERFORM set_config('app.task_transition', '1', true);

  UPDATE public.tasks t
  SET
    status = v_new_status,
    assigned_to = CASE
      WHEN v_action = 'delegate' THEN p_assigned_to
      WHEN v_action = 'request_info' THEN NULL
      ELSE t.assigned_to
    END,
    delegation_note = CASE
      WHEN v_action = 'delegate' THEN v_note
      ELSE t.delegation_note
    END,
    resolution_note = CASE
      WHEN v_action IN ('approve', 'reject', 'defer', 'resolve', 'request_info') THEN v_note
      ELSE t.resolution_note
    END,
    resolved_by = CASE
      WHEN v_action IN ('approve', 'reject', 'defer', 'resolve', 'request_info') THEN v_actor_id
      ELSE t.resolved_by
    END,
    resolved_at = CASE
      WHEN v_action IN ('approve', 'reject', 'defer', 'resolve', 'request_info') THEN now()
      ELSE t.resolved_at
    END
  WHERE t.id = p_task_id
  RETURNING * INTO v_updated;

  INSERT INTO public.task_events (
    task_id,
    actor_id,
    action,
    from_status,
    to_status,
    note
  )
  VALUES (
    v_updated.id,
    v_actor_id,
    v_action,
    v_task.status,
    v_new_status,
    v_note
  );

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_task(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_task(uuid, text, text, uuid) TO authenticated;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_events;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

-- <<< END 009_task_events_and_transition_fn.sql

-- >>> BEGIN 010_harden_task_rls.sql
-- ============================================================
-- Harden task RLS around active users and admin-only direct updates
-- ============================================================

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

CREATE POLICY "tasks_select"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.is_active = true
        AND (
          me.role IN ('ceo', 'super_admin')
          OR tasks.submitted_by = auth.uid()
          OR tasks.assigned_to = auth.uid()
        )
    )
  );

CREATE POLICY "tasks_insert"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND status = 'pending'
    AND assigned_to IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.is_active = true
    )
  );

CREATE POLICY "tasks_update"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.is_active = true
        AND me.role IN ('ceo', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.is_active = true
        AND me.role IN ('ceo', 'super_admin')
    )
  );

CREATE POLICY "tasks_delete"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.is_active = true
        AND me.role = 'super_admin'
    )
  );

-- <<< END 010_harden_task_rls.sql

-- >>> BEGIN 011_notification_triggers.sql
-- ============================================================
-- Notification triggers for task lifecycle events
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_task_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (
    recipient_id,
    type,
    title,
    message,
    task_id
  )
  SELECT
    p.id,
    'task_submitted',
    'New task submitted',
    format('New %s task: %s', replace(NEW.category::text, '_', ' '), NEW.title),
    NEW.id
  FROM public.profiles p
  WHERE p.role IN ('ceo', 'super_admin')
    AND p.is_active = true
    AND p.id <> NEW.submitted_by;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_submitted ON public.tasks;
CREATE TRIGGER trg_notify_task_submitted
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_submitted();

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
        INSERT INTO public.notifications (
          recipient_id,
          type,
          title,
          message,
          task_id
        )
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
        INSERT INTO public.notifications (
          recipient_id,
          type,
          title,
          message,
          task_id
        )
        VALUES (
          v_task.submitted_by,
          'needs_more_info',
          'More information needed',
          format('%s: %s', v_task.reference_number, v_task.title),
          v_task.id
        );
      END IF;

    WHEN 'provide_info' THEN
      INSERT INTO public.notifications (
        recipient_id,
        type,
        title,
        message,
        task_id
      )
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
      INSERT INTO public.notifications (
        recipient_id,
        type,
        title,
        message,
        task_id
      )
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
        INSERT INTO public.notifications (
          recipient_id,
          type,
          title,
          message,
          task_id
        )
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
        INSERT INTO public.notifications (
          recipient_id,
          type,
          title,
          message,
          task_id
        )
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
        INSERT INTO public.notifications (
          recipient_id,
          type,
          title,
          message,
          task_id
        )
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
        INSERT INTO public.notifications (
          recipient_id,
          type,
          title,
          message,
          task_id
        )
        VALUES (
          v_task.submitted_by,
          'task_updated',
          'Task deferred',
          format('%s: %s', v_task.reference_number, v_task.title),
          v_task.id
        );
      END IF;
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_event ON public.task_events;
CREATE TRIGGER trg_notify_task_event
  AFTER INSERT ON public.task_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_event();

CREATE OR REPLACE FUNCTION public.notify_task_comment_added()
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

  INSERT INTO public.notifications (
    recipient_id,
    type,
    title,
    message,
    task_id
  )
  SELECT
    recipients.recipient_id,
    'comment_added',
    'New comment added',
    format('%s: %s', v_task.reference_number, v_task.title),
    v_task.id
  FROM (
    SELECT v_task.submitted_by AS recipient_id
    UNION
    SELECT v_task.assigned_to
    UNION
    SELECT p.id
    FROM public.profiles p
    WHERE p.role IN ('ceo', 'super_admin')
      AND p.is_active = true
  ) recipients
  WHERE recipients.recipient_id IS NOT NULL
    AND recipients.recipient_id <> NEW.author_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_comment_added ON public.task_comments;
CREATE TRIGGER trg_notify_task_comment_added
  AFTER INSERT ON public.task_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_comment_added();

-- <<< END 011_notification_triggers.sql



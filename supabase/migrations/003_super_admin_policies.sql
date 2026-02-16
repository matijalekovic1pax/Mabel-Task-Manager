-- ============================================================
-- Update RLS policies to grant super_admin full access
-- Run AFTER 002_super_admin_enum.sql has been committed.
-- ============================================================

-- PROFILES: super_admin can update any profile
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- TASKS: super_admin has full access (select, insert, update, delete)
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;

CREATE POLICY "tasks_select"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'super_admin')
    )
    OR submitted_by = auth.uid()
    OR assigned_to = auth.uid()
  );

CREATE POLICY "tasks_update"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'super_admin')
    )
    OR (
      submitted_by = auth.uid()
      AND status IN ('pending', 'needs_more_info')
    )
    OR (
      assigned_to = auth.uid()
      AND status = 'delegated'
    )
  );

CREATE POLICY "tasks_delete"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- TASK COMMENTS: super_admin can see and add comments on any task
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
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'super_admin')
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
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'super_admin')
        )
      )
    )
  );

-- TASK ATTACHMENTS: super_admin can see all
DROP POLICY IF EXISTS "attachments_select" ON public.task_attachments;

CREATE POLICY "attachments_select"
  ON public.task_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_attachments.task_id
      AND (
        tasks.submitted_by = auth.uid()
        OR tasks.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'super_admin')
        )
      )
    )
  );

-- NOTIFICATIONS: super_admin can see all notifications
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;

CREATE POLICY "notifications_select"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (
    recipient_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- ALLOWED EMAILS: super_admin has full CRUD
DROP POLICY IF EXISTS "allowed_emails_ceo_select" ON public.allowed_emails;
DROP POLICY IF EXISTS "allowed_emails_ceo_insert" ON public.allowed_emails;
DROP POLICY IF EXISTS "allowed_emails_ceo_delete" ON public.allowed_emails;

CREATE POLICY "allowed_emails_admin_select"
  ON public.allowed_emails FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'super_admin')
    )
  );

CREATE POLICY "allowed_emails_admin_insert"
  ON public.allowed_emails FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'super_admin')
    )
  );

CREATE POLICY "allowed_emails_admin_delete"
  ON public.allowed_emails FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'super_admin')
    )
  );

CREATE POLICY "allowed_emails_admin_update"
  ON public.allowed_emails FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

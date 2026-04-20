-- ============================================================
-- 015_task_attachments_rls.sql
-- The original attachment policies (migration 001) only allow
-- the approval-workflow participants (submitted_by / assigned_to
-- / ceo) to read or insert. General-task assignees live in the
-- task_assignees join table, not tasks.assigned_to, so they
-- currently can't see or upload attachments on their own tasks.
--
-- This migration:
--   1. Rewrites attachments_select and attachments_insert to also
--      cover general-task assignees and super_admin.
--   2. Adds attachments_delete so users can remove their own
--      uploads (super_admin can remove any).
--   3. Adds a storage object DELETE policy scoped to the uploader
--      so removing a row doesn't orphan the file.
-- ============================================================

-- 1. SELECT
DROP POLICY IF EXISTS "attachments_select" ON public.task_attachments;

CREATE POLICY "attachments_select"
  ON public.task_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_attachments.task_id
        AND (
          t.submitted_by = auth.uid()
          OR t.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.task_assignees ta
            WHERE ta.task_id = t.id AND ta.assignee_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role IN ('ceo', 'super_admin')
          )
        )
    )
  );

-- 2. INSERT
DROP POLICY IF EXISTS "attachments_insert" ON public.task_attachments;

CREATE POLICY "attachments_insert"
  ON public.task_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_attachments.task_id
        AND (
          t.submitted_by = auth.uid()
          OR t.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.task_assignees ta
            WHERE ta.task_id = t.id AND ta.assignee_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role IN ('ceo', 'super_admin')
          )
        )
    )
  );

-- 3. DELETE
DROP POLICY IF EXISTS "attachments_delete" ON public.task_attachments;

CREATE POLICY "attachments_delete"
  ON public.task_attachments FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- 4. Storage object DELETE (scoped to the owner who uploaded).
-- The existing migration 001 storage policies allow any authenticated
-- user to DELETE any object in the bucket. Tighten to the owner only
-- (Supabase stamps storage.objects.owner with the uploader's auth.uid()).
-- super_admin is allowed via the OR clause.
DROP POLICY IF EXISTS "task_attachments_delete" ON storage.objects;

CREATE POLICY "task_attachments_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'super_admin'
      )
    )
  );

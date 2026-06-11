-- ============================================================
-- 016_task_comments_delete_rls.sql
-- Allow authenticated users to delete comments they authored.
-- ============================================================

DROP POLICY IF EXISTS "comments_delete" ON public.task_comments;

CREATE POLICY "comments_delete"
  ON public.task_comments FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

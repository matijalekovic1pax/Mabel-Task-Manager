-- Allow task submitters to delete their own tasks (in addition to super_admin).

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

CREATE POLICY "tasks_delete"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (
    -- The person who submitted the task can delete it
    submitted_by = auth.uid()
    OR
    -- super_admin can delete any task
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.is_active = true
        AND me.role = 'super_admin'
    )
  );

-- ============================================================
-- 017_task_attachment_limits.sql
-- Enforce task attachment limits server-side:
--   - PDF, Word, and Excel documents only
--   - maximum 5 MB total per task across all attachments
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
      AND column_name = 'file_size_limit'
  ) THEN
    UPDATE storage.buckets
    SET file_size_limit = 5242880
    WHERE id = 'task-attachments';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
      AND column_name = 'allowed_mime_types'
  ) THEN
    UPDATE storage.buckets
    SET allowed_mime_types = ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]::text[]
    WHERE id = 'task-attachments';
  END IF;
END $$;

ALTER TABLE public.task_attachments
  DROP CONSTRAINT IF EXISTS task_attachments_file_size_limit;

ALTER TABLE public.task_attachments
  ADD CONSTRAINT task_attachments_file_size_limit
  CHECK (file_size > 0 AND file_size <= 5242880) NOT VALID;

ALTER TABLE public.task_attachments
  DROP CONSTRAINT IF EXISTS task_attachments_document_type;

ALTER TABLE public.task_attachments
  ADD CONSTRAINT task_attachments_document_type
  CHECK (
    lower(coalesce(file_name, '')) ~ '\.(pdf|doc|docx|xls|xlsx)$'
    OR lower(coalesce(file_type, '')) IN (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.enforce_task_attachment_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_total bigint;
BEGIN
  IF NEW.file_size <= 0 OR NEW.file_size > 5242880 THEN
    RAISE EXCEPTION 'Each task attachment must be 5 MB or smaller';
  END IF;

  IF NOT (
    lower(coalesce(NEW.file_name, '')) ~ '\.(pdf|doc|docx|xls|xlsx)$'
    OR lower(coalesce(NEW.file_type, '')) IN (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  ) THEN
    RAISE EXCEPTION 'Task attachments must be PDF, Word, or Excel documents';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.task_id::text));

  SELECT COALESCE(SUM(file_size), 0)
  INTO v_existing_total
  FROM public.task_attachments
  WHERE task_id = NEW.task_id
    AND id <> NEW.id;

  IF v_existing_total + NEW.file_size > 5242880 THEN
    RAISE EXCEPTION 'Task attachments can total at most 5 MB';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_attachment_limits_before_write ON public.task_attachments;

CREATE TRIGGER task_attachment_limits_before_write
  BEFORE INSERT OR UPDATE OF task_id, file_size
  ON public.task_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_task_attachment_limits();

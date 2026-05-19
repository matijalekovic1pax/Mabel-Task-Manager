-- ============================================================
-- 017_task_attachment_limits.sql
-- Enforce task attachment limits server-side:
--   - photos keep the existing 5-photo limit
--   - non-photo files must be PDF, Word, or Excel documents
--   - non-photo files can total at most 5 MB per task
-- ============================================================

ALTER TABLE public.task_attachments
  DROP CONSTRAINT IF EXISTS task_attachments_file_size_limit;

ALTER TABLE public.task_attachments
  ADD CONSTRAINT task_attachments_file_size_limit
  CHECK (
    file_size > 0
    AND (
      lower(coalesce(file_type, '')) LIKE 'image/%'
      OR file_size <= 5242880
    )
  ) NOT VALID;

ALTER TABLE public.task_attachments
  DROP CONSTRAINT IF EXISTS task_attachments_document_type;

ALTER TABLE public.task_attachments
  ADD CONSTRAINT task_attachments_document_type
  CHECK (
    lower(coalesce(file_type, '')) LIKE 'image/%'
    OR lower(coalesce(file_name, '')) ~ '\.(pdf|doc|docx|xls|xlsx)$'
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
  v_existing_photos bigint;
  v_is_photo boolean;
BEGIN
  v_is_photo := lower(coalesce(NEW.file_type, '')) LIKE 'image/%';

  IF NEW.file_size <= 0 THEN
    RAISE EXCEPTION 'Task attachments must not be empty';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.task_id::text));

  IF v_is_photo THEN
    SELECT COUNT(*)
    INTO v_existing_photos
    FROM public.task_attachments
    WHERE task_id = NEW.task_id
      AND id <> NEW.id
      AND lower(coalesce(file_type, '')) LIKE 'image/%';

    IF v_existing_photos >= 5 THEN
      RAISE EXCEPTION 'A task can have at most 5 photos';
    END IF;
  ELSE
    IF NEW.file_size > 5242880 THEN
      RAISE EXCEPTION 'Each task file must be 5 MB or smaller';
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
      RAISE EXCEPTION 'Task files must be PDF, Word, or Excel documents';
    END IF;

    SELECT COALESCE(SUM(file_size), 0)
    INTO v_existing_total
    FROM public.task_attachments
    WHERE task_id = NEW.task_id
      AND id <> NEW.id
      AND lower(coalesce(file_type, '')) NOT LIKE 'image/%';

    IF v_existing_total + NEW.file_size > 5242880 THEN
      RAISE EXCEPTION 'Task files can total at most 5 MB';
    END IF;
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

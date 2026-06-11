-- ============================================================
-- 020_notification_email_deliveries.sql
-- Durable email delivery queue for assignment notifications.
-- The existing notifications table remains the source of truth;
-- this table tracks out-of-band email delivery attempts.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.notification_email_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id     UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id             UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  notification_type   public.notification_type NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
  provider            TEXT NOT NULL DEFAULT 'gmail'
                        CHECK (provider IN ('gmail')),
  attempts            INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_message_id TEXT,
  last_error          TEXT,
  last_attempt_at     TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT notification_email_deliveries_notification_unique UNIQUE (notification_id)
);

CREATE INDEX IF NOT EXISTS notification_email_deliveries_pending_idx
  ON public.notification_email_deliveries (created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS notification_email_deliveries_task_status_idx
  ON public.notification_email_deliveries (task_id, status, created_at);

CREATE INDEX IF NOT EXISTS notification_email_deliveries_recipient_idx
  ON public.notification_email_deliveries (recipient_id, created_at DESC);

ALTER TABLE public.notification_email_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notification_email_deliveries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_email_deliveries TO service_role;

CREATE POLICY "notification_email_deliveries_service_role"
  ON public.notification_email_deliveries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION private.touch_notification_email_delivery_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_email_deliveries_updated_at
  ON public.notification_email_deliveries;

CREATE TRIGGER notification_email_deliveries_updated_at
  BEFORE UPDATE ON public.notification_email_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION private.touch_notification_email_delivery_updated_at();

CREATE OR REPLACE FUNCTION private.enqueue_notification_email_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.task_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.type NOT IN (
    'task_assigned'::public.notification_type,
    'task_delegated'::public.notification_type
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notification_email_deliveries (
    notification_id,
    recipient_id,
    task_id,
    notification_type
  )
  VALUES (
    NEW.id,
    NEW.recipient_id,
    NEW.task_id,
    NEW.type
  )
  ON CONFLICT (notification_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_notification_email_delivery() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.touch_notification_email_delivery_updated_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_assignment_notification_email_delivery
  ON public.notifications;

CREATE TRIGGER on_assignment_notification_email_delivery
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION private.enqueue_notification_email_delivery();

COMMENT ON TABLE public.notification_email_deliveries
  IS 'Durable queue for email delivery of task assignment notifications.';

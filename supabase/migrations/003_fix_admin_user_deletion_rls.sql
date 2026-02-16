-- ============================================================
-- Fix admin user-management RLS for existing databases
-- Ensures CEO/super_admin can manage allow-list + profile activation
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role'
      AND e.enumlabel = 'super_admin'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'super_admin';
  END IF;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.is_active = true
        AND me.role IN ('ceo', 'super_admin')
    )
  )
  WITH CHECK (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.is_active = true
        AND me.role IN ('ceo', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "allowed_emails_ceo_select" ON public.allowed_emails;
DROP POLICY IF EXISTS "allowed_emails_ceo_insert" ON public.allowed_emails;
DROP POLICY IF EXISTS "allowed_emails_ceo_delete" ON public.allowed_emails;
DROP POLICY IF EXISTS "allowed_emails_admin_select" ON public.allowed_emails;
DROP POLICY IF EXISTS "allowed_emails_admin_insert" ON public.allowed_emails;
DROP POLICY IF EXISTS "allowed_emails_admin_delete" ON public.allowed_emails;
DROP POLICY IF EXISTS "allowed_emails_admin_update" ON public.allowed_emails;

CREATE POLICY "allowed_emails_admin_select"
  ON public.allowed_emails FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.is_active = true
        AND me.role IN ('ceo', 'super_admin')
    )
  );

CREATE POLICY "allowed_emails_admin_insert"
  ON public.allowed_emails FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.is_active = true
        AND me.role IN ('ceo', 'super_admin')
    )
  );

CREATE POLICY "allowed_emails_admin_update"
  ON public.allowed_emails FOR UPDATE
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

CREATE POLICY "allowed_emails_admin_delete"
  ON public.allowed_emails FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.is_active = true
        AND me.role IN ('ceo', 'super_admin')
    )
  );

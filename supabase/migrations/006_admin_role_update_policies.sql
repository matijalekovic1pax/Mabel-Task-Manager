-- ============================================================
-- Allow CEO and super_admin to update any profile (for role changes)
-- and any allowed_email entry (for pre-signup role changes)
-- ============================================================

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "allowed_emails_admin_update" ON public.allowed_emails;

CREATE POLICY "allowed_emails_admin_update"
  ON public.allowed_emails FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('ceo', 'super_admin')
    )
  );

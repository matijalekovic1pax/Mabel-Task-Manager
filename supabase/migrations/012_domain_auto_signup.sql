-- ============================================================
-- 012_domain_auto_signup.sql
-- Allow anyone with a @1pax.com Google account to sign up
-- automatically as team_member, without needing a manual entry
-- in allowed_emails first.
--
-- Priority order (first match wins):
--   1. Exact match in allowed_emails  → use that role (preserves
--      CEO / super_admin assignments)
--   2. Email domain = 1pax.com        → team_member
--   3. No match                        → no profile created
--                                        → access_denied in the UI
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      user_role;
  v_domain    TEXT;
BEGIN
  -- 1. Check the explicit allow-list first (handles CEO / super_admin overrides)
  SELECT role INTO v_role
  FROM public.allowed_emails
  WHERE lower(email) = lower(NEW.email);

  -- 2. Fall back to domain check
  IF v_role IS NULL THEN
    v_domain := lower(split_part(NEW.email, '@', 2));
    IF v_domain = '1pax.com' THEN
      v_role := 'team_member';
    END IF;
  END IF;

  -- 3. Create the profile only when a role was resolved
  IF v_role IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, full_name, role, avatar_url)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
      ),
      v_role,
      NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user failed for %: %', NEW.email, SQLERRM;
  RETURN NEW;
END;
$$;

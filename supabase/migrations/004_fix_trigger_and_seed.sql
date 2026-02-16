-- ============================================================
-- Fix: Make handle_new_user trigger fault-tolerant
-- and seed the super admin email into allowed_emails
-- ============================================================

-- Replace the trigger function with an exception-safe version.
-- If anything goes wrong, log it but don't block user creation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  allowed_role user_role;
BEGIN
  SELECT role INTO allowed_role
  FROM public.allowed_emails
  WHERE lower(email) = lower(NEW.email);

  IF allowed_role IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, full_name, role, avatar_url)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
      ),
      allowed_role,
      NEW.raw_user_meta_data->>'avatar_url'
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user failed for %: %', NEW.email, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed the super admin / CEO email so a profile gets created on first login.
-- Using ON CONFLICT to make this idempotent (safe to run multiple times).
INSERT INTO public.allowed_emails (email, role)
VALUES ('matija.lekovic@1pax.com', 'ceo')
ON CONFLICT (email) DO NOTHING;

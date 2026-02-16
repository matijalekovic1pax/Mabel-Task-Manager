-- ============================================================
-- Preset user accounts
--   matija.lekovic@1pax.com   → super_admin
--   mabel.miranda@onepacks.com → ceo
--   mm@onepacks.com            → ceo
-- ============================================================

-- Upsert allowed_emails (insert or update if already present)
INSERT INTO public.allowed_emails (email, role)
VALUES
  ('matija.lekovic@1pax.com',    'super_admin'),
  ('mabel.miranda@1pax.com', 'ceo'),
  ('mm@1pax.com',            'ceo')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;

-- If any of these users have already signed up, update their profile role too
UPDATE public.profiles SET role = 'super_admin'
WHERE email = 'matija.lekovic@1pax.com' AND role != 'super_admin';

UPDATE public.profiles SET role = 'ceo'
WHERE email IN ('mabel.miranda@onepacks.com', 'mm@onepacks.com') AND role != 'ceo';

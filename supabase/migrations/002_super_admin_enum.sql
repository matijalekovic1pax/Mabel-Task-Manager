-- ============================================================
-- Add super_admin to user_role enum
-- This MUST be committed in its own transaction before
-- any policies can reference the new value.
-- ============================================================

ALTER TYPE user_role ADD VALUE 'super_admin';

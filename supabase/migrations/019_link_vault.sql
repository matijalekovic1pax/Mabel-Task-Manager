-- ============================================================
-- 019_link_vault.sql
-- Shared company link vault for reviewable project resources:
-- deployments, Figma files, documents, prototypes, and similar.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.link_vault_items (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT         NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  url           TEXT         NOT NULL CHECK (char_length(trim(url)) > 0),
  description   TEXT,
  resource_type TEXT         NOT NULL DEFAULT 'other'
                  CHECK (resource_type IN ('deployment', 'figma', 'document', 'prototype', 'research', 'other')),
  created_by    UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_pinned     BOOLEAN      NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS link_vault_items_created_at_idx
  ON public.link_vault_items (created_at DESC);

CREATE INDEX IF NOT EXISTS link_vault_items_type_idx
  ON public.link_vault_items (resource_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS link_vault_items_pinned_idx
  ON public.link_vault_items (is_pinned DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS link_vault_items_created_by_idx
  ON public.link_vault_items (created_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.link_vault_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.link_vault_items TO service_role;

CREATE OR REPLACE FUNCTION public._touch_link_vault_item_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS link_vault_items_updated_at ON public.link_vault_items;
CREATE TRIGGER link_vault_items_updated_at
  BEFORE UPDATE ON public.link_vault_items
  FOR EACH ROW EXECUTE FUNCTION public._touch_link_vault_item_updated_at();

ALTER TABLE public.link_vault_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "link_vault_items_select_active" ON public.link_vault_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
    )
  );

CREATE POLICY "link_vault_items_insert_active" ON public.link_vault_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
    )
  );

CREATE POLICY "link_vault_items_update_owner_or_admin" ON public.link_vault_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND (
          link_vault_items.created_by = (SELECT auth.uid())
          OR me.role IN ('ceo', 'super_admin')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND (
          link_vault_items.created_by = (SELECT auth.uid())
          OR me.role IN ('ceo', 'super_admin')
        )
    )
  );

CREATE POLICY "link_vault_items_delete_owner_or_admin" ON public.link_vault_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND (
          link_vault_items.created_by = (SELECT auth.uid())
          OR me.role IN ('ceo', 'super_admin')
        )
    )
  );

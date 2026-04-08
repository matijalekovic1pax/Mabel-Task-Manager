-- ============================================================
-- 010_personal_todo_enhancements.sql
-- Two changes:
--   1. Rename personal_todos.notes → description (better name,
--      makes room for a proper long-form description field).
--   2. Add personal_todo_items — a private checklist table so
--      users can break a todo into trackable sub-steps.
-- ============================================================

-- 1. Rename column
ALTER TABLE personal_todos RENAME COLUMN notes TO description;

-- ============================================================
-- 2. Checklist items
-- ============================================================

CREATE TABLE IF NOT EXISTS personal_todo_items (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id     UUID         NOT NULL REFERENCES personal_todos(id) ON DELETE CASCADE,
  text        TEXT         NOT NULL CHECK (char_length(trim(text)) > 0),
  is_done     BOOLEAN      NOT NULL DEFAULT false,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS personal_todo_items_todo_id_idx
  ON personal_todo_items (todo_id, created_at ASC);

-- ============================================================
-- RLS: owner-only, derived from the parent todo's user_id
-- ============================================================

ALTER TABLE personal_todo_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personal_todo_items_owner_only" ON personal_todo_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM personal_todos
      WHERE id = personal_todo_items.todo_id
        AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM personal_todos
      WHERE id = personal_todo_items.todo_id
        AND user_id = auth.uid()
    )
  );

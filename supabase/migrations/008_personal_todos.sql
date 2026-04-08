-- ============================================================
-- 008_personal_todos.sql
-- Private personal to-do list for each employee.
-- Fully isolated: a single RLS policy ensures users can only
-- ever read or modify their own rows — no admin override.
-- ============================================================

CREATE TABLE IF NOT EXISTS personal_todos (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT         NOT NULL CHECK (char_length(trim(title)) > 0),
  notes       TEXT,
  status      TEXT         NOT NULL DEFAULT 'todo'
                CHECK (status IN ('todo', 'in_progress', 'done')),
  priority    TEXT         NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  due_date    DATE,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Fast per-user lookups ordered by creation time
CREATE INDEX IF NOT EXISTS personal_todos_user_id_idx
  ON personal_todos (user_id, created_at DESC);

-- Auto-bump updated_at on every row change
CREATE OR REPLACE FUNCTION _touch_personal_todo_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS personal_todos_updated_at ON personal_todos;
CREATE TRIGGER personal_todos_updated_at
  BEFORE UPDATE ON personal_todos
  FOR EACH ROW EXECUTE FUNCTION _touch_personal_todo_updated_at();

-- ============================================================
-- RLS: strictly owner-only — no role bypass
-- ============================================================

ALTER TABLE personal_todos ENABLE ROW LEVEL SECURITY;

-- One FOR ALL policy covers SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "personal_todos_owner_only" ON personal_todos
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

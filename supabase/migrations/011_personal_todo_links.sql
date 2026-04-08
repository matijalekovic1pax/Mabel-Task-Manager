-- ============================================================
-- 011_personal_todo_links.sql
-- Saved links attached to a personal todo (docs, tickets,
-- Figma files, etc.).  Private — owner-only via parent join.
-- ============================================================

CREATE TABLE IF NOT EXISTS personal_todo_links (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id     UUID         NOT NULL REFERENCES personal_todos(id) ON DELETE CASCADE,
  url         TEXT         NOT NULL CHECK (char_length(trim(url)) > 0),
  label       TEXT,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS personal_todo_links_todo_id_idx
  ON personal_todo_links (todo_id, created_at ASC);

ALTER TABLE personal_todo_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personal_todo_links_owner_only" ON personal_todo_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM personal_todos
      WHERE id = personal_todo_links.todo_id
        AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM personal_todos
      WHERE id = personal_todo_links.todo_id
        AND user_id = auth.uid()
    )
  );

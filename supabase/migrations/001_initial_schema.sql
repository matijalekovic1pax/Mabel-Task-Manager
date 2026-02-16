-- ============================================================
-- Mabel Task Manager — Initial Schema
-- ============================================================

-- Custom Enums
CREATE TYPE task_category AS ENUM (
  'financial',
  'project',
  'hr_operations',
  'client_relations',
  'pr_marketing',
  'administrative'
);

CREATE TYPE task_priority AS ENUM ('urgent', 'high', 'normal', 'low');

CREATE TYPE task_status AS ENUM (
  'pending',
  'in_review',
  'approved',
  'rejected',
  'needs_more_info',
  'deferred',
  'delegated',
  'resolved'
);

CREATE TYPE user_role AS ENUM ('ceo', 'team_member');

CREATE TYPE notification_type AS ENUM (
  'task_submitted',
  'task_resolved',
  'needs_more_info',
  'info_provided',
  'task_delegated',
  'task_updated',
  'comment_added',
  'deadline_approaching',
  'task_overdue'
);

-- ============================================================
-- TABLES
-- ============================================================

-- Profiles (extends auth.users)
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'team_member',
  avatar_url  TEXT,
  department  TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_is_active ON public.profiles(is_active);

-- Allowed Emails (whitelist for Google Workspace users)
CREATE TABLE public.allowed_emails (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  role       user_role NOT NULL DEFAULT 'team_member',
  added_by   UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks
CREATE TABLE public.tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  description      TEXT NOT NULL CHECK (char_length(description) >= 10),
  category         task_category NOT NULL,
  priority         task_priority NOT NULL DEFAULT 'normal',
  status           task_status NOT NULL DEFAULT 'pending',
  submitted_by     UUID NOT NULL REFERENCES public.profiles(id),
  resolved_by      UUID REFERENCES public.profiles(id),
  assigned_to      UUID REFERENCES public.profiles(id),
  delegation_note  TEXT,
  deadline         TIMESTAMPTZ,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolution_note  TEXT,
  is_archived      BOOLEAN NOT NULL DEFAULT false,
  reference_number TEXT UNIQUE
);

CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_priority ON public.tasks(priority);
CREATE INDEX idx_tasks_category ON public.tasks(category);
CREATE INDEX idx_tasks_submitted_by ON public.tasks(submitted_by);
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_tasks_deadline ON public.tasks(deadline) WHERE deadline IS NOT NULL;
CREATE INDEX idx_tasks_submitted_at ON public.tasks(submitted_at DESC);
CREATE INDEX idx_tasks_status_priority ON public.tasks(status, priority);

-- Task Comments
CREATE TABLE public.task_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES public.profiles(id),
  content    TEXT NOT NULL CHECK (char_length(content) >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_task_id ON public.task_comments(task_id);
CREATE INDEX idx_comments_created_at ON public.task_comments(task_id, created_at);

-- Task Attachments
CREATE TABLE public.task_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by  UUID NOT NULL REFERENCES public.profiles(id),
  file_name    TEXT NOT NULL,
  file_size    BIGINT NOT NULL,
  file_type    TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachments_task_id ON public.task_attachments(task_id);

-- Notifications
CREATE TABLE public.notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id),
  type         notification_type NOT NULL,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  task_id      UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications(recipient_id) WHERE is_read = false;

-- ============================================================
-- SEQUENCES & TRIGGERS
-- ============================================================

-- Auto-generate task reference numbers (MTM-0001, MTM-0002, ...)
CREATE SEQUENCE task_reference_seq START 1;

CREATE OR REPLACE FUNCTION generate_task_reference()
RETURNS TRIGGER AS $$
BEGIN
  NEW.reference_number := 'MTM-' || LPAD(nextval('task_reference_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_task_reference
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION generate_task_reference();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on new user signup (if email is in allowed_emails)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  allowed_role user_role;
BEGIN
  SELECT role INTO allowed_role
  FROM public.allowed_emails
  WHERE email = NEW.email;

  IF allowed_role IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, full_name, role, avatar_url)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
      allowed_role,
      NEW.raw_user_meta_data->>'avatar_url'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- TASKS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'ceo'
    )
    OR submitted_by = auth.uid()
    OR assigned_to = auth.uid()
  );

CREATE POLICY "tasks_insert"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_active = true
    )
  );

CREATE POLICY "tasks_update"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'ceo'
    )
    OR (
      submitted_by = auth.uid()
      AND status IN ('pending', 'needs_more_info')
    )
    OR (
      assigned_to = auth.uid()
      AND status = 'delegated'
    )
  );

-- TASK COMMENTS
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select"
  ON public.task_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_comments.task_id
      AND (
        tasks.submitted_by = auth.uid()
        OR tasks.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'ceo'
        )
      )
    )
  );

CREATE POLICY "comments_insert"
  ON public.task_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_comments.task_id
      AND (
        tasks.submitted_by = auth.uid()
        OR tasks.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'ceo'
        )
      )
    )
  );

-- TASK ATTACHMENTS
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_select"
  ON public.task_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_attachments.task_id
      AND (
        tasks.submitted_by = auth.uid()
        OR tasks.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'ceo'
        )
      )
    )
  );

CREATE POLICY "attachments_insert"
  ON public.task_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_attachments.task_id
      AND (
        tasks.submitted_by = auth.uid()
        OR tasks.assigned_to = auth.uid()
      )
    )
  );

-- NOTIFICATIONS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- ALLOWED EMAILS
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allowed_emails_ceo_select"
  ON public.allowed_emails FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'ceo'
    )
  );

CREATE POLICY "allowed_emails_ceo_insert"
  ON public.allowed_emails FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'ceo'
    )
  );

CREATE POLICY "allowed_emails_ceo_delete"
  ON public.allowed_emails FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'ceo'
    )
  );

-- ============================================================
-- STORAGE
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', false);

CREATE POLICY "task_attachments_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'task-attachments');

CREATE POLICY "task_attachments_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'task-attachments');

CREATE POLICY "task_attachments_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'task-attachments');

-- ============================================================
-- REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;

-- Add optional file link column to tasks (for Dropbox, Google Drive, etc.)
ALTER TABLE public.tasks ADD COLUMN file_link TEXT;

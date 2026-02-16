import { supabase } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

// ---------------------------------------------------------------------------
// Activity item types
// ---------------------------------------------------------------------------

type ActorProfile = Pick<Profile, 'full_name' | 'avatar_url'>
type TaskRef = { reference_number: string; title: string }

export type ActivityEvent = {
  type: 'event'
  id: string
  task_id: string
  created_at: string
  actor: ActorProfile
  task: TaskRef
  action: string
  from_status: string
  to_status: string
  note: string | null
}

export type ActivityComment = {
  type: 'comment'
  id: string
  task_id: string
  created_at: string
  author: ActorProfile
  task: TaskRef
  content: string
}

export type ActivityItem = ActivityEvent | ActivityComment

// ---------------------------------------------------------------------------
// Fetch the activity feed (task_events + task_comments merged)
// RLS handles scoping: CEO sees all, team members see their own tasks.
// ---------------------------------------------------------------------------

export async function getActivityFeed(limit = 50): Promise<ActivityItem[]> {
  const [eventsResult, commentsResult] = await Promise.all([
    supabase
      .from('task_events')
      .select(
        '*, actor:profiles!task_events_actor_id_fkey(full_name, avatar_url), task:tasks!task_events_task_id_fkey(reference_number, title)',
      )
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('task_comments')
      .select(
        '*, author:profiles!task_comments_author_id_fkey(full_name, avatar_url), task:tasks!task_comments_task_id_fkey(reference_number, title)',
      )
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  if (eventsResult.error) throw eventsResult.error
  if (commentsResult.error) throw commentsResult.error

  const events: ActivityItem[] = (eventsResult.data ?? []).map((e: Record<string, unknown>) => ({
    type: 'event' as const,
    id: e.id as string,
    task_id: e.task_id as string,
    created_at: e.created_at as string,
    actor: e.actor as ActorProfile,
    task: e.task as TaskRef,
    action: e.action as string,
    from_status: e.from_status as string,
    to_status: e.to_status as string,
    note: e.note as string | null,
  }))

  const comments: ActivityItem[] = (commentsResult.data ?? []).map((c: Record<string, unknown>) => ({
    type: 'comment' as const,
    id: c.id as string,
    task_id: c.task_id as string,
    created_at: c.created_at as string,
    author: c.author as ActorProfile,
    task: c.task as TaskRef,
    content: c.content as string,
  }))

  return [...events, ...comments]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Get recent activity count (for the bell badge)
// ---------------------------------------------------------------------------

export async function getRecentActivityCount(sinceMinutes = 60): Promise<number> {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString()

  const { count, error } = await supabase
    .from('task_events')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', since)

  if (error) throw error
  return count ?? 0
}

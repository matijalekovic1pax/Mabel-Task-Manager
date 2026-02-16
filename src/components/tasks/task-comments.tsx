import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { addComment } from '@/lib/services/comments'
import { transitionTask } from '@/lib/services/tasks'
import { formatRelativeTime } from '@/lib/utils/format'
import { useAuth } from '@/contexts/auth-context'
import type { TaskComment, Profile, TaskStatus } from '@/lib/types'
import { Loader2, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'

type CommentWithAuthor = TaskComment & { author: Profile }

export function TaskComments({
  taskId,
  taskSubmittedBy,
  taskStatus,
  comments,
  onCommentAdded,
  readOnly = false,
}: {
  taskId: string
  taskSubmittedBy: string
  taskStatus: TaskStatus
  comments: CommentWithAuthor[]
  onCommentAdded: () => void
  readOnly?: boolean
}) {
  const { profile } = useAuth()
  const formRef = useRef<HTMLFormElement>(null)
  const [loading, setLoading] = useState(false)
  const [providingInfo, setProvidingInfo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canProvideInfo =
    profile?.id === taskSubmittedBy && taskStatus === 'needs_more_info'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!profile) return

    const formData = new FormData(e.currentTarget)
    const content = formData.get('content') as string
    if (!content.trim()) return

    setLoading(true)
    setError(null)

    try {
      await addComment(taskId, content, profile.id)
      formRef.current?.reset()
      toast.success('Comment added')
      onCommentAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment')
    } finally {
      setLoading(false)
    }
  }

  async function handleProvideInfo() {
    if (!profile || !canProvideInfo) return

    // Use the comment textarea content as the transition note
    const content = formRef.current
      ? (new FormData(formRef.current).get('content') as string)
      : ''
    const note = content?.trim() || 'Additional information provided by submitter.'

    setProvidingInfo(true)
    setError(null)

    try {
      // If the user typed a comment, also post it as a comment
      if (content?.trim()) {
        await addComment(taskId, content.trim(), profile.id)
      }
      await transitionTask(taskId, 'provide_info', { note })
      formRef.current?.reset()
      toast.success('Task returned to CEO review queue')
      onCommentAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to provide info')
    } finally {
      setProvidingInfo(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />Comments ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {comments.length > 0 && (
          <div className="space-y-4">
            {comments.map((comment) => (
              <div key={comment.id}>
                <div className="mb-1 flex items-center gap-2">
                  {comment.author.avatar_url ? (
                    <img src={comment.author.avatar_url} alt={comment.author.full_name} className="h-6 w-6 rounded-full" />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {comment.author.full_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium">{comment.author.full_name}</span>
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(comment.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap pl-8 text-sm">{comment.content}</p>
              </div>
            ))}
            <Separator />
          </div>
        )}
        {!readOnly && (
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <Textarea name="content" placeholder="Add a comment..." required rows={2} />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={loading || providingInfo}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Comment
              </Button>
              {canProvideInfo && (
                <Button type="button" size="sm" variant="secondary" disabled={loading || providingInfo} onClick={handleProvideInfo}>
                  {providingInfo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Provide Requested Info
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

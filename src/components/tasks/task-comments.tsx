import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { addComment } from '@/lib/services/comments'
import { formatRelativeTime } from '@/lib/utils/format'
import { useAuth } from '@/contexts/auth-context'
import type { TaskComment, Profile } from '@/lib/types'
import { Loader2, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'

type CommentWithAuthor = TaskComment & { author: Profile }

export function TaskComments({
  taskId,
  taskSubmittedBy,
  taskStatus,
  comments,
  onCommentAdded,
}: {
  taskId: string
  taskSubmittedBy: string
  taskStatus: string
  comments: CommentWithAuthor[]
  onCommentAdded: () => void
}) {
  const { profile } = useAuth()
  const formRef = useRef<HTMLFormElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
                <div className="flex items-center gap-2 mb-1">
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
                <p className="text-sm pl-8 whitespace-pre-wrap">{comment.content}</p>
              </div>
            ))}
            <Separator />
          </div>
        )}
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <Textarea name="content" placeholder="Add a comment..." required rows={2} />
          <Button type="submit" size="sm" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Comment
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

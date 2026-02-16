import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldX } from 'lucide-react'

export function AccessDeniedPage() {
  const { signOut } = useAuth()
  const [searchParams] = useSearchParams()
  const isInactive = searchParams.get('reason') === 'inactive'

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldX className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>
            {isInactive
              ? 'Your account is currently inactive. Contact an administrator to reactivate your access.'
              : 'Your email is not authorized to access the Mabel Task Manager. Please contact your administrator to be added.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={signOut}>Sign out and try another account</Button>
        </CardContent>
      </Card>
    </div>
  )
}

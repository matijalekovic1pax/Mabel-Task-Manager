import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { hasAdminAccess } from '@/lib/utils/roles'
import { ProfileForm } from '@/components/settings/profile-form'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Shield, LogOut, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function SettingsPage() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const isAdmin = hasAdminAccess(profile?.role)

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to sign out')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <ProfileForm />

      {/* Mobile navigation — pages reachable via sidebar on desktop */}
      <div className="md:hidden space-y-3">
        {isAdmin && (
          <Card>
            <CardContent className="p-0 divide-y">
              <Link
                to="/admin"
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-500">
                  <Shield className="h-5 w-5" />
                </div>
                <span className="flex-1 text-sm font-medium">Admin Dashboard</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                to="/settings/team"
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-pink-50 text-pink-500">
                  <Users className="h-5 w-5" />
                </div>
                <span className="flex-1 text-sm font-medium">Team Management</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>
        )}

        <Button
          variant="outline"
          className="w-full justify-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
          disabled={signingOut}
          onClick={handleSignOut}
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          Sign Out
        </Button>
      </div>

      {/* Desktop sign out — less prominent since sidebar has it */}
      <div className="hidden md:block">
        <Button
          variant="ghost"
          className="gap-2 text-muted-foreground hover:text-red-600"
          disabled={signingOut}
          onClick={handleSignOut}
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          Sign Out
        </Button>
      </div>
    </div>
  )
}

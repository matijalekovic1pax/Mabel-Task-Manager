import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DEPARTMENTS } from '@/lib/utils/constants'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function ProfileForm() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!profile) return

    const formData = new FormData(e.currentTarget)
    const full_name = formData.get('full_name') as string
    const department = formData.get('department') as string

    setLoading(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name, department: department === 'none' ? null : department })
        .eq('id', profile.id)

      if (error) throw error
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  if (!profile) return null

  return (
    <Card>
      <CardHeader><CardTitle>Profile Settings</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={profile.email} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input id="full_name" name="full_name" defaultValue={profile.full_name} required />
          </div>
          <div className="space-y-2">
            <Label>Department</Label>
            <Select name="department" defaultValue={profile.department ?? 'none'}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Changes
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

import { supabase } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Get all team members (all profiles)
// ---------------------------------------------------------------------------

export async function getTeamMembers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true })

  if (error) throw error
  return data ?? []
}

// ---------------------------------------------------------------------------
// Get only active team members
// ---------------------------------------------------------------------------

export async function getActiveTeamMembers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('is_active', true)
    .order('full_name', { ascending: true })

  if (error) throw error
  return data ?? []
}

// ---------------------------------------------------------------------------
// Get the allow-list of emails permitted to sign up
// ---------------------------------------------------------------------------

export async function getAllowedEmails() {
  const { data, error } = await supabase
    .from('allowed_emails')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// ---------------------------------------------------------------------------
// Add an email to the allow-list
// ---------------------------------------------------------------------------

export async function addAllowedEmail(
  email: string,
  role: 'ceo' | 'team_member' | 'super_admin',
  addedBy: string,
) {
  const { data, error } = await supabase
    .from('allowed_emails')
    .insert({
      email: email.toLowerCase().trim(),
      role,
      added_by: addedBy,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Remove an email from the allow-list
// ---------------------------------------------------------------------------

export async function removeAllowedEmail(emailId: string) {
  const { data, error } = await supabase
    .from('allowed_emails')
    .delete()
    .eq('id', emailId)
    .select('id')
    .limit(1)

  if (error) throw error

  if (!data || data.length === 0) {
    throw new Error('Delete was blocked. You may not have permission to remove this user.')
  }

  return data[0]
}

// ---------------------------------------------------------------------------
// Toggle a team member's active status
// ---------------------------------------------------------------------------

export async function toggleMemberActive(
  memberId: string,
  isActive: boolean,
) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', memberId)
    .select()
    .single()

  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Update a team member's role
// ---------------------------------------------------------------------------

export async function updateMemberRole(
  memberId: string,
  role: 'ceo' | 'team_member' | 'super_admin',
) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', memberId)
    .select()
    .single()

  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Update the role for an allowed email entry
// ---------------------------------------------------------------------------

export async function updateAllowedEmailRole(
  emailId: string,
  role: 'ceo' | 'team_member' | 'super_admin',
) {
  const { data, error } = await supabase
    .from('allowed_emails')
    .update({ role })
    .eq('id', emailId)
    .select()
    .single()

  if (error) throw error
  return data
}

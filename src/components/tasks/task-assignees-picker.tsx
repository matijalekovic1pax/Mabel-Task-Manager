import { useState } from 'react'
import { Check, ChevronsUpDown, X, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { Profile } from '@/lib/types'

interface TaskAssigneesPickerProps {
  members: Profile[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  excludeIds?: string[]
  placeholder?: string
}

export function TaskAssigneesPicker({
  members,
  selectedIds,
  onChange,
  excludeIds = [],
  placeholder = 'Assign to people...',
}: TaskAssigneesPickerProps) {
  const [open, setOpen] = useState(false)

  const available = members.filter((m) => !excludeIds.includes(m.id) && m.is_active)
  const selected = members.filter((m) => selectedIds.includes(m.id))

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  function remove(id: string) {
    onChange(selectedIds.filter((s) => s !== id))
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="text-muted-foreground">
              {selectedIds.length === 0
                ? placeholder
                : `${selectedIds.length} person${selectedIds.length > 1 ? 's' : ''} selected`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search team members..." />
            <CommandList>
              <CommandEmpty>No team members found.</CommandEmpty>
              <CommandGroup>
                {available.map((member) => {
                  const isSelected = selectedIds.includes(member.id)
                  return (
                    <CommandItem
                      key={member.id}
                      value={`${member.full_name} ${member.email}`}
                      onSelect={() => toggle(member.id)}
                    >
                      <div className="flex flex-1 items-center gap-2">
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt={member.full_name}
                            className="h-6 w-6 rounded-full"
                          />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-xs font-medium text-white">
                            {member.full_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm">{member.full_name}</p>
                          {member.department && (
                            <p className="truncate text-xs text-muted-foreground">{member.department}</p>
                          )}
                        </div>
                      </div>
                      <Check
                        className={cn('ml-auto h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')}
                      />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected assignees as chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((member) => (
            <span
              key={member.id}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium"
            >
              {member.avatar_url ? (
                <img src={member.avatar_url} alt={member.full_name} className="h-4 w-4 rounded-full" />
              ) : (
                <User className="h-3 w-3 text-muted-foreground" />
              )}
              {member.full_name}
              <button
                type="button"
                onClick={() => remove(member.id)}
                className="ml-0.5 rounded-full text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${member.full_name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

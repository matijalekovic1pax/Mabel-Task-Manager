import { DollarSign, FolderKanban, Users, Handshake, Megaphone, ClipboardList } from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/utils/constants'
import type { TaskCategory } from '@/lib/types'
import { cn } from '@/lib/utils'

const iconMap = {
  DollarSign,
  FolderKanban,
  Users,
  Handshake,
  Megaphone,
  ClipboardList,
}

const colorMap: Record<TaskCategory, string> = {
  financial:        'text-emerald-600',
  project:          'text-orange-600',
  hr_operations:    'text-rose-600',
  client_relations: 'text-amber-600',
  pr_marketing:     'text-rose-500',
  administrative:   'text-stone-500',
}

const bgMap: Record<TaskCategory, string> = {
  financial:        'bg-emerald-100 text-emerald-600',
  project:          'bg-orange-100 text-orange-600',
  hr_operations:    'bg-rose-100 text-rose-600',
  client_relations: 'bg-amber-100 text-amber-600',
  pr_marketing:     'bg-rose-50 text-rose-500',
  administrative:   'bg-stone-100 text-stone-500',
}

export function TaskCategoryIcon({
  category,
  className = 'h-4 w-4',
  withBackground = false,
}: {
  category: TaskCategory
  className?: string
  withBackground?: boolean
}) {
  const config = CATEGORY_CONFIG[category]
  const Icon = iconMap[config.icon as keyof typeof iconMap]

  if (withBackground) {
    return (
      <div className={cn('inline-flex items-center justify-center rounded-lg p-2', bgMap[category])}>
        <Icon className={className} />
      </div>
    )
  }

  return <Icon className={cn(className, colorMap[category])} />
}

import { useSearchParams } from 'react-router-dom'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { CATEGORY_CONFIG, PRIORITY_CONFIG, STATUS_CONFIG } from '@/lib/utils/constants'
import { X, SlidersHorizontal } from 'lucide-react'
import { useCallback } from 'react'

export function TaskFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const updateParam = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (value && value !== 'all') {
          next.set(key, value)
        } else {
          next.delete(key)
        }
        return next
      })
    },
    [setSearchParams]
  )

  const FILTER_KEYS = ['search', 'status', 'category', 'priority']
  const clearFilters = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      FILTER_KEYS.forEach((key) => next.delete(key))
      return next
    })
  }
  const hasFilters = FILTER_KEYS.some((key) => searchParams.has(key))
  const filterCount = ['status', 'category', 'priority'].filter((k) => searchParams.has(k)).length

  return (
    <>
      {/* ── Mobile layout ── */}
      <div className="md:hidden flex items-center gap-2">
        <Input
          placeholder="Search tasks..."
          value={searchParams.get('search') ?? ''}
          onChange={(e) => updateParam('search', e.target.value)}
          className="flex-1 min-w-0"
        />
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="relative shrink-0 gap-1.5">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {filterCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[10px] font-medium text-white">
                  {filterCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="px-4 pb-8">
            <SheetHeader className="mb-5">
              <SheetTitle>Filter &amp; Sort</SheetTitle>
            </SheetHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={searchParams.get('status') ?? 'all'}
                  onValueChange={(v) => updateParam('status', v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={searchParams.get('category') ?? 'all'}
                  onValueChange={(v) => updateParam('category', v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Priority</label>
                <Select
                  value={searchParams.get('priority') ?? 'all'}
                  onValueChange={(v) => updateParam('priority', v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Sort By</label>
                <Select
                  value={searchParams.get('sort') ?? 'newest'}
                  onValueChange={(v) => updateParam('sort', v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="deadline">By Deadline</SelectItem>
                    <SelectItem value="priority">By Priority</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hasFilters && (
                <Button variant="outline" className="w-full" onClick={clearFilters}>
                  <X className="mr-2 h-4 w-4" />Clear Filters
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden md:flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search tasks..."
          value={searchParams.get('search') ?? ''}
          onChange={(e) => updateParam('search', e.target.value)}
          className="w-48"
        />
        <Select value={searchParams.get('status') ?? 'all'} onValueChange={(v) => updateParam('status', v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={searchParams.get('category') ?? 'all'} onValueChange={(v) => updateParam('category', v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={searchParams.get('priority') ?? 'all'} onValueChange={(v) => updateParam('priority', v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={searchParams.get('sort') ?? 'newest'} onValueChange={(v) => updateParam('sort', v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="deadline">By Deadline</SelectItem>
            <SelectItem value="priority">By Priority</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" />Clear
          </Button>
        )}
      </div>
    </>
  )
}

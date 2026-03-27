# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server with HMR
npm run build      # TypeScript compile + Vite production build
npm run lint       # Run ESLint
npm run preview    # Preview production build locally
```

There is no test framework configured in this project.

## Architecture

**1PAX Task Manager** is a React 19 SPA backed by Supabase (PostgreSQL + Auth).

- **Frontend:** React 19 + Vite + TypeScript, with React Router DOM for routing
- **Server state:** TanStack React Query (fetching, caching, mutations)
- **Global state:** React Context (`src/contexts/auth-context.tsx`) for auth/user
- **Backend:** Supabase (database, auth, realtime) — no custom server
- **Deployment:** Vercel (`vercel.json` rewrites all routes to `/index.html`)

### Two parallel task workflows

```
APPROVAL:  team_member → submits → CEO Queue → CEO approves/rejects/delegates/etc.
GENERAL:   anyone → creates (task_type='general') → assigns to multiple people → assignees manage status
```

- Approval tasks use statuses: `pending`, `in_review`, `approved`, `rejected`, `needs_more_info`, `deferred`, `delegated`, `resolved`
- General tasks use statuses: `todo`, `in_progress`, `done`, `cancelled`
- General task status transitions go through the `update_general_task_status()` Supabase RPC
- Multiple assignees per general task via the `task_assignees` join table

### Key directories

- `src/pages/` — Route-level page components (`my-tasks.tsx` is the kanban-lite view for general tasks)
- `src/components/` — Feature components grouped by domain (`tasks/`, `admin/`, `notifications/`, `activity/`, `settings/`) plus `layout/` and `ui/`
- `src/components/ui/` — Shadcn/ui component library (Radix UI based, pre-built and mostly untouched)
- `src/components/tasks/task-assignees-picker.tsx` — Multi-select combobox for general task assignees
- `src/components/layout/role-switcher.tsx` — Admin role-preview UI (super_admin only)
- `src/lib/services/` — Supabase API calls, one file per domain (tasks, team, activity, comments, notifications)
- `src/lib/types/` — Shared TypeScript types
- `src/lib/validations/` — Zod schemas for form/data validation
- `src/contexts/` — React context providers
- `supabase/migrations/` — Database schema migrations (005 adds general tasks)

### Auth, roles & the role switcher

`AuthContext` manages the auth state machine with states: `loading`, `unauthenticated`, `authenticated`, `access_denied`, `session_expired`. Auth uses Google OAuth via Supabase. Roles are defined in the `profiles` table: `ceo`, `team_member`, `super_admin`.

`AuthContext` also exposes:
- `effectiveRole` — the role the UI uses for rendering decisions. For `super_admin` this may be overridden by `viewAsRole`.
- `viewAsRole` / `setViewAsRole` — lets a `super_admin` preview any other role's UI without changing DB permissions. Persisted to `localStorage` key `1pax_view_as_role`. The amber banner (`RoleSwitcherBanner`) in `AppLayout` appears when active.
- All role-gated UI must use `effectiveRole`, not `profile.role`. Actual DB writes always use the real role (RLS is enforced server-side).

The `ProtectedRoute` component enforces authorization. Real `super_admin` always bypasses `requireRole` checks regardless of `viewAsRole`.

### Environment variables

Vite exposes env vars prefixed with `VITE_` or `SUPABASE_`. Required variables (see `.env.example`):

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

### Path aliases

`@/*` maps to `src/*` (configured in `tsconfig.app.json` and `vite.config.ts`).

### UI conventions

- Tailwind CSS 4 for styling
- Shadcn/ui (New York style) for base components — add new shadcn components with `npx shadcn@latest add <component>`
- `clsx` + `tailwind-merge` via `cn()` utility from `src/lib/utils`
- `sonner` for toast notifications
- `lucide-react` for icons

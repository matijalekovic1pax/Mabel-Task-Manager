# 1PAX Task Manager MCP

This MCP server lets an AI client read the task manager directly from Supabase and ingest the work items you need help with.

It is intentionally read-only. It exposes task and personal todo context, but does not create, update, delete, or transition records.

## Tools

- `get_help_context` - focused digest of open/relevant tasks and personal todos for one profile
- `list_tasks` - list approval/general tasks by scope, status, priority, search, and type
- `get_task` - load one task with comments, events, assignees, and attachment metadata
- `list_personal_todos` - list private todos for the configured profile
- `get_personal_todo` - load one private todo with checklist items and links
- `search_work_items` - search visible tasks and private todos together
- `resolve_profile` - verify which active profile the MCP server is scoped to
- `task_manager_mcp_health` - check local configuration without reading task data

## Environment

Add these to `.env.local` or to your MCP client config:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
TASK_MANAGER_MCP_PROFILE_EMAIL=you@example.com
```

`TASK_MANAGER_MCP_PROFILE_ID` can be used instead of email.
If neither is set, the server falls back to the first active `super_admin`, then CEO, then active team member profile.

The service-role key is powerful because it bypasses Supabase RLS. Keep this server local/trusted. For the tightest scoping, set `TASK_MANAGER_MCP_PROFILE_EMAIL` or `TASK_MANAGER_MCP_PROFILE_ID`; otherwise the default active-profile fallback above is used.

## Run

```bash
npm run --silent mcp
```

## MCP Client Config

Use this shape for clients that accept JSON MCP server definitions:

```json
{
  "mcpServers": {
    "1pax-task-manager": {
      "command": "node",
      "args": [
        "/Users/macbookpro/Documents/task-manager/mcp/task-manager-server.js"
      ],
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-supabase-service-role-key",
        "TASK_MANAGER_MCP_PROFILE_EMAIL": "you@example.com"
      }
    }
  }
}
```

Once connected, ask the client to call `get_help_context` first. That gives it a prioritized working set of tasks, todos, blockers, overdue items, and review-ready items.

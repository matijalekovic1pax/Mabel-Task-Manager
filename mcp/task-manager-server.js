#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

loadEnvFiles(['.env', '.env.local'])

const TASK_SELECT = `
  id,
  title,
  description,
  category,
  priority,
  status,
  submitted_by,
  resolved_by,
  assigned_to,
  delegation_note,
  deadline,
  submitted_at,
  resolved_at,
  updated_at,
  resolution_note,
  is_archived,
  reference_number,
  file_link,
  task_type,
  visibility,
  submitter:profiles!tasks_submitted_by_fkey(id,email,full_name,role,avatar_url,department,is_active),
  assignee:profiles!tasks_assigned_to_fkey(id,email,full_name,role,avatar_url,department,is_active),
  assignees:task_assignees(
    id,
    assignee_id,
    assigned_by,
    assigned_at,
    assignee:profiles!task_assignees_assignee_id_fkey(id,email,full_name,role,avatar_url,department,is_active)
  )
`

const TASK_DETAIL_SELECT = `
  ${TASK_SELECT},
  resolver:profiles!tasks_resolved_by_fkey(id,email,full_name,role,avatar_url,department,is_active),
  comments:task_comments(
    id,
    task_id,
    author_id,
    content,
    created_at,
    author:profiles!task_comments_author_id_fkey(id,email,full_name,role,avatar_url,department,is_active)
  ),
  attachments:task_attachments(id,task_id,uploaded_by,file_name,file_size,file_type,created_at),
  events:task_events(
    id,
    task_id,
    actor_id,
    action,
    from_status,
    to_status,
    note,
    created_at,
    actor:profiles!task_events_actor_id_fkey(id,email,full_name,role,avatar_url,department,is_active)
  )
`

const TODO_SELECT = `
  *,
  items:personal_todo_items(id,todo_id,text,is_done,sort_order,created_at),
  links:personal_todo_links(id,todo_id,url,label,sort_order,created_at)
`

const FINAL_TASK_STATUSES = new Set(['approved', 'rejected', 'resolved', 'done', 'cancelled'])
const OPEN_APPROVAL_STATUSES = ['pending', 'in_review', 'needs_more_info', 'deferred', 'delegated']
const OPEN_GENERAL_STATUSES = ['todo', 'in_progress', 'in_review', 'blocked']
const PRIORITY_SCORE = { urgent: 0, high: 1, normal: 2, low: 3 }
const DEFAULT_LIMIT = 40
const MAX_LIMIT = 100
const QUERY_LIMIT = 500

let supabase

const ProfileArgs = z.object({
  userId: z.string().uuid().optional(),
  userEmail: z.string().email().optional(),
})

const ListTasksArgs = ProfileArgs.extend({
  scope: z.enum([
    'mine',
    'assigned_to_me',
    'submitted_by_me',
    'approval_queue',
    'company',
    'all',
  ]).default('mine'),
  taskType: z.enum(['approval', 'general', 'all']).default('all'),
  statuses: z.array(z.string()).optional(),
  priority: z.enum(['urgent', 'high', 'normal', 'low']).optional(),
  search: z.string().min(1).optional(),
  includeClosed: z.boolean().default(false),
  includeArchived: z.boolean().default(false),
  sortBy: z.enum(['helpfulness', 'deadline', 'priority', 'submitted_at', 'updated_at']).default('helpfulness'),
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.number().int().min(0).default(0),
})

const GetTaskArgs = z.object({
  id: z.string().uuid().optional(),
  referenceNumber: z.string().min(1).optional(),
}).refine((args) => Boolean(args.id || args.referenceNumber), {
  message: 'Provide either id or referenceNumber.',
})

const ListTodosArgs = ProfileArgs.extend({
  statuses: z.array(z.enum(['todo', 'in_progress', 'done'])).optional(),
  priority: z.enum(['urgent', 'high', 'normal', 'low']).optional(),
  search: z.string().min(1).optional(),
  includeDone: z.boolean().default(false),
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.number().int().min(0).default(0),
})

const GetTodoArgs = z.object({
  id: z.string().uuid(),
})

const HelpContextArgs = ProfileArgs.extend({
  includeCompanyTasks: z.boolean().default(false),
  includeDoneTodos: z.boolean().default(false),
  limitPerSection: z.number().int().min(1).max(50).default(20),
})

const SearchArgs = ProfileArgs.extend({
  query: z.string().min(1),
  includeClosed: z.boolean().default(false),
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
})

const server = new McpServer({
  name: '1pax-task-manager',
  version: '0.1.0',
})

server.registerTool(
  'task_manager_mcp_health',
  {
    title: 'Task Manager MCP Health',
    description: 'Check MCP configuration without querying private task data.',
    inputSchema: z.object({}),
  },
  async () => jsonResult({
    ok: true,
    configured: {
      supabaseUrl: Boolean(getEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')),
      supabaseKey: Boolean(getSupabaseKey()),
      profileId: Boolean(process.env.TASK_MANAGER_MCP_PROFILE_ID),
      profileEmail: Boolean(process.env.TASK_MANAGER_MCP_PROFILE_EMAIL),
    },
    tools: [
      'get_help_context',
      'list_tasks',
      'get_task',
      'list_personal_todos',
      'get_personal_todo',
      'search_work_items',
      'resolve_profile',
    ],
  }, 'MCP server is running.'),
)

server.registerTool(
  'resolve_profile',
  {
    title: 'Resolve Task Manager Profile',
    description: 'Resolve the configured user profile or an explicit profile by ID/email.',
    inputSchema: ProfileArgs,
  },
  async (args) => {
    const profile = await requireProfile(args)
    return jsonResult({ profile: sanitizeProfile(profile) }, `Resolved ${profile.full_name}.`)
  },
)

server.registerTool(
  'get_help_context',
  {
    title: 'Get Help Context',
    description: 'Return a focused digest of tasks and personal todos that likely need help for the configured user.',
    inputSchema: HelpContextArgs,
  },
  async (args) => {
    const context = await buildHelpContext(args)
    return jsonResult(context, context.summary)
  },
)

server.registerTool(
  'list_tasks',
  {
    title: 'List Tasks',
    description: 'List approval and general tasks visible or relevant to a profile.',
    inputSchema: ListTasksArgs,
  },
  async (args) => {
    const data = await listTasks(args)
    return jsonResult(data, `Found ${data.tasks.length} task(s).`)
  },
)

server.registerTool(
  'get_task',
  {
    title: 'Get Task',
    description: 'Load one task by ID or reference number, including comments, events, assignees, and attachment metadata.',
    inputSchema: GetTaskArgs,
  },
  async (args) => {
    const data = await getTask(args)
    return jsonResult(data, data.task ? `Loaded ${data.task.referenceNumber}.` : 'Task not found.')
  },
)

server.registerTool(
  'list_personal_todos',
  {
    title: 'List Personal Todos',
    description: 'List private personal todos for the configured user profile.',
    inputSchema: ListTodosArgs,
  },
  async (args) => {
    const data = await listPersonalTodos(args)
    return jsonResult(data, `Found ${data.todos.length} personal todo(s).`)
  },
)

server.registerTool(
  'get_personal_todo',
  {
    title: 'Get Personal Todo',
    description: 'Load one personal todo with checklist items and links.',
    inputSchema: GetTodoArgs,
  },
  async (args) => {
    const data = await getPersonalTodo(args.id)
    return jsonResult(data, data.todo ? `Loaded todo "${data.todo.title}".` : 'Todo not found.')
  },
)

server.registerTool(
  'search_work_items',
  {
    title: 'Search Work Items',
    description: 'Search across visible tasks and private personal todos for the configured user.',
    inputSchema: SearchArgs,
  },
  async (args) => {
    const data = await searchWorkItems(args)
    return jsonResult(data, `Found ${data.results.length} work item(s).`)
  },
)

server.registerResource(
  'help_context',
  'task-manager://help-context',
  {
    title: 'Task Manager Help Context',
    description: 'Focused JSON digest of tasks and todos that likely need help.',
    mimeType: 'application/json',
  },
  async (uri) => {
    const context = await buildHelpContext({})
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(context, null, 2),
      }],
    }
  },
)

server.registerResource(
  'open_work_items',
  'task-manager://open-work-items',
  {
    title: 'Open Work Items',
    description: 'Open relevant tasks and personal todos for the configured user.',
    mimeType: 'application/json',
  },
  async (uri) => {
    const profile = await requireProfile({})
    const [tasks, todos] = await Promise.all([
      listTasks({ scope: 'mine', includeClosed: false, includeArchived: false, limit: MAX_LIMIT, offset: 0 }),
      listPersonalTodos({ includeDone: false, limit: MAX_LIMIT, offset: 0 }),
    ])
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify({
          generatedAt: new Date().toISOString(),
          profile: sanitizeProfile(profile),
          tasks: tasks.tasks,
          personalTodos: todos.todos,
        }, null, 2),
      }],
    }
  },
)

async function buildHelpContext(args) {
  const profile = await requireProfile(args)
  const limit = clampLimit(args.limitPerSection ?? 20, 50)

  const [
    mine,
    todos,
    companyTasks,
    approvalQueue,
  ] = await Promise.all([
    listTasks({
      ...args,
      scope: 'mine',
      includeClosed: false,
      includeArchived: false,
      limit: MAX_LIMIT,
      offset: 0,
    }),
    listPersonalTodos({
      ...args,
      includeDone: args.includeDoneTodos ?? false,
      limit: MAX_LIMIT,
      offset: 0,
    }),
    args.includeCompanyTasks
      ? listTasks({
        ...args,
        scope: 'company',
        taskType: 'general',
        includeClosed: false,
        includeArchived: false,
        limit: MAX_LIMIT,
        offset: 0,
      })
      : Promise.resolve({ tasks: [] }),
    isAdmin(profile)
      ? listTasks({
        ...args,
        scope: 'approval_queue',
        taskType: 'approval',
        includeClosed: false,
        includeArchived: false,
        limit: MAX_LIMIT,
        offset: 0,
      })
      : Promise.resolve({ tasks: [] }),
  ])

  const allTasks = dedupeTasks([...mine.tasks, ...companyTasks.tasks, ...approvalQueue.tasks])
    .sort(compareByHelpfulness)

  const dueSoon = allTasks.filter((task) => task.deadline && isDueSoon(task.deadline)).slice(0, limit)
  const overdue = allTasks.filter((task) => task.deadline && isOverdue(task.deadline)).slice(0, limit)
  const blocked = allTasks.filter((task) => task.status === 'blocked').slice(0, limit)
  const needsInfo = allTasks.filter((task) => task.status === 'needs_more_info').slice(0, limit)
  const reviewReady = allTasks.filter((task) => task.status === 'in_review').slice(0, limit)

  const activeTodos = todos.todos
    .map((todo) => ({ ...todo, helpReason: inferTodoReason(todo) }))
    .sort(compareTodosByHelpfulness)

  return {
    generatedAt: new Date().toISOString(),
    profile: sanitizeProfile(profile),
    summary: [
      `${allTasks.length} open/relevant task(s)`,
      `${activeTodos.length} personal todo(s)`,
      overdue.length > 0 ? `${overdue.length} overdue task(s)` : null,
      blocked.length > 0 ? `${blocked.length} blocked task(s)` : null,
    ].filter(Boolean).join(', '),
    counts: {
      openTasks: allTasks.length,
      personalTodos: activeTodos.length,
      overdueTasks: overdue.length,
      dueSoonTasks: dueSoon.length,
      blockedTasks: blocked.length,
      needsInfoTasks: needsInfo.length,
      reviewReadyTasks: reviewReady.length,
    },
    sections: {
      highestPriorityTasks: allTasks.slice(0, limit),
      overdueTasks: overdue,
      dueSoonTasks: dueSoon,
      blockedTasks: blocked,
      needsInfoTasks: needsInfo,
      reviewReadyTasks: reviewReady,
      personalTodos: activeTodos.slice(0, limit),
    },
  }
}

async function listTasks(args) {
  const profile = await requireProfile(args)
  const tasks = await fetchTasksForScope(profile, args)
  const filtered = tasks
    .filter((task) => canProfileSeeTask(task, profile))
    .filter((task) => args.includeClosed || !FINAL_TASK_STATUSES.has(task.status))
    .filter((task) => args.taskType === 'all' || !args.taskType || task.task_type === args.taskType)
    .filter((task) => !args.statuses?.length || args.statuses.includes(task.status))
    .filter((task) => !args.priority || task.priority === args.priority)
    .filter((task) => matchesSearch(task, args.search))
    .map((task) => normalizeTask(task, profile))
    .sort(getTaskComparator(args.sortBy ?? 'helpfulness'))

  return {
    generatedAt: new Date().toISOString(),
    profile: sanitizeProfile(profile),
    scope: args.scope ?? 'mine',
    count: filtered.length,
    tasks: filtered.slice(args.offset ?? 0, (args.offset ?? 0) + clampLimit(args.limit)),
  }
}

async function fetchTasksForScope(profile, args) {
  const scope = args.scope ?? 'mine'

  if (scope === 'all') {
    requireAdmin(profile, scope)
    return queryTasks(args)
  }

  if (scope === 'approval_queue') {
    requireAdmin(profile, scope)
    return queryTasks({
      ...args,
      taskType: 'approval',
      statuses: args.statuses ?? OPEN_APPROVAL_STATUSES,
    })
  }

  if (scope === 'company') {
    return queryTasks({
      ...args,
      taskType: args.taskType === 'approval' ? 'approval' : 'general',
      visibility: 'company',
    })
  }

  if (scope === 'submitted_by_me') {
    return queryTasks({ ...args, submittedBy: profile.id })
  }

  if (scope === 'assigned_to_me') {
    const [approvalTasks, generalTasks] = await Promise.all([
      queryTasks({ ...args, assignedTo: profile.id, taskType: args.taskType === 'general' ? 'general' : 'all' }),
      queryAssignedGeneralTasks(profile.id, args),
    ])
    return dedupeRawTasks([...approvalTasks, ...generalTasks])
  }

  const [submitted, assignedApproval, assignedGeneral, adminQueue] = await Promise.all([
    queryTasks({ ...args, submittedBy: profile.id }),
    queryTasks({ ...args, assignedTo: profile.id }),
    queryAssignedGeneralTasks(profile.id, args),
    isAdmin(profile)
      ? queryTasks({ ...args, taskType: 'approval', statuses: args.statuses ?? OPEN_APPROVAL_STATUSES })
      : Promise.resolve([]),
  ])

  return dedupeRawTasks([...submitted, ...assignedApproval, ...assignedGeneral, ...adminQueue])
}

async function queryTasks(args) {
  let query = getSupabase()
    .from('tasks')
    .select(TASK_SELECT)
    .limit(QUERY_LIMIT)

  if (!args.includeArchived) {
    query = query.eq('is_archived', false)
  }

  if (args.taskType && args.taskType !== 'all') {
    query = query.eq('task_type', args.taskType)
  }

  if (args.visibility) {
    query = query.eq('visibility', args.visibility)
  }

  if (args.submittedBy) {
    query = query.eq('submitted_by', args.submittedBy)
  }

  if (args.assignedTo) {
    query = query.eq('assigned_to', args.assignedTo)
  }

  if (args.statuses?.length) {
    query = query.in('status', args.statuses)
  }

  if (args.priority) {
    query = query.eq('priority', args.priority)
  }

  query = query.order('updated_at', { ascending: false })

  const { data, error } = await query
  if (error) throw new Error(`Could not load tasks: ${error.message}`)
  return data ?? []
}

async function queryAssignedGeneralTasks(userId, args) {
  const { data: assignments, error: assignmentError } = await getSupabase()
    .from('task_assignees')
    .select('task_id')
    .eq('assignee_id', userId)
    .limit(QUERY_LIMIT)

  if (assignmentError) {
    throw new Error(`Could not load task assignments: ${assignmentError.message}`)
  }

  const taskIds = [...new Set((assignments ?? []).map((row) => row.task_id))]
  if (taskIds.length === 0) return []

  let query = getSupabase()
    .from('tasks')
    .select(TASK_SELECT)
    .in('id', taskIds)
    .limit(QUERY_LIMIT)

  if (!args.includeArchived) {
    query = query.eq('is_archived', false)
  }

  if (args.taskType && args.taskType !== 'all') {
    query = query.eq('task_type', args.taskType)
  }

  if (args.statuses?.length) {
    query = query.in('status', args.statuses)
  }

  if (args.priority) {
    query = query.eq('priority', args.priority)
  }

  const { data, error } = await query
  if (error) throw new Error(`Could not load assigned general tasks: ${error.message}`)
  return data ?? []
}

async function getTask(args) {
  const profile = await requireProfile({})
  let query = getSupabase().from('tasks').select(TASK_DETAIL_SELECT)

  if (args.id) {
    query = query.eq('id', args.id)
  } else {
    query = query.eq('reference_number', args.referenceNumber)
  }

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`Could not load task: ${error.message}`)
  if (!data || !canProfileSeeTask(data, profile)) {
    return { task: null }
  }

  return {
    profile: sanitizeProfile(profile),
    task: normalizeTaskDetail(data, profile),
  }
}

async function listPersonalTodos(args) {
  const profile = await requireProfile(args)
  const { data, error } = await getSupabase()
    .from('personal_todos')
    .select(TODO_SELECT)
    .eq('user_id', profile.id)
    .limit(QUERY_LIMIT)

  if (error) throw new Error(`Could not load personal todos: ${error.message}`)

  const filtered = (data ?? [])
    .filter((todo) => args.includeDone || todo.status !== 'done')
    .filter((todo) => !args.statuses?.length || args.statuses.includes(todo.status))
    .filter((todo) => !args.priority || todo.priority === args.priority)
    .filter((todo) => matchesTodoSearch(todo, args.search))
    .map(normalizeTodo)
    .sort(compareTodosByHelpfulness)

  return {
    generatedAt: new Date().toISOString(),
    profile: sanitizeProfile(profile),
    count: filtered.length,
    todos: filtered.slice(args.offset ?? 0, (args.offset ?? 0) + clampLimit(args.limit)),
  }
}

async function getPersonalTodo(id) {
  const profile = await requireProfile({})
  const { data, error } = await getSupabase()
    .from('personal_todos')
    .select(TODO_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Could not load personal todo: ${error.message}`)
  if (!data || data.user_id !== profile.id) {
    return { todo: null }
  }

  return {
    profile: sanitizeProfile(profile),
    todo: normalizeTodo(data),
  }
}

async function searchWorkItems(args) {
  const [tasks, todos] = await Promise.all([
    listTasks({
      ...args,
      scope: 'mine',
      search: args.query,
      includeClosed: args.includeClosed,
      includeArchived: false,
      limit: args.limit,
      offset: 0,
    }),
    listPersonalTodos({
      ...args,
      search: args.query,
      includeDone: args.includeClosed,
      limit: args.limit,
      offset: 0,
    }),
  ])

  const results = [
    ...tasks.tasks.map((task) => ({ kind: 'task', item: task })),
    ...todos.todos.map((todo) => ({ kind: 'personal_todo', item: todo })),
  ].slice(0, clampLimit(args.limit))

  return {
    generatedAt: new Date().toISOString(),
    profile: tasks.profile,
    query: args.query,
    count: results.length,
    results,
  }
}

async function requireProfile(args) {
  const profile = await resolveProfile(args)
  if (!profile) {
    throw new Error(
      'No active profile resolved. Set TASK_MANAGER_MCP_PROFILE_EMAIL or TASK_MANAGER_MCP_PROFILE_ID, or pass userEmail/userId.',
    )
  }
  return profile
}

async function resolveProfile(args = {}) {
  const userId = args.userId ?? process.env.TASK_MANAGER_MCP_PROFILE_ID
  const userEmail = args.userEmail ?? process.env.TASK_MANAGER_MCP_PROFILE_EMAIL

  if (!userId && !userEmail) return null

  let query = getSupabase()
    .from('profiles')
    .select('*')
    .eq('is_active', true)

  if (userId) {
    query = query.eq('id', userId)
  } else {
    query = query.ilike('email', userEmail)
  }

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`Could not resolve profile: ${error.message}`)
  return data
}

function getSupabase() {
  if (supabase) return supabase

  const supabaseUrl = getEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const supabaseKey = getSupabaseKey()

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL. Add it to .env.local or the MCP client env.')
  }

  if (!supabaseKey) {
    throw new Error(
      'Missing Supabase key. Set SUPABASE_SERVICE_ROLE_KEY for a trusted local MCP server, or TASK_MANAGER_MCP_SUPABASE_KEY.',
    )
  }

  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return supabase
}

function getSupabaseKey() {
  return getEnv('TASK_MANAGER_MCP_SUPABASE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
}

function getEnv(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name]
  }
  return undefined
}

function loadEnvFiles(files) {
  for (const file of files) {
    const absolutePath = path.join(repoRoot, file)
    if (!fs.existsSync(absolutePath)) continue

    const contents = fs.readFileSync(absolutePath, 'utf8')
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed)
      if (!match) continue

      const [, key, rawValue] = match
      if (process.env[key] !== undefined) continue

      process.env[key] = unquoteEnvValue(rawValue.trim())
    }
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function requireAdmin(profile, scope) {
  if (!isAdmin(profile)) {
    throw new Error(`The "${scope}" task scope is only available to ceo or super_admin profiles.`)
  }
}

function isAdmin(profile) {
  return profile.role === 'ceo' || profile.role === 'super_admin'
}

function canProfileSeeTask(task, profile) {
  if (isAdmin(profile)) return true

  if (task.task_type === 'general') {
    if (task.visibility === 'company') return true
    return task.submitted_by === profile.id || getAssigneeIds(task).includes(profile.id)
  }

  return task.submitted_by === profile.id || task.assigned_to === profile.id
}

function getAssigneeIds(task) {
  return (task.assignees ?? []).map((row) => row.assignee_id)
}

function normalizeTask(task, profile) {
  return {
    id: task.id,
    referenceNumber: task.reference_number,
    urlPath: `/tasks/${task.id}`,
    taskType: task.task_type,
    visibility: task.visibility,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    category: task.category,
    deadline: task.deadline,
    isOverdue: Boolean(task.deadline && isOverdue(task.deadline)),
    submittedAt: task.submitted_at,
    updatedAt: task.updated_at,
    resolvedAt: task.resolved_at,
    isArchived: task.is_archived,
    submitter: sanitizeProfile(task.submitter),
    assignee: sanitizeProfile(task.assignee),
    assignees: (task.assignees ?? []).map((row) => ({
      id: row.id,
      assignedAt: row.assigned_at,
      assignee: sanitizeProfile(row.assignee),
    })),
    fileLink: task.file_link,
    delegationNote: task.delegation_note,
    resolutionNote: task.resolution_note,
    helpReason: inferTaskReason(task, profile),
  }
}

function normalizeTaskDetail(task, profile) {
  return {
    ...normalizeTask(task, profile),
    resolver: sanitizeProfile(task.resolver),
    comments: (task.comments ?? [])
      .map((comment) => ({
        id: comment.id,
        author: sanitizeProfile(comment.author),
        content: comment.content,
        createdAt: comment.created_at,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    events: (task.events ?? [])
      .map((event) => ({
        id: event.id,
        actor: sanitizeProfile(event.actor),
        action: event.action,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        note: event.note,
        createdAt: event.created_at,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    attachments: (task.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      fileName: attachment.file_name,
      fileSize: attachment.file_size,
      fileType: attachment.file_type,
      uploadedBy: attachment.uploaded_by,
      createdAt: attachment.created_at,
    })),
  }
}

function normalizeTodo(todo) {
  return {
    id: todo.id,
    urlPath: `/my-todos/${todo.id}`,
    title: todo.title,
    description: todo.description,
    status: todo.status,
    priority: todo.priority,
    dueDate: todo.due_date,
    isOverdue: Boolean(todo.due_date && isOverdueDateOnly(todo.due_date)),
    createdAt: todo.created_at,
    updatedAt: todo.updated_at,
    items: (todo.items ?? [])
      .map((item) => ({
        id: item.id,
        text: item.text,
        isDone: item.is_done,
        sortOrder: item.sort_order,
        createdAt: item.created_at,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
    links: (todo.links ?? [])
      .map((link) => ({
        id: link.id,
        url: link.url,
        label: link.label,
        sortOrder: link.sort_order,
        createdAt: link.created_at,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
  }
}

function sanitizeProfile(profile) {
  if (!profile) return null
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    department: profile.department,
    isActive: profile.is_active,
  }
}

function inferTaskReason(task, profile) {
  const isCreator = task.submitted_by === profile.id
  const isAssignedApproval = task.assigned_to === profile.id
  const isGeneralAssignee = getAssigneeIds(task).includes(profile.id)

  if (task.deadline && isOverdue(task.deadline) && !FINAL_TASK_STATUSES.has(task.status)) {
    return 'Overdue'
  }

  if (task.status === 'blocked') {
    return 'Blocked'
  }

  if (task.status === 'needs_more_info' && isCreator) {
    return 'Needs more information from you'
  }

  if (task.status === 'delegated' && isAssignedApproval) {
    return 'Delegated to you'
  }

  if (task.status === 'in_review' && (isAdmin(profile) || isCreator)) {
    return 'Ready for review'
  }

  if (task.task_type === 'approval' && isAdmin(profile) && OPEN_APPROVAL_STATUSES.includes(task.status)) {
    return 'Approval queue item'
  }

  if (task.task_type === 'general' && isGeneralAssignee) {
    return 'Assigned general task'
  }

  if (isCreator) {
    return 'Created by you'
  }

  return 'Visible work item'
}

function inferTodoReason(todo) {
  if (todo.dueDate && todo.isOverdue) return 'Overdue personal todo'
  if (todo.status === 'in_progress') return 'Personal todo in progress'
  if (todo.priority === 'urgent' || todo.priority === 'high') return `${capitalize(todo.priority)} priority personal todo`
  return 'Personal todo'
}

function matchesSearch(task, search) {
  if (!search) return true
  const needle = search.toLowerCase()
  return [
    task.title,
    task.description,
    task.reference_number,
    task.status,
    task.priority,
    task.category,
    task.submitter?.full_name,
    task.assignee?.full_name,
    ...(task.assignees ?? []).map((row) => row.assignee?.full_name),
  ].some((value) => String(value ?? '').toLowerCase().includes(needle))
}

function matchesTodoSearch(todo, search) {
  if (!search) return true
  const needle = search.toLowerCase()
  return [
    todo.title,
    todo.description,
    todo.status,
    todo.priority,
    ...(todo.items ?? []).map((item) => item.text),
    ...(todo.links ?? []).flatMap((link) => [link.label, link.url]),
  ].some((value) => String(value ?? '').toLowerCase().includes(needle))
}

function getTaskComparator(sortBy) {
  if (sortBy === 'deadline') return compareTasksByDeadline
  if (sortBy === 'priority') return compareTasksByPriority
  if (sortBy === 'submitted_at') return (a, b) => b.submittedAt.localeCompare(a.submittedAt)
  if (sortBy === 'updated_at') return (a, b) => b.updatedAt.localeCompare(a.updatedAt)
  return compareByHelpfulness
}

function compareByHelpfulness(a, b) {
  const statusScore = taskStatusScore(a) - taskStatusScore(b)
  if (statusScore !== 0) return statusScore
  return compareTasksByDeadline(a, b) || compareTasksByPriority(a, b) || b.updatedAt.localeCompare(a.updatedAt)
}

function compareTasksByDeadline(a, b) {
  if (!a.deadline && !b.deadline) return 0
  if (!a.deadline) return 1
  if (!b.deadline) return -1
  return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
}

function compareTasksByPriority(a, b) {
  return (PRIORITY_SCORE[a.priority] ?? 99) - (PRIORITY_SCORE[b.priority] ?? 99)
}

function taskStatusScore(task) {
  if (task.isOverdue) return 0
  if (task.status === 'blocked') return 1
  if (task.status === 'needs_more_info') return 2
  if (task.status === 'in_review') return 3
  if (task.priority === 'urgent') return 4
  if (task.priority === 'high') return 5
  return 10
}

function compareTodosByHelpfulness(a, b) {
  const overdueScore = Number(!a.isOverdue) - Number(!b.isOverdue)
  if (overdueScore !== 0) return overdueScore
  const priorityScore = (PRIORITY_SCORE[a.priority] ?? 99) - (PRIORITY_SCORE[b.priority] ?? 99)
  if (priorityScore !== 0) return priorityScore
  if (!a.dueDate && !b.dueDate) return b.updatedAt.localeCompare(a.updatedAt)
  if (!a.dueDate) return 1
  if (!b.dueDate) return -1
  return a.dueDate.localeCompare(b.dueDate)
}

function dedupeTasks(tasks) {
  const seen = new Map()
  for (const task of tasks) {
    seen.set(task.id, task)
  }
  return Array.from(seen.values())
}

function dedupeRawTasks(tasks) {
  const seen = new Map()
  for (const task of tasks) {
    seen.set(task.id, task)
  }
  return Array.from(seen.values())
}

function isOverdue(value) {
  const deadline = new Date(value)
  if (Number.isNaN(deadline.getTime())) return false
  return deadline.getTime() < startOfToday().getTime()
}

function isDueSoon(value) {
  const deadline = new Date(value)
  if (Number.isNaN(deadline.getTime())) return false
  const today = startOfToday().getTime()
  const soon = today + 1000 * 60 * 60 * 24 * 7
  return deadline.getTime() >= today && deadline.getTime() <= soon
}

function isOverdueDateOnly(value) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return false
  const dueDate = new Date(year, month - 1, day)
  return dueDate.getTime() < startOfToday().getTime()
}

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function clampLimit(limit, fallback = MAX_LIMIT) {
  if (!Number.isFinite(limit)) return fallback
  return Math.max(1, Math.min(MAX_LIMIT, limit))
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function jsonResult(data, summary) {
  return {
    structuredContent: data,
    content: [{
      type: 'text',
      text: `${summary}\n\n${JSON.stringify(data, null, 2)}`,
    }],
  }
}

const transport = new StdioServerTransport()

server.connect(transport).catch((error) => {
  console.error('Task Manager MCP server failed to start:', error)
  process.exit(1)
})

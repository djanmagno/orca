export type FactoryTaskType = 'feature' | 'bug' | 'refactor' | 'docs' | 'chore'
export type FactoryRisk = 'low' | 'medium' | 'high' | 'critical'
export type FactoryTaskState =
  | 'RECEIVED'
  | 'SPEC'
  | 'PLAN'
  | 'AWAITING_APPROVAL'
  | 'IMPLEMENTING'
  | 'QA'
  | 'REVIEW'
  | 'PR_OPEN'
  | 'DOCS'
  | 'DONE'
  | 'NEEDS_INPUT'
  | 'FAILED'
  | 'CANCELLED'

export type FactoryTask = {
  id: string
  title: string
  body: string
  type: FactoryTaskType
  risk: FactoryRisk
  state: FactoryTaskState
  repo: string | null
  issueNumber: number | null
  prNumber: number | null
  branch: string | null
  worktree: string | null
  scope: string[]
  outOfScope: string[]
  acceptanceCriteria: string[]
  questions: string[]
  artifacts: Record<string, string>
  attempts: number
  qaLoopCount?: number
  reviewLoopCount?: number
  pendingImplementationRoles?: string[]
  currentSlice: number
  error: string | null
  createdAt: string
  updatedAt: string
}

export type FactoryBoard = { columns: { name: string; tasks: FactoryTask[] }[] }
export type FactoryEvent = {
  id: string
  type:
    | 'task.created'
    | 'task.state_changed'
    | 'task.approved'
    | 'task.cancelled'
    | 'run.started'
    | 'run.output'
    | 'run.finished'
    | 'pipeline.step'
    | 'pipeline.failed'
    | 'pr.opened'
    | 'board.synced'
  taskId: string | null
  runId: string | null
  message: string
  data: Record<string, unknown>
  at: string
}
export type FactoryRun = {
  id: string
  taskId: string
  role: string
  adapter: string
  model: string | null
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  prompt: string
  output: string
  logFile: string
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
  exitCode: number | null
  error: string | null
}
export type FactoryTaskDetail = { task: FactoryTask; runs: FactoryRun[] }
export type AiSweFactoryConnectionStatus = {
  configured: boolean
  enabled: boolean
  baseUrl: string | null
  credentialError: string | null
}

// Why shared: emitted by the main process (credential-store.ts, ipc/ai-swe-factory.ts,
// runtime/rpc/methods/ai-swe-factory.ts) as the credentialError sentinel for an invalid
// base URL, and matched by the renderer to pick a localized message — both sides must
// use the exact same literal or the match silently falls through to the generic case.
export const AI_SWE_FACTORY_INVALID_URL_MESSAGE = 'Enter a valid HTTP or HTTPS URL.'

// Why shared: the renderer never calls these directly, but both the REST client and the
// SSE manager in the main process must agree on the exact read-only surface so a bug in
// one cannot silently widen the contract.
export const AI_SWE_FACTORY_ROUTES = [
  'GET /api/board',
  'GET /api/tasks/:id',
  'GET /api/events'
] as const

export type AiSweFactoryRoute = (typeof AI_SWE_FACTORY_ROUTES)[number]

export type AiSweFactoryEventStreamMessage =
  | { type: 'ready'; subscriptionId: string }
  | { type: 'event'; event: FactoryEvent }
  | { type: 'end' }

import { z } from 'zod'
import {
  AI_SWE_FACTORY_ROUTES,
  type FactoryBoard,
  type FactoryTaskDetail
} from '../../shared/ai-swe-factory-types'
import {
  assertAiSweFactoryHttpUrl,
  getAiSweFactoryApiKey,
  getAiSweFactoryConnectionStatus,
  sanitizeAiSweFactoryError
} from './credential-store'
import { cancelUnreadResponseBody } from '../lib/unread-response-body'

const TIMEOUT_MS = 15_000

// Why: the factory integration is deliberately read-only in this iteration. This guard
// makes the contract explicit and fails closed if a future refactor accidentally widens
// the verb/path surface.
export function assertReadOnlyMethod(method: string, path: string): void {
  const normalizedPath = path.replace(/\/api\/tasks\/[^/]+/, '/api/tasks/:id')
  const signature = `${method.toUpperCase()} ${normalizedPath}`
  if (!AI_SWE_FACTORY_ROUTES.includes(signature as (typeof AI_SWE_FACTORY_ROUTES)[number])) {
    throw new Error('AI SWE Factory client rejected a non-read-only request.')
  }
}

const task = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string().default(''),
  type: z.enum(['feature', 'bug', 'refactor', 'docs', 'chore']),
  risk: z.enum(['low', 'medium', 'high', 'critical']),
  state: z.enum([
    'RECEIVED',
    'SPEC',
    'PLAN',
    'AWAITING_APPROVAL',
    'IMPLEMENTING',
    'QA',
    'REVIEW',
    'PR_OPEN',
    'DOCS',
    'DONE',
    'NEEDS_INPUT',
    'FAILED',
    'CANCELLED'
  ]),
  repo: z.string().nullable().default(null),
  issueNumber: z.number().nullable().default(null),
  prNumber: z.number().nullable().default(null),
  branch: z.string().nullable().default(null),
  worktree: z.string().nullable().default(null),
  scope: z.array(z.string()).default([]),
  outOfScope: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  artifacts: z.record(z.string(), z.string()).default({}),
  attempts: z.number().default(0),
  qaLoopCount: z.number().optional(),
  reviewLoopCount: z.number().optional(),
  pendingImplementationRoles: z.array(z.string()).optional(),
  currentSlice: z.number().default(0),
  error: z.string().nullable().default(null),
  createdAt: z.string().default(''),
  updatedAt: z.string()
})
const board = z.object({ columns: z.array(z.object({ name: z.string(), tasks: z.array(task) })) })
const run = z.object({
  id: z.string(),
  taskId: z.string(),
  role: z.string(),
  adapter: z.string(),
  model: z.string().nullable().default(null),
  state: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  prompt: z.string().default(''),
  output: z.string().default(''),
  logFile: z.string().default(''),
  startedAt: z.string().nullable().default(null),
  finishedAt: z.string().nullable().default(null),
  durationMs: z.number().nullable().default(null),
  exitCode: z.number().nullable().default(null),
  error: z.string().nullable().default(null)
})
const taskDetail = z.object({ task, runs: z.array(run) })

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export class AiSweFactoryClient {
  private readonly baseUrl: string

  constructor(
    private readonly options: { baseUrl: string; apiKey?: string | null; fetch?: Fetch }
  ) {
    this.baseUrl = assertAiSweFactoryHttpUrl(options.baseUrl).toString().replace(/\/$/, '')
  }

  async getBoard(signal?: AbortSignal): Promise<FactoryBoard> {
    const path = '/api/board'
    assertReadOnlyMethod('GET', path)
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    const responseSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
    try {
      const response = await (this.options.fetch ?? globalThis.fetch)(
        new URL(path, this.baseUrl).toString(),
        {
          method: 'GET',
          headers: this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {},
          signal: responseSignal
        }
      )
      if (!response.ok) {
        await cancelUnreadResponseBody(response)
        throw new Error('request failed')
      }
      return board.parse(await response.json())
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error('AI SWE Factory returned an invalid board response.')
      }
      throw new Error(sanitizeAiSweFactoryError(error))
    }
  }

  async getTaskDetail(id: string, signal?: AbortSignal): Promise<FactoryTaskDetail> {
    const path = `/api/tasks/${encodeURIComponent(id)}`
    assertReadOnlyMethod('GET', path)
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    const responseSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
    try {
      const response = await (this.options.fetch ?? globalThis.fetch)(
        new URL(path, this.baseUrl).toString(),
        {
          method: 'GET',
          headers: this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {},
          signal: responseSignal
        }
      )
      if (!response.ok) {
        await cancelUnreadResponseBody(response)
        throw new Error('request failed')
      }
      return taskDetail.parse(await response.json())
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error('AI SWE Factory returned an invalid task response.')
      }
      throw new Error(sanitizeAiSweFactoryError(error))
    }
  }
}

export async function getAiSweFactoryBoard(signal?: AbortSignal): Promise<FactoryBoard> {
  const connection = getAiSweFactoryConnectionStatus()
  if (!connection.configured || !connection.baseUrl) {
    throw new Error('AI SWE Factory is not configured.')
  }
  return new AiSweFactoryClient({
    baseUrl: connection.baseUrl,
    apiKey: getAiSweFactoryApiKey()
  }).getBoard(signal)
}

export async function getAiSweFactoryTaskDetail(
  id: string,
  signal?: AbortSignal
): Promise<FactoryTaskDetail> {
  const connection = getAiSweFactoryConnectionStatus()
  if (!connection.configured || !connection.baseUrl) {
    throw new Error('AI SWE Factory is not configured.')
  }
  return new AiSweFactoryClient({
    baseUrl: connection.baseUrl,
    apiKey: getAiSweFactoryApiKey()
  }).getTaskDetail(id, signal)
}

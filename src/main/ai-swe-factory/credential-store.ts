import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  AI_SWE_FACTORY_INVALID_URL_MESSAGE,
  type AiSweFactoryConnectionStatus
} from '../../shared/ai-swe-factory-types'
import { credentialDecryptionMessage } from '../../shared/integration-credential-errors'
import {
  credentialFileHasContent,
  readStoredCredentialToken,
  writeEncryptedCredential
} from '../integration-credential-file'
import { getAiSweFactorySseConnectionManager } from './sse-connection-manager'

type StoredConnection = { version: 1; baseUrl: string; enabled: boolean }
let cachedConnection: StoredConnection | null | undefined
let credentialError: string | null = null

const orcaDir = () => join(homedir(), '.orca')
const connectionPath = () => join(orcaDir(), 'ai-swe-factory.json')
const credentialPath = () => join(orcaDir(), 'ai-swe-factory.enc')

function connection(): StoredConnection | null {
  if (cachedConnection !== undefined) {
    return cachedConnection
  }
  try {
    const value = JSON.parse(readFileSync(connectionPath(), 'utf8')) as Partial<StoredConnection>
    cachedConnection =
      value.version === 1 && typeof value.baseUrl === 'string'
        ? { version: 1, baseUrl: value.baseUrl, enabled: value.enabled === true }
        : null
  } catch {
    cachedConnection = null
  }
  return cachedConnection
}

export function assertAiSweFactoryHttpUrl(value: string): URL {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('protocol')
    }
    url.pathname = url.pathname.replace(/\/$/, '')
    url.search = ''
    url.hash = ''
    return url
  } catch {
    throw new Error(AI_SWE_FACTORY_INVALID_URL_MESSAGE)
  }
}

export function sanitizeAiSweFactoryError(_error: unknown): string {
  return 'Unable to connect to AI SWE Factory.'
}

// Why: transport/log messages may carry the full upstream URL or api_key/query tokens.
// Scrub anything that looks like a credential or URL before logging or returning to the
// renderer — never rely on the caller to redact.
export function sanitizeAiSweFactoryLog(message: string): string {
  return message
    .replace(/https?:\/\/[^\s"'`<>]+/gi, '[url]')
    .replace(/(\bapi[_-]?key\b|[Aa]uthorization\s*[:=]\s*)['"]?[\w-]+['"]?/gi, '$1[redacted]')
    .replace(/[\w-]+\.[\w-]+\.?[\w-]*/g, (match) => (match.length > 24 ? '[token]' : match))
}

export function saveAiSweFactoryConnection(args: {
  baseUrl: string
  apiKey?: string | null
}): AiSweFactoryConnectionStatus {
  const baseUrl = assertAiSweFactoryHttpUrl(args.baseUrl).toString().replace(/\/$/, '')
  if (!existsSync(orcaDir())) {
    mkdirSync(orcaDir(), { recursive: true })
  }
  const previouslyEnabled = connection()?.enabled === true
  cachedConnection = { version: 1, baseUrl, enabled: previouslyEnabled }
  writeFileSync(connectionPath(), JSON.stringify(cachedConnection), { mode: 0o600 })
  if (args.apiKey?.trim()) {
    writeEncryptedCredential('AI SWE Factory', credentialPath(), args.apiKey.trim())
    credentialError = null
  }
  getAiSweFactorySseConnectionManager().notifyConfigChanged()
  return getAiSweFactoryConnectionStatus()
}

export function setAiSweFactoryEnabled(enabled: boolean): AiSweFactoryConnectionStatus {
  const current = connection()
  if (!current) {
    return getAiSweFactoryConnectionStatus()
  }
  cachedConnection = { ...current, enabled }
  writeFileSync(connectionPath(), JSON.stringify(cachedConnection), { mode: 0o600 })
  getAiSweFactorySseConnectionManager().notifyConfigChanged()
  return getAiSweFactoryConnectionStatus()
}

export function getAiSweFactoryApiKey(): string | null {
  if (!credentialFileHasContent(credentialPath())) {
    return null
  }
  try {
    return readStoredCredentialToken('AI SWE Factory', readFileSync(credentialPath()))
  } catch {
    credentialError = credentialDecryptionMessage('AI SWE Factory')
    return null
  }
}

export function getAiSweFactoryConnectionStatus(): AiSweFactoryConnectionStatus {
  const current = connection()
  return {
    configured: current !== null,
    enabled: current?.enabled === true,
    baseUrl: current?.baseUrl ?? null,
    credentialError
  }
}

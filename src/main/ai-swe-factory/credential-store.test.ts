import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type * as Os from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let tempHome = ''

async function loadStore(encryptionAvailable = true) {
  vi.resetModules()
  const { setSecretStore } = await import('../../shared/secret-store')
  setSecretStore({
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (value) => Buffer.from(value),
    decryptString: (value) => value.toString('utf8'),
    describeProtectionGap: () => null
  })
  vi.doMock('node:os', async () => {
    const actual = await vi.importActual<typeof Os>('node:os')
    return { ...actual, homedir: () => tempHome }
  })
  return import('./credential-store')
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'orca-ai-swe-factory-'))
  vi.restoreAllMocks()
})

describe('AI SWE Factory credential store', () => {
  it('stores the optional API key separately and never exposes it in status metadata', async () => {
    const store = await loadStore()
    store.saveAiSweFactoryConnection({ baseUrl: 'http://factory.test/api', apiKey: 'secret-key' })

    expect(store.getAiSweFactoryConnectionStatus()).toEqual({
      configured: true,
      enabled: false,
      baseUrl: 'http://factory.test/api',
      credentialError: null
    })
    expect(readFileSync(join(tempHome, '.orca', 'ai-swe-factory.enc'), 'utf8')).toContain(
      'secret-key'
    )
  })

  it('falls back to a 0600 plaintext credential when encryption is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = await loadStore(false)
    store.saveAiSweFactoryConnection({ baseUrl: 'https://factory.test', apiKey: 'secret-key' })

    const path = join(tempHome, '.orca', 'ai-swe-factory.enc')
    expect(readFileSync(path, 'utf8')).toBe('secret-key')
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('plaintext'))
  })
})

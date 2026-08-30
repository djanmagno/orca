import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type * as Os from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let tempHome = ''

async function loadStore() {
  vi.resetModules()
  const { setSecretStore } = await import('../../shared/secret-store')
  setSecretStore({
    isEncryptionAvailable: () => true,
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
  tempHome = mkdtempSync(join(tmpdir(), 'orca-ai-swe-factory-resave-'))
  vi.restoreAllMocks()
})

describe('saveAiSweFactoryConnection re-save while enabled', () => {
  it('does not silently disable an already-enabled integration when the user only edits the base URL', async () => {
    const store = await loadStore()
    store.saveAiSweFactoryConnection({ baseUrl: 'https://factory.test' })
    store.setAiSweFactoryEnabled(true)
    expect(store.getAiSweFactoryConnectionStatus().enabled).toBe(true)

    const status = store.saveAiSweFactoryConnection({ baseUrl: 'https://factory-2.test' })

    expect(status.enabled).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { AI_SWE_FACTORY_INVALID_URL_MESSAGE } from '../../shared/ai-swe-factory-types'
import { assertAiSweFactoryHttpUrl } from './credential-store'

describe('assertAiSweFactoryHttpUrl secret leak prevention', () => {
  it('accepts a valid HTTP URL but strips query parameters that may contain secrets', () => {
    const url = assertAiSweFactoryHttpUrl('http://factory.test?api_key=super-secret')
    expect(url.toString()).toBe('http://factory.test/')
    expect(url.search).toBe('')
  })

  it('rejects a non-HTTP scheme without echoing the input', () => {
    expect(() => assertAiSweFactoryHttpUrl('ftp://factory.test')).toThrow(
      AI_SWE_FACTORY_INVALID_URL_MESSAGE
    )
  })

  it('rejects a malformed URL without echoing the input', () => {
    expect(() => assertAiSweFactoryHttpUrl('not a url')).toThrow(AI_SWE_FACTORY_INVALID_URL_MESSAGE)
  })

  it('rejects a relative URL without echoing the input', () => {
    expect(() => assertAiSweFactoryHttpUrl('/api/board')).toThrow(
      AI_SWE_FACTORY_INVALID_URL_MESSAGE
    )
  })

  it('strips query strings and hashes from a valid HTTPS URL', () => {
    const url = assertAiSweFactoryHttpUrl('https://factory.test/api?api_key=secret#hash')
    expect(url.toString()).toBe('https://factory.test/api')
  })
})

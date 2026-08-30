import { describe, expect, it } from 'vitest'
import { assertAiSweFactoryHttpUrl, sanitizeAiSweFactoryError } from './credential-store'

describe('AI SWE Factory connection validation', () => {
  it('normalizes HTTP URLs without retaining query secrets', () => {
    expect(
      assertAiSweFactoryHttpUrl(' https://factory.example/api/?api_key=secret ').toString()
    ).toBe('https://factory.example/api')
  })

  it('uses a generic validation error when an invalid URL contains a secret', () => {
    expect(() => assertAiSweFactoryHttpUrl('ftp://factory.example/?api_key=secret')).toThrow(
      'Enter a valid HTTP or HTTPS URL.'
    )
    expect(() => assertAiSweFactoryHttpUrl('ftp://factory.example/?api_key=secret')).not.toThrow(
      'secret'
    )
  })

  it('does not propagate transport text that may contain credentials', () => {
    expect(
      sanitizeAiSweFactoryError(new Error('GET https://factory.example/?api_key=secret failed'))
    ).toBe('Unable to connect to AI SWE Factory.')
  })
})

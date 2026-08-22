import { describe, expect, it } from 'vitest'
import type { ProviderRateLimits, ProviderRateLimitStatus } from '../../shared/rate-limit-types'
import { deriveAntigravityRateLimits } from './antigravity-usage-mirror'

function geminiSnapshot(
  status: ProviderRateLimitStatus,
  error: string | null,
  usedPercent: number | null = null
): ProviderRateLimits {
  return {
    provider: 'gemini',
    session:
      usedPercent === null
        ? null
        : { usedPercent, windowMinutes: 300, resetsAt: null, resetDescription: null },
    weekly: null,
    updatedAt: 1_700_000_000_000,
    error,
    status
  }
}

describe('deriveAntigravityRateLimits', () => {
  it('mirrors a successful Gemini read as shared Code Assist quota', () => {
    const antigravity = deriveAntigravityRateLimits(geminiSnapshot('ok', null, 42))

    expect(antigravity.provider).toBe('antigravity')
    expect(antigravity.status).toBe('ok')
    expect(antigravity.session?.usedPercent).toBe(42)
    expect(antigravity.error).toBeNull()
  })

  it('reports unavailable without quoting the Gemini failure', () => {
    const antigravity = deriveAntigravityRateLimits(
      geminiSnapshot('error', 'Gemini project ID not found')
    )

    expect(antigravity.provider).toBe('antigravity')
    expect(antigravity.status).toBe('unavailable')
    expect(antigravity.error).not.toContain('Gemini project ID not found')
    expect(antigravity.error).toContain('Antigravity usage is not available')
    expect(antigravity.session).toBeNull()
    expect(antigravity.weekly).toBeNull()
  })

  it('keeps the Gemini timestamp so activation freshness checks are not forced to refetch', () => {
    const antigravity = deriveAntigravityRateLimits(geminiSnapshot('error', 'Token refresh failed'))

    expect(antigravity.updatedAt).toBe(1_700_000_000_000)
  })

  it('uses the same Antigravity copy when the Gemini opt-in is off', () => {
    const antigravity = deriveAntigravityRateLimits(
      geminiSnapshot('unavailable', 'Gemini CLI OAuth is disabled in settings')
    )

    expect(antigravity.status).toBe('unavailable')
    expect(antigravity.error).not.toContain('Gemini CLI OAuth is disabled in settings')
    expect(antigravity.error).toContain('Antigravity usage is not available')
  })
})

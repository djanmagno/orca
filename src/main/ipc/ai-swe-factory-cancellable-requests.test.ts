import { describe, expect, it, vi } from 'vitest'
import { AiSweFactoryCancellableRequests } from './ai-swe-factory-cancellable-requests'

describe('AiSweFactoryCancellableRequests', () => {
  it('aborts a late run when cancel arrived before registration', async () => {
    const requests = new AiSweFactoryCancellableRequests()
    requests.cancel('req-1')

    const signals: AbortSignal[] = []
    await expect(
      requests.run('req-1', async (signal) => {
        signals.push(signal)
        if (signal.aborted) {
          throw Object.assign(new Error('aborted'), { name: 'AbortError' })
        }
        return 'ok'
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(signals).toHaveLength(1)
    expect(signals[0]?.aborted).toBe(true)
  })

  it('aborts an in-flight run on cancel', async () => {
    const requests = new AiSweFactoryCancellableRequests()
    const resolveBox: { current?: (value: string) => void } = {}
    const started = new Promise<AbortSignal>((resolve) => {
      void requests.run('req-2', (signal) => {
        resolve(signal)
        return new Promise<string>((taskResolve) => {
          resolveBox.current = taskResolve
          signal.addEventListener(
            'abort',
            () => {
              taskResolve('aborted')
            },
            { once: true }
          )
        })
      })
    })

    const signal = await started
    expect(signal.aborted).toBe(false)
    requests.cancel('req-2')
    expect(signal.aborted).toBe(true)
    resolveBox.current?.('done')
  })

  it('aborts the previous in-flight run when the same request id starts again', async () => {
    const requests = new AiSweFactoryCancellableRequests()
    const firstSignal = await new Promise<AbortSignal>((resolve) => {
      void requests.run(
        'task-detail',
        (signal) =>
          new Promise<string>((taskResolve) => {
            resolve(signal)
            signal.addEventListener('abort', () => taskResolve('superseded'), { once: true })
          })
      )
    })
    expect(firstSignal.aborted).toBe(false)

    await expect(requests.run('task-detail', async () => 'second')).resolves.toBe('second')
    expect(firstSignal.aborted).toBe(true)
  })

  it('ignores blank request ids', async () => {
    const requests = new AiSweFactoryCancellableRequests()
    const task = vi.fn(async () => 'ok')
    await expect(requests.run('   ', task)).resolves.toBe('ok')
    requests.cancel('   ')
    expect(task).toHaveBeenCalledTimes(1)
  })
})

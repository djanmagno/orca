import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { AiSweFactoryTaskDetailSheet } from './AiSweFactoryTaskDetailSheet'

export function AiSweFactoryBoardPanel(): React.JSX.Element {
  const board = useAppStore((state) => state.aiSweFactoryBoard)
  const error = useAppStore((state) => state.aiSweFactoryBoardError)
  const load = useAppStore((state) => state.loadAiSweFactoryBoard)
  const selectedTaskId = useAppStore((state) => state.aiSweFactorySelectedTaskId)
  const taskDetail = useAppStore((state) => state.aiSweFactoryTaskDetail)
  const taskDetailError = useAppStore((state) => state.aiSweFactoryTaskDetailError)
  const openTaskDetail = useAppStore((state) => state.openAiSweFactoryTaskDetail)
  const closeTaskDetail = useAppStore((state) => state.closeAiSweFactoryTaskDetail)
  const liveUpdatesUnavailable = useAppStore((state) => state.aiSweFactoryLiveUpdatesUnavailable)
  const syncEventSubscription = useAppStore((state) => state.syncAiSweFactoryEventSubscription)
  const stopEventSubscription = useAppStore((state) => state.stopAiSweFactoryEventSubscription)
  const activeRuntimeEnvironmentId = useAppStore(
    (state) => state.settings?.activeRuntimeEnvironmentId
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    syncEventSubscription()
    return () => stopEventSubscription()
    // Why activeRuntimeEnvironmentId: re-sync when the user switches runtime — a
    // subscription opened against the previous runtime must not keep updating this tab.
  }, [syncEventSubscription, stopEventSubscription, activeRuntimeEnvironmentId])

  useEffect(() => closeTaskDetail, [closeTaskDetail])

  if (error) {
    return (
      <p className="p-3 text-sm text-destructive">
        {translate(
          'auto.components.right.sidebar.AiSweFactoryBoardPanel.loadError',
          'Unable to load the AI SWE Factory board.'
        )}
      </p>
    )
  }
  if (!board) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      {liveUpdatesUnavailable && (
        <p className="border-b border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.AiSweFactoryBoardPanel.liveUpdatesUnavailable',
            'Live updates are unavailable on this connection. Refresh to see the latest task states.'
          )}
        </p>
      )}
      <div className="scrollbar-sleek flex min-h-0 flex-1 gap-2 overflow-auto p-2">
        {board.map((column) => (
          <section key={column.name} className="w-56 shrink-0 space-y-2" aria-label={column.name}>
            <h2 className="px-1 text-xs font-semibold text-muted-foreground">{column.name}</h2>
            {column.tasks.map((task) => (
              <article
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => void openTaskDetail(task.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    void openTaskDetail(task.id)
                  }
                }}
                className="cursor-pointer rounded-md border border-border bg-card p-2 text-card-foreground transition-colors hover:bg-accent"
              >
                <p className="text-sm font-medium">{task.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge variant="secondary">{task.state}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {task.id} · {task.type} · {task.risk}
                    {task.prNumber !== null ? ` · #${task.prNumber}` : ''}
                  </span>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
      <AiSweFactoryTaskDetailSheet
        open={selectedTaskId !== null}
        onOpenChange={(open) => !open && closeTaskDetail()}
        detail={taskDetail}
        loading={selectedTaskId !== null && taskDetail === null && taskDetailError === null}
        error={taskDetailError}
      />
    </>
  )
}

export default AiSweFactoryBoardPanel

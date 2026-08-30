import { ExternalLink, Loader2 } from 'lucide-react'
import type { FactoryTaskDetail } from '../../../../shared/ai-swe-factory-types'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { translate } from '@/i18n/i18n'
import { VisuallyHidden } from 'radix-ui'

function ListSection({
  title,
  items
}: {
  title: string
  items: string[]
}): React.JSX.Element | null {
  if (items.length === 0) {
    return null
  }
  return (
    <section>
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

export function AiSweFactoryTaskDetailSheet({
  open,
  onOpenChange,
  detail,
  loading,
  error
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: FactoryTaskDetail | null
  loading: boolean
  error: string | null
}): React.JSX.Element {
  const task = detail?.task ?? null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="scrollbar-sleek w-full overflow-y-auto sm:max-w-[520px]"
      >
        <VisuallyHidden.Root asChild>
          <SheetTitle>
            {task?.title ??
              translate(
                'auto.components.right.sidebar.AiSweFactoryTaskDetailSheet.title',
                'AI SWE Factory task'
              )}
          </SheetTitle>
        </VisuallyHidden.Root>
        <VisuallyHidden.Root asChild>
          <SheetDescription>
            {translate(
              'auto.components.right.sidebar.AiSweFactoryTaskDetailSheet.description',
              'Read-only details for the selected AI SWE Factory task.'
            )}
          </SheetDescription>
        </VisuallyHidden.Root>

        {loading && !task ? (
          <div className="flex justify-center p-6">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : error && !task ? (
          <p className="p-4 text-sm text-destructive">
            {translate(
              'auto.components.right.sidebar.AiSweFactoryTaskDetailSheet.loadError',
              'Unable to load this task.'
            )}
          </p>
        ) : task ? (
          <div className="flex flex-col gap-4 p-4">
            <div>
              <p className="font-mono text-xs text-muted-foreground">{task.id}</p>
              <h2 className="mt-1 text-base font-semibold">{task.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{task.state}</Badge>
                <Badge variant="outline">{task.type}</Badge>
                <Badge variant="outline">{task.risk}</Badge>
                {task.prNumber !== null && task.repo && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() =>
                      window.api.shell.openUrl(
                        `https://github.com/${task.repo}/pull/${task.prNumber}`
                      )
                    }
                  >
                    <ExternalLink className="size-3" />
                    {translate(
                      'auto.components.right.sidebar.AiSweFactoryTaskDetailSheet.pr',
                      'PR #{{value0}}',
                      { value0: task.prNumber }
                    )}
                  </button>
                )}
              </div>
            </div>

            {task.error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {task.error}
              </p>
            )}

            {task.body && (
              <p className="whitespace-pre-wrap text-sm text-foreground">{task.body}</p>
            )}

            <Separator />

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {task.repo && (
                <>
                  <dt className="text-muted-foreground">
                    {translate(
                      'auto.components.right.sidebar.AiSweFactoryTaskDetailSheet.repo',
                      'Repo'
                    )}
                  </dt>
                  <dd className="truncate">{task.repo}</dd>
                </>
              )}
              {task.branch && (
                <>
                  <dt className="text-muted-foreground">
                    {translate(
                      'auto.components.right.sidebar.AiSweFactoryTaskDetailSheet.branch',
                      'Branch'
                    )}
                  </dt>
                  <dd className="truncate">{task.branch}</dd>
                </>
              )}
              {task.worktree && (
                <>
                  <dt className="text-muted-foreground">
                    {translate(
                      'auto.components.right.sidebar.AiSweFactoryTaskDetailSheet.worktree',
                      'Worktree'
                    )}
                  </dt>
                  <dd className="truncate">{task.worktree}</dd>
                </>
              )}
              <dt className="text-muted-foreground">
                {translate(
                  'auto.components.right.sidebar.AiSweFactoryTaskDetailSheet.created',
                  'Created'
                )}
              </dt>
              <dd>{task.createdAt}</dd>
              <dt className="text-muted-foreground">
                {translate(
                  'auto.components.right.sidebar.AiSweFactoryTaskDetailSheet.updated',
                  'Updated'
                )}
              </dt>
              <dd>{task.updatedAt}</dd>
            </dl>

            <ListSection
              title={translate(
                'auto.components.right.sidebar.AiSweFactoryTaskDetailSheet.scope',
                'Scope'
              )}
              items={task.scope}
            />
            <ListSection
              title={translate(
                'auto.components.right.sidebar.AiSweFactoryTaskDetailSheet.outOfScope',
                'Out of scope'
              )}
              items={task.outOfScope}
            />
            <ListSection
              title={translate(
                'auto.components.right.sidebar.AiSweFactoryTaskDetailSheet.acceptanceCriteria',
                'Acceptance criteria'
              )}
              items={task.acceptanceCriteria}
            />
            <ListSection
              title={translate(
                'auto.components.right.sidebar.AiSweFactoryTaskDetailSheet.questions',
                'Questions'
              )}
              items={task.questions}
            />

            {detail && detail.runs.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground">
                  {translate(
                    'auto.components.right.sidebar.AiSweFactoryTaskDetailSheet.runs',
                    'Runs'
                  )}
                </h3>
                <div className="mt-1 space-y-1">
                  {detail.runs.map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1 text-xs"
                    >
                      <span className="truncate">
                        {run.role} · {run.adapter}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {run.state}
                        {run.durationMs !== null ? ` · ${Math.round(run.durationMs / 1000)}s` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

import { useEffect, useState } from 'react'
import { Factory, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { translate } from '@/i18n/i18n'
import { isIntegrationCredentialDecryptionError } from '../../../../shared/integration-credential-errors'
import { AI_SWE_FACTORY_INVALID_URL_MESSAGE } from '../../../../shared/ai-swe-factory-types'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'

// Why not render currentStatus.credentialError verbatim: it is produced in the main
// process, which has no access to the renderer's i18n catalog, so it always arrives as
// literal English. Map the small closed set of known sentinels to a localized message
// instead, matching against the same canonical strings the main process already uses
// (see integration-credential-errors.ts and credential-store.ts).
function localizeAiSweFactoryCredentialError(message: string): string {
  if (isIntegrationCredentialDecryptionError(new Error(message))) {
    return translate(
      'auto.components.settings.AiSweFactoryIntegrationCard.credentialErrorDecrypt',
      'Could not decrypt the saved AI SWE Factory credential. Approve Keychain access or reconnect AI SWE Factory.'
    )
  }
  if (message === AI_SWE_FACTORY_INVALID_URL_MESSAGE) {
    return translate(
      'auto.components.settings.AiSweFactoryIntegrationCard.credentialErrorInvalidUrl',
      'Enter a valid HTTP or HTTPS URL.'
    )
  }
  return translate(
    'auto.components.settings.AiSweFactoryIntegrationCard.credentialErrorGeneric',
    'Could not connect to AI SWE Factory. Check the connection settings.'
  )
}

export function AiSweFactoryIntegrationCard(): React.JSX.Element {
  const status = useAppStore((s) => s.aiSweFactoryStatus)
  const contextKey = useAppStore((s) => s.aiSweFactoryStatusContextKey)
  const settings = useAppStore((s) => s.settings)
  const getStatus = useAppStore((s) => s.getAiSweFactoryStatus)
  const save = useAppStore((s) => s.saveAiSweFactoryConnection)
  const setEnabled = useAppStore((s) => s.setAiSweFactoryEnabled)
  const [baseUrl, setBaseUrl] = useState(status.baseUrl ?? '')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const active = contextKey === getProviderRuntimeContextKey(settings)
  const currentStatus = active
    ? status
    : { configured: false, enabled: false, baseUrl: null, credentialError: null }
  useEffect(() => {
    void getStatus()
  }, [getStatus, settings?.activeRuntimeEnvironmentId])
  useEffect(() => {
    setBaseUrl(currentStatus.baseUrl ?? '')
  }, [currentStatus.baseUrl])
  const submit = async (): Promise<void> => {
    setSaving(true)
    try {
      await save({ baseUrl, apiKey: apiKey || null })
      setApiKey('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <IntegrationCardShell
      icon={<Factory className="size-5" />}
      name="AI SWE Factory"
      description={translate(
        'auto.components.settings.AiSweFactoryIntegrationCard.description',
        'Read tasks from an external AI SWE Factory board.'
      )}
      checking={!active}
      statusTone={currentStatus.configured ? 'connected' : 'attention'}
      statusLabel={
        currentStatus.configured
          ? translate(
              'auto.components.settings.AiSweFactoryIntegrationCard.statusConfigured',
              'Configured'
            )
          : translate(
              'auto.components.settings.AiSweFactoryIntegrationCard.statusNotConfigured',
              'Not configured'
            )
      }
    >
      <IntegrationCardDetails>
        <div className="space-y-2">
          <Label htmlFor="ai-swe-factory-url">
            {translate(
              'auto.components.settings.AiSweFactoryIntegrationCard.urlLabel',
              'Factory API URL'
            )}
          </Label>
          <Input
            id="ai-swe-factory-url"
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={translate(
              'auto.components.settings.AiSweFactoryIntegrationCard.urlPlaceholder',
              'http://localhost:4173'
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-swe-factory-key">
            {translate(
              'auto.components.settings.AiSweFactoryIntegrationCard.apiKeyLabel',
              'API key (optional)'
            )}
          </Label>
          <Input
            id="ai-swe-factory-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
          />
        </div>
        {currentStatus.credentialError ? (
          <p className="text-xs text-destructive">
            {localizeAiSweFactoryCredentialError(currentStatus.credentialError)}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="ai-swe-factory-enabled" className="text-sm">
            {translate(
              'auto.components.settings.AiSweFactoryIntegrationCard.enabledLabel',
              'Show board in the sidebar'
            )}
          </Label>
          <Switch
            id="ai-swe-factory-enabled"
            checked={currentStatus.enabled}
            disabled={!currentStatus.configured}
            onCheckedChange={(checked) => void setEnabled(checked)}
          />
        </div>
        <Button size="sm" onClick={() => void submit()} disabled={saving || !baseUrl.trim()}>
          {saving ? (
            <>
              <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
              {translate(
                'auto.components.settings.AiSweFactoryIntegrationCard.saving',
                'Saving...'
              )}
            </>
          ) : (
            translate(
              'auto.components.settings.AiSweFactoryIntegrationCard.save',
              'Save connection'
            )
          )}
        </Button>
      </IntegrationCardDetails>
    </IntegrationCardShell>
  )
}

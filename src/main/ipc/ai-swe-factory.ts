import { ipcMain } from 'electron'
import {
  getAiSweFactoryConnectionStatus,
  saveAiSweFactoryConnection,
  setAiSweFactoryEnabled
} from '../ai-swe-factory/credential-store'
import { AI_SWE_FACTORY_INVALID_URL_MESSAGE } from '../../shared/ai-swe-factory-types'
import { getAiSweFactoryBoard, getAiSweFactoryTaskDetail } from '../ai-swe-factory/client'
import { AiSweFactoryCancellableRequests } from './ai-swe-factory-cancellable-requests'

const taskDetailRequests = new AiSweFactoryCancellableRequests()

export function registerAiSweFactoryHandlers(): void {
  ipcMain.handle(
    'ai-swe-factory:saveConnection',
    (_event, args: { baseUrl?: unknown; apiKey?: unknown }) => {
      if (typeof args?.baseUrl !== 'string') {
        return {
          configured: false,
          enabled: false,
          baseUrl: null,
          credentialError: AI_SWE_FACTORY_INVALID_URL_MESSAGE
        }
      }
      try {
        return saveAiSweFactoryConnection({
          baseUrl: args.baseUrl,
          apiKey: typeof args.apiKey === 'string' ? args.apiKey : null
        })
      } catch {
        return {
          configured: false,
          enabled: false,
          baseUrl: null,
          credentialError: AI_SWE_FACTORY_INVALID_URL_MESSAGE
        }
      }
    }
  )
  ipcMain.handle('ai-swe-factory:status', () => getAiSweFactoryConnectionStatus())
  ipcMain.handle('ai-swe-factory:setEnabled', (_event, args: { enabled?: unknown }) =>
    setAiSweFactoryEnabled(args?.enabled === true)
  )
  ipcMain.handle('ai-swe-factory:getBoard', () => getAiSweFactoryBoard())
  ipcMain.handle(
    'ai-swe-factory:getTaskDetail',
    (_event, args: { id?: unknown; requestId?: unknown }) => {
      if (typeof args?.id !== 'string' || !args.id) {
        throw new Error('Missing id')
      }
      const id = args.id
      return taskDetailRequests.run(args.requestId, (signal) =>
        getAiSweFactoryTaskDetail(id, signal)
      )
    }
  )
  ipcMain.handle('ai-swe-factory:cancelTaskDetail', (_event, args: { requestId?: unknown }) => {
    taskDetailRequests.cancel(args?.requestId)
  })
}

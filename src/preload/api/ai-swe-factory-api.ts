import type {
  AiSweFactoryConnectionStatus,
  FactoryBoard,
  FactoryTaskDetail
} from '../../shared/ai-swe-factory-types'
export type AiSweFactoryApi = {
  saveConnection: (args: {
    baseUrl: string
    apiKey?: string | null
  }) => Promise<AiSweFactoryConnectionStatus>
  status: () => Promise<AiSweFactoryConnectionStatus>
  setEnabled: (args: { enabled: boolean }) => Promise<AiSweFactoryConnectionStatus>
  getBoard: () => Promise<FactoryBoard>
  getTaskDetail: (
    args: { id: string; requestId?: string },
    signal?: AbortSignal
  ) => Promise<FactoryTaskDetail>
  cancelTaskDetail: (args: { requestId: string }) => Promise<void>
}

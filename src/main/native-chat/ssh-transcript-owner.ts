import { agentHookServer } from '../agent-hooks/server'
import { isWslHookRelayConnectionId } from '../../shared/wsl-hook-relay-contract'

export type NativeChatSshOwner = {
  connectionId: string
  transcriptPath?: string
}

/** Map a native-chat session onto the SSH host that wrote its transcript.
 *  WSL `wsl:<distro>` ids are transport provenance, not a remote execution host. */
export function resolveNativeChatSshOwner(args: {
  sessionId: string
  transcriptPath?: string
}): NativeChatSshOwner | null {
  const sessionId = args.sessionId.trim()
  if (!sessionId) {
    return null
  }
  const clientPath = args.transcriptPath?.trim()
  const matches: { receivedAt: number; owner: NativeChatSshOwner }[] = []
  for (const row of agentHookServer.getStatusSnapshot()) {
    const connectionId = row.connectionId?.trim()
    if (!connectionId || isWslHookRelayConnectionId(connectionId)) {
      continue
    }
    if (row.providerSession?.id !== sessionId) {
      continue
    }
    const hookPath = row.providerSession.transcriptPath?.trim()
    matches.push({
      receivedAt: row.receivedAt,
      owner: {
        connectionId,
        ...(hookPath ? { transcriptPath: hookPath } : {})
      }
    })
  }
  if (matches.length === 0) {
    return null
  }
  // Path only disambiguates among same-session rows; it cannot select a foreign session.
  const pathMatches =
    clientPath === undefined || clientPath.length === 0
      ? []
      : matches.filter((entry) => entry.owner.transcriptPath === clientPath)
  const pool = pathMatches.length > 0 ? pathMatches : matches
  let newest = pool[0]
  for (const entry of pool) {
    if (newest === undefined || entry.receivedAt > newest.receivedAt) {
      newest = entry
    }
  }
  return newest?.owner ?? null
}

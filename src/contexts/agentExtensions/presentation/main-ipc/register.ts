import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import type { IpcRegistrationDisposable } from '../../../../app/main/ipc/types'
import { registerHandledIpc } from '../../../../app/main/ipc/handle'
import {
  addAgentMcpServer,
  createAgentSkill,
  getAgentExtensions,
  removeAgentMcpServer,
} from '../../infrastructure/main/AgentExtensionsService'
import {
  normalizeAddAgentMcpServerPayload,
  normalizeCreateAgentSkillPayload,
  normalizeGetAgentExtensionsPayload,
  normalizeRemoveAgentMcpServerPayload,
} from './validate'

export function registerAgentExtensionsIpcHandlers(): IpcRegistrationDisposable {
  registerHandledIpc(
    IPC_CHANNELS.agentExtensionsGetState,
    async (_event, payload) => {
      const normalized = normalizeGetAgentExtensionsPayload(payload)
      return await getAgentExtensions(normalized)
    },
    { defaultErrorCode: 'agent.extensions_get_state_failed' },
  )

  registerHandledIpc(
    IPC_CHANNELS.agentExtensionsAddMcpServer,
    async (_event, payload) => {
      const normalized = normalizeAddAgentMcpServerPayload(payload)
      await addAgentMcpServer(normalized)
    },
    { defaultErrorCode: 'agent.extensions_add_mcp_failed' },
  )

  registerHandledIpc(
    IPC_CHANNELS.agentExtensionsRemoveMcpServer,
    async (_event, payload) => {
      const normalized = normalizeRemoveAgentMcpServerPayload(payload)
      await removeAgentMcpServer(normalized)
    },
    { defaultErrorCode: 'agent.extensions_remove_mcp_failed' },
  )

  registerHandledIpc(
    IPC_CHANNELS.agentExtensionsCreateSkill,
    async (_event, payload) => {
      const normalized = normalizeCreateAgentSkillPayload(payload)
      return await createAgentSkill(normalized)
    },
    { defaultErrorCode: 'agent.extensions_create_skill_failed' },
  )

  return {
    dispose: () => {
      ipcMain.removeHandler(IPC_CHANNELS.agentExtensionsGetState)
      ipcMain.removeHandler(IPC_CHANNELS.agentExtensionsAddMcpServer)
      ipcMain.removeHandler(IPC_CHANNELS.agentExtensionsRemoveMcpServer)
      ipcMain.removeHandler(IPC_CHANNELS.agentExtensionsCreateSkill)
    },
  }
}

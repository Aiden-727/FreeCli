import type {
  WorkspaceAssistantAgentSnapshotDto,
  WorkspaceAssistantConversationMessageDto,
  WorkspaceAssistantInsightDto,
  WorkspaceAssistantNoteSnapshotDto,
  WorkspaceAssistantProjectFileSummaryDto,
  WorkspaceAssistantSettingsDto,
  WorkspaceAssistantSpaceSnapshotDto,
  WorkspaceAssistantStateDto,
  WorkspaceAssistantTaskSnapshotDto,
  WorkspaceAssistantTone,
  WorkspaceAssistantWorkspaceSnapshotDto,
} from '@shared/contracts/dto'

export type {
  WorkspaceAssistantAgentSnapshotDto,
  WorkspaceAssistantConversationMessageDto,
  WorkspaceAssistantInsightDto,
  WorkspaceAssistantNoteSnapshotDto,
  WorkspaceAssistantProjectFileSummaryDto,
  WorkspaceAssistantSettingsDto,
  WorkspaceAssistantSpaceSnapshotDto,
  WorkspaceAssistantStateDto,
  WorkspaceAssistantTaskSnapshotDto,
  WorkspaceAssistantTone,
  WorkspaceAssistantWorkspaceSnapshotDto,
}

export const DEFAULT_WORKSPACE_ASSISTANT_SETTINGS: WorkspaceAssistantSettingsDto = {
  enabled: false,
  dockCollapsed: false,
  autoOpenOnStartup: true,
  proactiveRemindersEnabled: true,
  proactiveReminderIntervalMinutes: 12,
  modelProvider: 'openai-compatible',
  aiEnabled: true,
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  modelName: 'gpt-4.1-mini',
  allowProjectScan: true,
  allowWorkspaceSummary: true,
  allowTaskInsight: true,
  allowFollowUpQuestions: true,
  allowSuggestionToasts: true,
  assistantNotes: '',
}

export function normalizeWorkspaceAssistantSettings(
  value: unknown,
): WorkspaceAssistantSettingsDto {
  if (!value || typeof value !== 'object') {
    return DEFAULT_WORKSPACE_ASSISTANT_SETTINGS
  }

  const record = value as Record<string, unknown>
  const interval = Number(record.proactiveReminderIntervalMinutes)
  const modelProvider = record.modelProvider === 'openai-compatible' ? 'openai-compatible' : 'local'
  const apiBaseUrl = typeof record.apiBaseUrl === 'string' ? record.apiBaseUrl.trim() : ''
  const apiKey = typeof record.apiKey === 'string' ? record.apiKey.trim() : ''
  const modelName = typeof record.modelName === 'string' ? record.modelName.trim() : ''

  return {
    enabled: Boolean(record.enabled),
    dockCollapsed: Boolean(record.dockCollapsed),
    autoOpenOnStartup: record.autoOpenOnStartup !== false,
    proactiveRemindersEnabled: record.proactiveRemindersEnabled !== false,
    proactiveReminderIntervalMinutes:
      Number.isFinite(interval) && interval > 0
        ? Math.max(3, Math.min(180, Math.trunc(interval)))
        : DEFAULT_WORKSPACE_ASSISTANT_SETTINGS.proactiveReminderIntervalMinutes,
    modelProvider,
    aiEnabled: record.aiEnabled !== false,
    apiBaseUrl:
      apiBaseUrl.length > 0 ? apiBaseUrl : DEFAULT_WORKSPACE_ASSISTANT_SETTINGS.apiBaseUrl,
    apiKey,
    modelName: modelName.length > 0 ? modelName : DEFAULT_WORKSPACE_ASSISTANT_SETTINGS.modelName,
    allowProjectScan: record.allowProjectScan !== false,
    allowWorkspaceSummary: record.allowWorkspaceSummary !== false,
    allowTaskInsight: record.allowTaskInsight !== false,
    allowFollowUpQuestions: record.allowFollowUpQuestions !== false,
    allowSuggestionToasts: record.allowSuggestionToasts !== false,
    assistantNotes: typeof record.assistantNotes === 'string' ? record.assistantNotes : '',
  }
}

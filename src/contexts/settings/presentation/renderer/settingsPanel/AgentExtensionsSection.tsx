import React from 'react'
import { useTranslation } from '@app/renderer/i18n'
import { CoveSelect } from '@app/renderer/components/CoveSelect'
import { AGENT_PROVIDER_LABEL } from '@contexts/settings/domain/agentSettings'
import type {
  AddAgentMcpServerInput,
  AgentExtensionProviderId,
  AgentMcpServerEntry,
  AgentSkillEntry,
  GetAgentExtensionsResult,
} from '@shared/contracts/dto'

type ProviderState = {
  isLoading: boolean
  error: string | null
  data: GetAgentExtensionsResult | null
}

function createEmptyMcpDraft(): {
  name: string
  transport: 'stdio' | 'http'
  command: string
  args: string
  url: string
} {
  return {
    name: '',
    transport: 'stdio',
    command: '',
    args: '',
    url: '',
  }
}

function createInitialDrafts(): Record<
  AgentExtensionProviderId,
  ReturnType<typeof createEmptyMcpDraft>
> {
  return {
    codex: createEmptyMcpDraft(),
    'claude-code': createEmptyMcpDraft(),
  }
}

function createInitialSkillNames(): Record<AgentExtensionProviderId, string> {
  return {
    codex: '',
    'claude-code': '',
  }
}

function formatMcpTarget(entry: AgentMcpServerEntry): string {
  if (entry.transport === 'http') {
    return entry.url ?? ''
  }

  const command = entry.command ?? ''
  const args = entry.args.join(' ')
  return [command, args].filter(Boolean).join(' ')
}

function formatSkillMeta(skill: AgentSkillEntry): string {
  return skill.hasSkillManifest ? 'SKILL.md' : '目录'
}

function formatMcpStatus(
  entry: AgentMcpServerEntry,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  return `${entry.transport.toUpperCase()} · ${
    entry.enabled ? t('settingsPanel.ai.extensions.enabled') : t('settingsPanel.ai.extensions.disabled')
  }`
}

export function AgentExtensionsSection(): React.JSX.Element {
  const { t } = useTranslation()
  const providers: readonly AgentExtensionProviderId[] = ['codex', 'claude-code']
  const [providerState, setProviderState] = React.useState<Record<AgentExtensionProviderId, ProviderState>>({
    codex: { isLoading: true, error: null, data: null },
    'claude-code': { isLoading: true, error: null, data: null },
  })
  const [mcpDrafts, setMcpDrafts] = React.useState(createInitialDrafts)
  const [skillNames, setSkillNames] = React.useState(createInitialSkillNames)
  const [busyKey, setBusyKey] = React.useState<string | null>(null)

  const refreshProvider = React.useCallback(async (provider: AgentExtensionProviderId) => {
    setProviderState(previous => ({
      ...previous,
      [provider]: { ...previous[provider], isLoading: true, error: null },
    }))

    try {
      const data = await window.freecliApi.agentExtensions.getState({
        provider,
        scope: 'global',
      })
      setProviderState(previous => ({
        ...previous,
        [provider]: { isLoading: false, error: null, data },
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setProviderState(previous => ({
        ...previous,
        [provider]: { ...previous[provider], isLoading: false, error: message },
      }))
    }
  }, [])

  React.useEffect(() => {
    let disposed = false

    void Promise.all(providers.map(provider => refreshProvider(provider))).finally(() => {
      if (disposed) {
        return
      }
    })

    return () => {
      disposed = true
    }
  }, [refreshProvider])

  const updateMcpDraft = (
    provider: AgentExtensionProviderId,
    next: Partial<ReturnType<typeof createEmptyMcpDraft>>,
  ): void => {
    setMcpDrafts(previous => ({
      ...previous,
      [provider]: {
        ...previous[provider],
        ...next,
      },
    }))
  }

  const handleAddMcp = async (provider: AgentExtensionProviderId): Promise<void> => {
    const draft = mcpDrafts[provider]
    const payload: AddAgentMcpServerInput = {
      provider,
      scope: 'global',
      name: draft.name.trim(),
      transport: draft.transport,
      command: draft.transport === 'stdio' ? draft.command.trim() : null,
      args:
        draft.transport === 'stdio'
          ? draft.args
              .split(/\s+/)
              .map(item => item.trim())
              .filter(Boolean)
          : [],
      url: draft.transport === 'http' ? draft.url.trim() : null,
      env: {},
    }

    setBusyKey(`${provider}:add-mcp`)
    try {
      await window.freecliApi.agentExtensions.addMcpServer(payload)
      setMcpDrafts(previous => ({ ...previous, [provider]: createEmptyMcpDraft() }))
      await refreshProvider(provider)
    } finally {
      setBusyKey(null)
    }
  }

  const handleRemoveMcp = async (
    provider: AgentExtensionProviderId,
    serverName: string,
  ): Promise<void> => {
    setBusyKey(`${provider}:remove-mcp:${serverName}`)
    try {
      await window.freecliApi.agentExtensions.removeMcpServer({
        provider,
        scope: 'global',
        name: serverName,
      })
      await refreshProvider(provider)
    } finally {
      setBusyKey(null)
    }
  }

  const handleCreateSkill = async (provider: AgentExtensionProviderId): Promise<void> => {
    const name = skillNames[provider].trim()
    if (name.length === 0) {
      return
    }

    setBusyKey(`${provider}:create-skill`)
    try {
      await window.freecliApi.agentExtensions.createSkill({
        provider,
        scope: 'global',
        name,
      })
      setSkillNames(previous => ({ ...previous, [provider]: '' }))
      await refreshProvider(provider)
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="settings-panel__section" id="settings-section-agent-extensions">
      <h3 className="settings-panel__section-title">
        {t('settingsPanel.ai.extensions.title')}
      </h3>

      <div className="settings-panel__subsection">
        <div className="settings-panel__subsection-header">
          <strong>{t('settingsPanel.ai.extensions.summaryTitle')}</strong>
          <span>{t('settingsPanel.ai.extensions.summaryHelp')}</span>
        </div>
      </div>

      {providers.map(provider => {
        const state = providerState[provider]
        const label = AGENT_PROVIDER_LABEL[provider]
        const summary = state.data?.summary ?? null
        const mcpServers = state.data?.mcpServers ?? []
        const skills = state.data?.skills ?? []
        const draft = mcpDrafts[provider]

        return (
          <div className="settings-panel__subsection settings-provider-card agent-extensions agent-extensions__provider" key={provider}>
            <div className="settings-panel__subsection-header">
              <strong>
                {t('settingsPanel.ai.extensions.providerTitle', { provider: label })}
              </strong>
              <span>
                {t('settingsPanel.ai.extensions.providerHelp', { provider: label })}
              </span>
            </div>

            <div className="agent-extensions__summary-row">
              <span className="agent-extensions__chip">
                {summary?.cliAvailable
                  ? t('settingsPanel.ai.extensions.cliAvailable')
                  : t('settingsPanel.ai.extensions.cliUnavailable')}
              </span>
              {summary?.configPath ? (
                <span className="agent-extensions__meta">
                  {t('settingsPanel.ai.extensions.configPath', {
                    path: summary.configPath,
                  })}
                </span>
              ) : null}
              {summary?.skillsDirectoryPath ? (
                <span className="agent-extensions__meta">
                  {t('settingsPanel.ai.extensions.skillsPath', {
                    path: summary.skillsDirectoryPath,
                  })}
                </span>
              ) : null}
            </div>

            <div className="agent-extensions__block">
              <div className="settings-panel__subsection-header">
                <strong>{t('settingsPanel.ai.extensions.mcpTitle')}</strong>
                <span>{t('settingsPanel.ai.extensions.mcpHelp')}</span>
              </div>
              <div className="agent-extensions__stack">
                {state.isLoading ? (
                  <div className="settings-panel__value">
                    {t('settingsPanel.ai.extensions.loading')}
                  </div>
                ) : null}
                {state.error ? (
                  <div className="settings-provider-card__error">{state.error}</div>
                ) : null}

                <div className="agent-extensions__list-shell">
                  <div className="agent-extensions__list-head agent-extensions__list-head--mcp">
                    <span>{t('settingsPanel.ai.extensions.columns.name')}</span>
                    <span>{t('settingsPanel.ai.extensions.columns.target')}</span>
                    <span>{t('settingsPanel.ai.extensions.columns.status')}</span>
                    <span>{t('settingsPanel.ai.extensions.columns.actions')}</span>
                  </div>
                  {mcpServers.length > 0 ? (
                    mcpServers.map(entry => (
                      <div className="agent-extensions__list-row agent-extensions__list-row--mcp" key={entry.name}>
                        <div className="agent-extensions__cell agent-extensions__cell--primary">
                          <strong className="agent-extensions__item-title">{entry.name}</strong>
                        </div>
                        <div className="agent-extensions__cell">
                          <span className="agent-extensions__item-meta agent-extensions__item-meta--truncate" title={formatMcpTarget(entry)}>
                            {formatMcpTarget(entry)}
                          </span>
                        </div>
                        <div className="agent-extensions__cell">
                          <span className="agent-extensions__item-meta">
                            {formatMcpStatus(entry, t)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="secondary agent-extensions__action"
                          data-testid={`agent-extensions-remove-mcp-${provider}-${entry.name}`}
                          disabled={busyKey === `${provider}:remove-mcp:${entry.name}`}
                          onClick={() => {
                            void handleRemoveMcp(provider, entry.name)
                          }}
                        >
                          {t('settingsPanel.ai.extensions.removeMcp')}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="agent-extensions__empty">
                      {t('settingsPanel.ai.extensions.emptyMcp')}
                    </div>
                  )}
                </div>

                <div className="agent-extensions__editor">
                  <input
                    data-testid={`agent-extensions-mcp-name-${provider}`}
                    placeholder={t('settingsPanel.ai.extensions.mcpNamePlaceholder')}
                    value={draft.name}
                    onChange={event => {
                      updateMcpDraft(provider, { name: event.target.value })
                    }}
                  />
                  <CoveSelect
                    id={`agent-extensions-mcp-transport-${provider}`}
                    testId={`agent-extensions-mcp-transport-${provider}`}
                    value={draft.transport}
                    options={[
                      { value: 'stdio', label: 'stdio' },
                      { value: 'http', label: 'http' },
                    ]}
                    onChange={nextValue => {
                      updateMcpDraft(provider, {
                        transport: nextValue === 'http' ? 'http' : 'stdio',
                      })
                    }}
                  />
                  {draft.transport === 'http' ? (
                    <input
                      data-testid={`agent-extensions-mcp-url-${provider}`}
                      placeholder={t('settingsPanel.ai.extensions.mcpUrlPlaceholder')}
                      value={draft.url}
                      onChange={event => {
                        updateMcpDraft(provider, { url: event.target.value })
                      }}
                    />
                  ) : (
                    <>
                      <input
                        data-testid={`agent-extensions-mcp-command-${provider}`}
                        placeholder={t('settingsPanel.ai.extensions.mcpCommandPlaceholder')}
                        value={draft.command}
                        onChange={event => {
                          updateMcpDraft(provider, { command: event.target.value })
                        }}
                      />
                      <input
                        data-testid={`agent-extensions-mcp-args-${provider}`}
                        placeholder={t('settingsPanel.ai.extensions.mcpArgsPlaceholder')}
                        value={draft.args}
                        onChange={event => {
                          updateMcpDraft(provider, { args: event.target.value })
                        }}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    className="secondary"
                    data-testid={`agent-extensions-add-mcp-${provider}`}
                    disabled={busyKey === `${provider}:add-mcp`}
                    onClick={() => {
                      void handleAddMcp(provider)
                    }}
                  >
                    {t('settingsPanel.ai.extensions.addMcp')}
                  </button>
                </div>
              </div>
            </div>

            <div className="agent-extensions__block">
              <div className="settings-panel__subsection-header">
                <strong>{t('settingsPanel.ai.extensions.skillsTitle')}</strong>
                <span>{t('settingsPanel.ai.extensions.skillsHelp')}</span>
              </div>
              <div className="agent-extensions__stack">
                <div className="agent-extensions__list-shell">
                  <div className="agent-extensions__list-head agent-extensions__list-head--skills">
                    <span>{t('settingsPanel.ai.extensions.columns.name')}</span>
                    <span>{t('settingsPanel.ai.extensions.columns.path')}</span>
                    <span>{t('settingsPanel.ai.extensions.columns.type')}</span>
                  </div>
                  {skills.length > 0 ? (
                    skills.map(skill => (
                      <div className="agent-extensions__list-row agent-extensions__list-row--skills" key={skill.path}>
                        <div className="agent-extensions__cell agent-extensions__cell--primary">
                          <strong className="agent-extensions__item-title">{skill.name}</strong>
                        </div>
                        <div className="agent-extensions__cell">
                          <span className="agent-extensions__item-meta agent-extensions__item-meta--truncate" title={skill.path}>
                            {skill.path}
                          </span>
                        </div>
                        <div className="agent-extensions__cell">
                          <span className="agent-extensions__item-meta">{formatSkillMeta(skill)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="agent-extensions__empty">
                      {t('settingsPanel.ai.extensions.emptySkills')}
                    </div>
                  )}
                </div>

                <div className="settings-panel__input-row">
                  <input
                    data-testid={`agent-extensions-skill-name-${provider}`}
                    placeholder={t('settingsPanel.ai.extensions.skillNamePlaceholder')}
                    value={skillNames[provider]}
                    onChange={event => {
                      setSkillNames(previous => ({
                        ...previous,
                        [provider]: event.target.value,
                      }))
                    }}
                  />
                  <button
                    type="button"
                    className="secondary"
                    data-testid={`agent-extensions-create-skill-${provider}`}
                    disabled={busyKey === `${provider}:create-skill`}
                    onClick={() => {
                      void handleCreateSkill(provider)
                    }}
                  >
                    {t('settingsPanel.ai.extensions.createSkill')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

import React from 'react'
import { useTranslation } from '@app/renderer/i18n'
import { CoveSelect } from '@app/renderer/components/CoveSelect'
import {
  AGENT_PROVIDER_LABEL,
  type AgentProvider,
} from '@contexts/settings/domain/agentSettings'
import type {
  TerminalCredentialProfile,
  TerminalCredentialProvider,
  TerminalCredentialsSettings,
} from '@contexts/settings/domain/terminalCredentials'

function toSupportedTerminalCredentialProvider(
  provider: AgentProvider,
): TerminalCredentialProvider | null {
  if (provider === 'codex' || provider === 'claude-code') {
    return provider
  }

  return null
}

interface TerminalCredentialsSectionProps {
  settings: TerminalCredentialsSettings
  onChange: (settings: TerminalCredentialsSettings) => void
}

function buildEmptyProfile(provider: TerminalCredentialProvider): TerminalCredentialProfile {
  const id = crypto.randomUUID()
  return {
    id,
    label: '',
    provider,
    apiKey: '',
    baseUrl: '',
    enabled: true,
  }
}

export function TerminalCredentialsSection({
  settings,
  onChange,
}: TerminalCredentialsSectionProps): React.JSX.Element {
  const { t } = useTranslation()
  const supportedProviders = (
    ['claude-code', 'codex'] as const satisfies readonly AgentProvider[]
  ).map(provider => ({
    provider,
    credentialProvider: toSupportedTerminalCredentialProvider(provider),
    label: AGENT_PROVIDER_LABEL[provider],
  }))

  const updateProfile = (
    profileId: string,
    updater: (profile: TerminalCredentialProfile) => TerminalCredentialProfile,
  ): void => {
    onChange({
      ...settings,
      profiles: settings.profiles.map(profile =>
        profile.id === profileId ? updater(profile) : profile,
      ),
    })
  }

  const removeProfile = (profileId: string): void => {
    const profile = settings.profiles.find(item => item.id === profileId) ?? null
    if (!profile) {
      return
    }

    onChange({
      profiles: settings.profiles.filter(item => item.id !== profileId),
      defaultProfileIdByProvider: {
        ...settings.defaultProfileIdByProvider,
        [profile.provider]:
          settings.defaultProfileIdByProvider[profile.provider] === profileId
            ? null
            : settings.defaultProfileIdByProvider[profile.provider],
      },
    })
  }

  const addProfile = (provider: TerminalCredentialProvider): void => {
    onChange({
      ...settings,
      profiles: [...settings.profiles, buildEmptyProfile(provider)],
    })
  }

  return (
    <div className="settings-panel__section" id="settings-section-terminal-credentials">
      <h3 className="settings-panel__section-title">
        {t('settingsPanel.agent.terminalCredentials.title')}
      </h3>

      <div className="settings-panel__subsection">
        <div className="settings-panel__subsection-header">
          <strong>{t('settingsPanel.agent.terminalCredentials.summaryTitle')}</strong>
          <span>{t('settingsPanel.agent.terminalCredentials.summaryHelp')}</span>
        </div>
      </div>

      {supportedProviders.map(({ provider, credentialProvider, label }) => {
        if (!credentialProvider) {
          return null
        }

        const providerProfiles = settings.profiles.filter(
          profile => profile.provider === credentialProvider,
        )
        const selectedDefaultProfileId =
          settings.defaultProfileIdByProvider[credentialProvider] ?? ''

        return (
          <div className="settings-panel__subsection" key={provider}>
            <div className="settings-panel__subsection-header">
              <strong>
                {t('settingsPanel.agent.terminalCredentials.providerTitle', {
                  provider: label,
                })}
              </strong>
              <span>
                {t('settingsPanel.agent.terminalCredentials.providerHelp', {
                  provider: label,
                })}
              </span>
            </div>

            <div className="settings-panel__row">
              <div className="settings-panel__row-label">
                <strong>{t('settingsPanel.agent.terminalCredentials.defaultProfileLabel')}</strong>
                <span>{t('settingsPanel.agent.terminalCredentials.defaultProfileHelp')}</span>
              </div>
              <div className="settings-panel__control">
                <CoveSelect
                  id={`settings-terminal-credentials-default-${provider}`}
                  testId={`settings-terminal-credentials-default-${provider}`}
                  value={selectedDefaultProfileId}
                  options={[
                    {
                      value: '',
                      label: t('settingsPanel.agent.terminalCredentials.useFirstEnabled'),
                    },
                    ...providerProfiles.map(profile => ({
                      value: profile.id,
                      label:
                        profile.label.trim().length > 0
                          ? profile.label.trim()
                          : t('settingsPanel.agent.terminalCredentials.unnamedProfile'),
                    })),
                  ]}
                  onChange={nextValue => {
                    onChange({
                      ...settings,
                      defaultProfileIdByProvider: {
                        ...settings.defaultProfileIdByProvider,
                        [credentialProvider]: nextValue.trim().length > 0 ? nextValue : null,
                      },
                    })
                  }}
                />
              </div>
            </div>

            <div className="settings-list-container" data-testid={`settings-terminal-credentials-list-${provider}`}>
              {providerProfiles.map((profile, index) => (
                <div
                  className="settings-list-item settings-list-item--terminal-credential"
                  key={profile.id}
                >
                  <div className="settings-list-item__left settings-list-item__left--stack">
                    <div className="settings-panel__subsection-header">
                      <strong>
                        {t('settingsPanel.agent.terminalCredentials.profileTitle', {
                          index: index + 1,
                        })}
                      </strong>
                      <span>{t('settingsPanel.agent.terminalCredentials.profileHelp')}</span>
                    </div>

                    <div className="settings-panel__terminal-credentials-grid">
                      <label className="settings-panel__terminal-credentials-field">
                        <span>{t('settingsPanel.agent.terminalCredentials.profileLabel')}</span>
                        <input
                          data-testid={`settings-terminal-credentials-label-${profile.id}`}
                          value={profile.label}
                          onChange={event => {
                            updateProfile(profile.id, current => ({
                              ...current,
                              label: event.target.value,
                            }))
                          }}
                        />
                      </label>

                      <label className="settings-panel__terminal-credentials-field">
                        <span>{t('settingsPanel.agent.terminalCredentials.apiKeyLabel')}</span>
                        <input
                          data-testid={`settings-terminal-credentials-api-key-${profile.id}`}
                          type="password"
                          autoComplete="off"
                          value={profile.apiKey}
                          onChange={event => {
                            updateProfile(profile.id, current => ({
                              ...current,
                              apiKey: event.target.value,
                            }))
                          }}
                        />
                      </label>

                      <label className="settings-panel__terminal-credentials-field">
                        <span>{t('settingsPanel.agent.terminalCredentials.baseUrlLabel')}</span>
                        <input
                          data-testid={`settings-terminal-credentials-base-url-${profile.id}`}
                          autoComplete="off"
                          value={profile.baseUrl}
                          onChange={event => {
                            updateProfile(profile.id, current => ({
                              ...current,
                              baseUrl: event.target.value,
                            }))
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="settings-panel__terminal-credentials-actions">
                    <label className="cove-toggle">
                      <input
                        type="checkbox"
                        data-testid={`settings-terminal-credentials-enabled-${profile.id}`}
                        checked={profile.enabled}
                        onChange={event => {
                          updateProfile(profile.id, current => ({
                            ...current,
                            enabled: event.target.checked,
                          }))
                        }}
                      />
                      <span className="cove-toggle__slider"></span>
                    </label>
                    <button
                      type="button"
                      className="secondary settings-list-item__remove"
                      data-testid={`settings-terminal-credentials-remove-${profile.id}`}
                      onClick={() => removeProfile(profile.id)}
                    >
                      {t('settingsPanel.agent.terminalCredentials.removeProfile')}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="secondary"
              data-testid={`settings-terminal-credentials-add-${provider}`}
              onClick={() => addProfile(credentialProvider)}
            >
              {t('settingsPanel.agent.terminalCredentials.addProfile', { provider: label })}
            </button>
          </div>
        )
      })}
    </div>
  )
}

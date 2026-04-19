import React from 'react'
import { X } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { GitWorklogRepositoryDto, GitWorklogWorkspaceDto } from '@shared/contracts/dto'

export function GitWorklogRepositoryDialog({
  repository,
  canRemove,
  onClose,
  onToggleEnabled,
  onRemove,
  onChangeLabel,
  onChangePath,
  onChangeAssignedWorkspaceId,
  onPickDirectory,
  availableWorkspaces,
}: {
  repository: GitWorklogRepositoryDto
  canRemove: boolean
  onClose: () => void
  onToggleEnabled: (enabled: boolean) => void
  onRemove: () => void
  onChangeLabel: (label: string) => void
  onChangePath: (path: string) => void
  onChangeAssignedWorkspaceId: (workspaceId: string | null) => void
  onPickDirectory: () => void
  availableWorkspaces: GitWorklogWorkspaceDto[]
}): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div
      className="cove-window-backdrop git-worklog-config__dialog-backdrop"
      data-testid={`git-worklog-repository-dialog-${repository.id}`}
      onClick={onClose}
    >
      <section
        className="cove-window git-worklog-config__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('pluginManager.plugins.gitWorklog.repositoryDetailTitle', {
          label: repository.label.trim() || repository.id,
        })}
        onClick={event => {
          event.stopPropagation()
        }}
      >
        <div className="git-worklog-config__dialog-header">
          <div className="git-worklog-config__dialog-copy">
            <h3>
              {t('pluginManager.plugins.gitWorklog.repositoryDetailTitle', {
                label: repository.label.trim() || repository.id,
              })}
            </h3>
            <p>{t('pluginManager.plugins.gitWorklog.repositoryDialogSummary')}</p>
          </div>
          <button
            type="button"
            className="cove-window__icon-button"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="git-worklog-config__dialog-hero">
          <div className="git-worklog-config__dialog-actions-rail">
            <label className="plugin-manager-panel__toggle-row git-worklog-config__dialog-toggle">
              <span>{t('pluginManager.plugins.gitWorklog.enableRepositoryLabel')}</span>
              <span className="cove-toggle">
                <input
                  type="checkbox"
                  data-testid={`git-worklog-repository-enabled-${repository.id}`}
                  checked={repository.enabled}
                  onChange={event => {
                    onToggleEnabled(event.target.checked)
                  }}
                />
                <span className="cove-toggle__slider"></span>
              </span>
            </label>

            <button
              type="button"
              className="cove-window__action cove-window__action--danger"
              data-testid={`git-worklog-repository-remove-${repository.id}`}
              onClick={onRemove}
              disabled={!canRemove}
            >
              {t('pluginManager.plugins.gitWorklog.removeRepository')}
            </button>
          </div>

          <div className="git-worklog-config__dialog-capsule">
            <strong>{repository.label.trim() || repository.id}</strong>
            <span>
              {repository.path.trim() ||
                t('pluginManager.plugins.gitWorklog.repositoryPathEmptyState')}
            </span>
            <div className="git-worklog-config__dialog-meta">
              <span className="git-worklog-config__repo-row-pill">
                {repository.enabled
                  ? t('pluginManager.plugins.gitWorklog.repositoryStatusEnabled')
                  : t('pluginManager.plugins.gitWorklog.repositoryStatusDisabled')}
              </span>
              <span className="git-worklog-config__dialog-id">{repository.id}</span>
            </div>
          </div>
        </div>

        <div className="cove-window__field-row">
          <label htmlFor={`git-worklog-repository-label-${repository.id}`}>
            {t('pluginManager.plugins.gitWorklog.repositoryLabelLabel')}
          </label>
          <input
            id={`git-worklog-repository-label-${repository.id}`}
            className="cove-field"
            data-testid={`git-worklog-repository-label-${repository.id}`}
            type="text"
            value={repository.label}
            placeholder={t('pluginManager.plugins.gitWorklog.repositoryLabelPlaceholder')}
            onChange={event => {
              onChangeLabel(event.target.value)
            }}
          />
        </div>

        <div className="cove-window__field-row">
          <label htmlFor={`git-worklog-repository-path-${repository.id}`}>
            {t('pluginManager.plugins.gitWorklog.repositoryPathLabel')}
          </label>
          <div className="git-worklog-config__path-row">
            <input
              id={`git-worklog-repository-path-${repository.id}`}
              className="cove-field"
              data-testid={`git-worklog-repository-path-${repository.id}`}
              type="text"
              value={repository.path}
              placeholder={t('pluginManager.plugins.gitWorklog.repositoryPathPlaceholder')}
              onChange={event => {
                onChangePath(event.target.value)
              }}
            />
            <button
              type="button"
              className="cove-window__action cove-window__action--secondary"
              data-testid={`git-worklog-repository-pick-${repository.id}`}
              onClick={onPickDirectory}
            >
              {t('pluginManager.plugins.gitWorklog.pickDirectory')}
            </button>
          </div>
        </div>

        <div className="cove-window__field-row">
          <label htmlFor={`git-worklog-repository-workspace-${repository.id}`}>
            {t('pluginManager.plugins.gitWorklog.workspaceGroupLabel')}
          </label>
          <select
            id={`git-worklog-repository-workspace-${repository.id}`}
            className="cove-field"
            data-testid={`git-worklog-repository-workspace-${repository.id}`}
            value={repository.assignedWorkspaceId ?? ''}
            onChange={event => {
              onChangeAssignedWorkspaceId(event.target.value || null)
            }}
          >
            <option value="">{t('pluginManager.plugins.gitWorklog.externalWorkspaceGroupTitle')}</option>
            {availableWorkspaces.map(workspace => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </div>

        <div className="cove-window__actions">
          <button
            type="button"
            className="cove-window__action cove-window__action--primary"
            data-testid={`git-worklog-repository-dialog-close-${repository.id}`}
            onClick={onClose}
          >
            {t('common.close')}
          </button>
        </div>
      </section>
    </div>
  )
}

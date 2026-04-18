import React, { useMemo } from 'react'
import {
  ChevronDown,
  Download,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  RotateCcw,
  Search,
  Settings,
  SlidersHorizontal,
} from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { AppUpdateState } from '@shared/contracts/dto'

function AppBrandMark({ accentColor }: { accentColor: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 64 64"
      className="app-header__brand-mark"
      data-testid="app-header-brand-mark"
      aria-hidden="true"
    >
      <rect x="3" y="6" width="58" height="52" rx="10" fill="#1B2D52" />
      <rect x="8" y="11" width="48" height="42" rx="4" fill="#FFFFFF" />
      <path d="M18 22 30 29 18 36V31L25 29 18 27Z" fill={accentColor} />
      <rect x="33" y="27" width="11" height="4" rx="2" fill={accentColor} />
    </svg>
  )
}

export function AppHeader({
  activeWorkspaceName,
  activeWorkspacePath,
  isSidebarCollapsed,
  isControlCenterOpen,
  isCommandCenterOpen,
  commandCenterShortcutHint,
  updateState,
  leftHeaderWidgets,
  rightHeaderWidgets,
  onToggleSidebar,
  onToggleControlCenter,
  onToggleCommandCenter,
  onOpenPlugins,
  onOpenSettings,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate,
}: {
  activeWorkspaceName: string | null
  activeWorkspacePath: string | null
  isSidebarCollapsed: boolean
  isControlCenterOpen: boolean
  isCommandCenterOpen: boolean
  commandCenterShortcutHint: string
  updateState: AppUpdateState | null
  leftHeaderWidgets?: React.ReactNode
  rightHeaderWidgets?: React.ReactNode
  onToggleSidebar: () => void
  onToggleControlCenter: () => void
  onToggleCommandCenter: () => void
  onOpenPlugins: () => void
  onOpenSettings: () => void
  onCheckForUpdates: () => void
  onDownloadUpdate: () => void
  onInstallUpdate: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const isDev = typeof window !== 'undefined' && window.freecliApi?.meta?.isDev === true
  const isMac = typeof window !== 'undefined' && window.freecliApi?.meta?.platform === 'darwin'
  const isWindows = typeof window !== 'undefined' && window.freecliApi?.meta?.platform === 'win32'
  const brandAccentColor = isDev ? '#E5484D' : '#20D8A4'
  const ToggleIcon = useMemo(
    () => (isSidebarCollapsed ? PanelLeftOpen : PanelLeftClose),
    [isSidebarCollapsed],
  )
  const updateAction = useMemo(() => {
    if (!updateState) {
      return null
    }

    if (updateState.status === 'available') {
      return {
        label: t('appHeader.updateAvailableShort'),
        title: t('appHeader.updateAvailableTitle', {
          version: updateState.latestVersion ?? updateState.currentVersion,
        }),
        icon: Download,
        disabled: false,
        onClick: onDownloadUpdate,
      }
    }

    if (updateState.status === 'downloading') {
      return {
        label: `${Math.round(updateState.downloadPercent ?? 0)}%`,
        title: t('appHeader.updateDownloadingTitle', {
          version: updateState.latestVersion ?? updateState.currentVersion,
          percent: `${Math.round(updateState.downloadPercent ?? 0)}%`,
        }),
        icon: LoaderCircle,
        disabled: true,
        onClick: onCheckForUpdates,
      }
    }

    if (updateState.status === 'downloaded') {
      return {
        label: t('appHeader.restartToUpdateShort'),
        title: t('appHeader.restartToUpdateTitle', {
          version: updateState.latestVersion ?? updateState.currentVersion,
        }),
        icon: RotateCcw,
        disabled: false,
        onClick: onInstallUpdate,
      }
    }

    return null
  }, [onCheckForUpdates, onDownloadUpdate, onInstallUpdate, t, updateState])
  const UpdateActionIcon = updateAction?.icon ?? Download

  return (
    <header
      className={`app-header ${isMac ? 'app-header--mac' : ''} ${isWindows ? 'app-header--windows' : ''}`.trim()}
      role="banner"
    >
      <div className="app-header__section app-header__section--left">
        <button
          type="button"
          className="app-header__icon-button"
          data-testid="app-header-toggle-primary-sidebar"
          aria-label={t('appHeader.togglePrimarySidebar')}
          aria-pressed={!isSidebarCollapsed}
          title={t('appHeader.togglePrimarySidebar')}
          onClick={() => {
            onToggleSidebar()
          }}
        >
          <ToggleIcon aria-hidden="true" size={18} />
        </button>
        {leftHeaderWidgets}
      </div>

      <div
        className="app-header__center"
        title={activeWorkspacePath ?? undefined}
        aria-label={activeWorkspacePath ?? undefined}
      >
        <button
          type="button"
          className={`app-header__command-center ${isCommandCenterOpen ? 'app-header__command-center--open' : ''}`}
          data-testid="app-header-command-center"
          aria-haspopup="dialog"
          aria-expanded={isCommandCenterOpen}
          aria-label={t('appHeader.commandCenter')}
          title={t('appHeader.commandCenterHint', {
            shortcut: commandCenterShortcutHint,
          })}
          onClick={() => {
            onToggleCommandCenter()
          }}
        >
          <Search aria-hidden="true" size={16} className="app-header__command-center-icon" />
          <AppBrandMark accentColor={brandAccentColor} />
          <span className="app-header__command-center-title">
            {activeWorkspaceName ?? t('appHeader.commandCenterFallbackTitle')}
          </span>
          <span className="app-header__command-center-keycap" aria-hidden="true">
            {commandCenterShortcutHint}
          </span>
          <ChevronDown
            aria-hidden="true"
            size={16}
            className="app-header__command-center-chevron"
          />
        </button>
      </div>

      <div className="app-header__section app-header__section--right">
        {updateAction ? (
          <button
            type="button"
            className={`app-header__update-button${updateAction.disabled ? ' app-header__update-button--disabled' : ''}`}
            data-testid="app-header-update"
            aria-label={updateAction.title}
            title={updateAction.title}
            onClick={() => {
              updateAction.onClick()
            }}
            disabled={updateAction.disabled}
          >
            <UpdateActionIcon
              aria-hidden="true"
              size={16}
              className={
                updateState?.status === 'downloading' ? 'app-header__update-icon--spinning' : ''
              }
            />
            <span>{updateAction.label}</span>
          </button>
        ) : null}
        {rightHeaderWidgets}
        <button
          type="button"
          className={`app-header__icon-button${isControlCenterOpen ? ' app-header__icon-button--active' : ''}`}
          data-testid="app-header-control-center"
          aria-label={t('controlCenter.open')}
          aria-pressed={isControlCenterOpen}
          title={t('controlCenter.open')}
          onClick={() => {
            onToggleControlCenter()
          }}
        >
          <SlidersHorizontal aria-hidden="true" size={18} />
        </button>
        <button
          type="button"
          className="app-header__icon-button"
          data-testid="app-header-plugins"
          aria-label={t('appHeader.plugins')}
          title={t('appHeader.plugins')}
          onClick={() => {
            onOpenPlugins()
          }}
        >
          <Plug aria-hidden="true" size={18} />
        </button>
        <button
          type="button"
          className="app-header__icon-button"
          data-testid="app-header-settings"
          aria-label={t('common.settings')}
          title={t('common.settings')}
          onClick={() => {
            onOpenSettings()
          }}
        >
          <Settings aria-hidden="true" size={18} />
        </button>
      </div>
    </header>
  )
}

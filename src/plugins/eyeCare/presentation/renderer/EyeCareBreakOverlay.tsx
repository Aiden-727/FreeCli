import React from 'react'
import { TimerReset } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { WorkspaceOverlayPluginWidgetProps } from '@contexts/plugins/presentation/renderer/types'
import { useAppStore } from '@app/renderer/shell/store/useAppStore'
import { useEyeCareState } from './useEyeCareState'
import { formatEyeCareRemaining } from './eyeCareFormatting'

export default function EyeCareBreakOverlay({
  onOpenPluginManager: _onOpenPluginManager,
}: WorkspaceOverlayPluginWidgetProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const enabled = useAppStore(state => state.agentSettings.plugins.enabledIds.includes('eye-care'))
  const { state, postponeBreak } = useEyeCareState()

  if (!enabled || !state.isOverlayVisible || state.phase !== 'breaking') {
    return null
  }

  return (
    <div className="eye-care-overlay" data-testid="eye-care-overlay">
      <div className="eye-care-overlay__backdrop" />
      <div className="eye-care-overlay__panel">
        <div className="eye-care-overlay__hero">
          <p className="eye-care-overlay__eyebrow">{t('pluginManager.plugins.eyeCare.title')}</p>
          <h2 className="eye-care-overlay__title">
            {t('pluginManager.plugins.eyeCare.overlay.title')}
          </h2>
          <p className="eye-care-overlay__summary">
            {t('pluginManager.plugins.eyeCare.overlay.summary')}
          </p>
        </div>
        <div className="eye-care-overlay__countdown-shell">
          <div className="eye-care-overlay__countdown-label">
            {t('pluginManager.plugins.eyeCare.overview.remaining')}
          </div>
          <div className="eye-care-overlay__timer">
            {formatEyeCareRemaining(state.remainingSeconds)}
          </div>
        </div>
        <div className="eye-care-overlay__actions">
          {state.canPostpone ? (
            <button type="button" className="cove-window__action" onClick={() => void postponeBreak()}>
              <span className="eye-care-overlay__action-icon" aria-hidden="true">
                <TimerReset size={18} />
              </span>
              <span>{t('pluginManager.plugins.eyeCare.overlay.postpone')}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

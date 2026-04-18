import React from 'react'
import { useTranslation } from '@app/renderer/i18n'
import {
  CANVAS_INPUT_MODES,
  type CanvasInputMode,
  STANDARD_WINDOW_SIZE_BUCKETS,
  type StandardWindowSizeBucket,
} from '@contexts/settings/domain/agentSettings'
import {
  getCanvasInputModeLabel,
  getStandardWindowSizeBucketLabel,
} from '@app/renderer/i18n/labels'
import type { TerminalProfile } from '@shared/contracts/dto'
import { CoveSelect } from '@app/renderer/components/CoveSelect'

export function CanvasSection(props: {
  canvasInputMode: CanvasInputMode
  standardWindowSizeBucket: StandardWindowSizeBucket
  focusNodeOnClick: boolean
  defaultTerminalProfileId: string | null
  terminalProfiles: TerminalProfile[]
  detectedDefaultTerminalProfileId: string | null
  onChangeCanvasInputMode: (mode: CanvasInputMode) => void
  onChangeStandardWindowSizeBucket: (bucket: StandardWindowSizeBucket) => void
  onChangeDefaultTerminalProfileId: (profileId: string | null) => void
  onChangeFocusNodeOnClick: (enabled: boolean) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const {
    canvasInputMode,
    standardWindowSizeBucket,
    focusNodeOnClick,
    defaultTerminalProfileId,
    terminalProfiles,
    detectedDefaultTerminalProfileId,
    onChangeCanvasInputMode,
    onChangeStandardWindowSizeBucket,
    onChangeDefaultTerminalProfileId,
    onChangeFocusNodeOnClick,
  } = props
  const selectedProfileId = terminalProfiles.some(
    profile => profile.id === defaultTerminalProfileId,
  )
    ? defaultTerminalProfileId
    : null

  return (
    <div className="settings-panel__section" id="settings-section-canvas">
      <h3 className="settings-panel__section-title">{t('settingsPanel.canvas.title')}</h3>

      <div className="settings-panel__row">
        <div className="settings-panel__row-label">
          <strong>{t('settingsPanel.canvas.inputModeLabel')}</strong>
          <span>{t('settingsPanel.canvas.inputModeHelp')}</span>
        </div>
        <div className="settings-panel__control">
          <CoveSelect
            id="settings-canvas-input-mode"
            testId="settings-canvas-input-mode"
            value={canvasInputMode}
            options={CANVAS_INPUT_MODES.map(mode => ({
              value: mode,
              label: getCanvasInputModeLabel(t, mode),
            }))}
            onChange={nextValue => onChangeCanvasInputMode(nextValue as CanvasInputMode)}
          />
        </div>
      </div>

      <div className="settings-panel__row">
        <div className="settings-panel__row-label">
          <strong>{t('settingsPanel.canvas.standardWindowSizeLabel')}</strong>
          <span>{t('settingsPanel.canvas.standardWindowSizeHelp')}</span>
        </div>
        <div className="settings-panel__control">
          <CoveSelect
            id="settings-standard-window-size"
            testId="settings-standard-window-size"
            value={standardWindowSizeBucket}
            options={STANDARD_WINDOW_SIZE_BUCKETS.map(bucket => ({
              value: bucket,
              label: getStandardWindowSizeBucketLabel(t, bucket),
            }))}
            onChange={nextValue =>
              onChangeStandardWindowSizeBucket(nextValue as StandardWindowSizeBucket)
            }
          />
        </div>
      </div>

      {terminalProfiles.length > 0 ? (
        <div className="settings-panel__row">
          <div className="settings-panel__row-label">
            <strong>{t('settingsPanel.canvas.terminalProfileLabel')}</strong>
            <span>
              {t('settingsPanel.canvas.terminalProfileHelp', {
                defaultProfile:
                  terminalProfiles.find(profile => profile.id === detectedDefaultTerminalProfileId)
                    ?.label ?? t('settingsPanel.canvas.terminalProfileAuto'),
              })}
            </span>
          </div>
          <div className="settings-panel__control">
            <CoveSelect
              id="settings-terminal-profile"
              testId="settings-terminal-profile"
              value={selectedProfileId ?? ''}
              options={[
                {
                  value: '',
                  label: t('settingsPanel.canvas.terminalProfileAutoWithDefault', {
                    defaultProfile:
                      terminalProfiles.find(
                        profile => profile.id === detectedDefaultTerminalProfileId,
                      )?.label ?? t('settingsPanel.canvas.terminalProfileAuto'),
                  }),
                },
                ...terminalProfiles.map(profile => ({
                  value: profile.id,
                  label: profile.label,
                })),
              ]}
              onChange={nextValue =>
                onChangeDefaultTerminalProfileId(nextValue.trim().length > 0 ? nextValue : null)
              }
            />
          </div>
        </div>
      ) : null}

      <div className="settings-panel__row">
        <div className="settings-panel__row-label">
          <strong>{t('settingsPanel.canvas.focusOnClickLabel')}</strong>
          <span>{t('settingsPanel.canvas.focusOnClickHelp')}</span>
        </div>
        <div className="settings-panel__control">
          <label className="cove-toggle">
            <input
              type="checkbox"
              data-testid="settings-focus-node-on-click"
              checked={focusNodeOnClick}
              onChange={event => onChangeFocusNodeOnClick(event.target.checked)}
            />
            <span className="cove-toggle__slider"></span>
          </label>
        </div>
      </div>
    </div>
  )
}

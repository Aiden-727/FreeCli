import React from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { SystemMonitorHeaderDisplayItem, SystemMonitorStateDto } from '@shared/contracts/dto'
import { AnimatedNumberText } from '../../../shared/presentation/renderer/AnimatedNumberText'
import type { HeaderPluginWidgetProps } from '../../../../contexts/plugins/presentation/renderer/types'
import { formatHeaderPercent, formatHeaderSpeed } from './systemMonitorFormatting'
import { useSystemMonitorState } from './useSystemMonitorState'

interface HeaderMetricItem {
  key: SystemMonitorHeaderDisplayItem
  label: React.ReactNode
  value: number | null
  formatter: (value: number) => string
  fallback?: string
  tone: 'speed' | 'percent'
}

function buildHeaderSummaryTitle(
  state: SystemMonitorStateDto,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (!state.isSupported) {
    return t('pluginManager.plugins.systemMonitor.header.unsupported')
  }

  if (state.lastError) {
    return t('pluginManager.plugins.systemMonitor.header.error', {
      message: state.lastError.message,
    })
  }

  if (state.status === 'starting' || state.status === 'idle') {
    return t('pluginManager.plugins.systemMonitor.header.loading')
  }

  if (state.status === 'disabled') {
    return t('pluginManager.plugins.systemMonitor.header.disabled')
  }

  return t('pluginManager.plugins.systemMonitor.header.ready')
}

function buildHeaderMetricItems(
  state: SystemMonitorStateDto,
  t: ReturnType<typeof useTranslation>['t'],
): HeaderMetricItem[] {
  return state.settings.header.displayItems.map(item => {
    switch (item) {
      case 'download':
        return {
          key: item,
          label: <ArrowDown aria-hidden="true" size={11} strokeWidth={2.2} />,
          value: state.current.downloadBytesPerSecond,
          formatter: formatHeaderSpeed,
          tone: 'speed',
        }
      case 'upload':
        return {
          key: item,
          label: <ArrowUp aria-hidden="true" size={11} strokeWidth={2.2} />,
          value: state.current.uploadBytesPerSecond,
          formatter: formatHeaderSpeed,
          tone: 'speed',
        }
      case 'cpu':
        return {
          key: item,
          label: t('pluginManager.plugins.systemMonitor.metrics.cpu'),
          value: state.current.cpuUsagePercent,
          formatter: value => formatHeaderPercent(value, t),
          tone: 'percent',
        }
      case 'memory':
        return {
          key: item,
          label: t('pluginManager.plugins.systemMonitor.metrics.memory'),
          value: state.current.memoryUsagePercent,
          formatter: value => formatHeaderPercent(value, t),
          tone: 'percent',
        }
      case 'gpu':
        return {
          key: item,
          label: t('pluginManager.plugins.systemMonitor.metrics.gpu'),
          value: state.current.gpuUsagePercent,
          formatter: value => formatHeaderPercent(value, t),
          fallback: t('pluginManager.plugins.systemMonitor.notAvailable'),
          tone: 'percent',
        }
    }
  })
}

export default function SystemMonitorHeaderWidget({
  onOpenPluginManager,
}: HeaderPluginWidgetProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state } = useSystemMonitorState()
  const metricItems = React.useMemo(() => buildHeaderMetricItems(state, t), [state, t])
  const title = React.useMemo(() => buildHeaderSummaryTitle(state, t), [state, t])

  return (
    <button
      type="button"
      className="app-header__system-monitor-button"
      data-testid="app-header-system-monitor"
      aria-label={title}
      title={title}
      onClick={() => onOpenPluginManager('system-monitor')}
    >
      <span className="app-header__system-monitor-strip">
        {metricItems.map(item => (
          <span
            key={item.key}
            className={`app-header__system-monitor-item app-header__system-monitor-item--${item.tone}`}
            data-testid={`app-header-system-monitor-${item.key}`}
          >
            <span className="app-header__system-monitor-label">{item.label}</span>
            <AnimatedNumberText
              as="span"
              className="app-header__system-monitor-value cove-animated-number"
              value={item.value}
              formatter={item.formatter}
              fallback={item.fallback ?? '--'}
              animate={false}
            />
          </span>
        ))}
      </span>
    </button>
  )
}

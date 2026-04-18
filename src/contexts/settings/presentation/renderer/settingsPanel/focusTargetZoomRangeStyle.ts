import type { CSSProperties } from 'react'
import {
  MAX_FOCUS_NODE_TARGET_ZOOM,
  MIN_FOCUS_NODE_TARGET_ZOOM,
} from '@contexts/settings/domain/agentSettings'

const NEUTRAL_FOCUS_TARGET_ZOOM = 1

export function getFocusTargetZoomRangeStyle(): CSSProperties & Record<string, string | number> {
  const neutralTargetZoomRatioRaw =
    (NEUTRAL_FOCUS_TARGET_ZOOM - MIN_FOCUS_NODE_TARGET_ZOOM) /
    (MAX_FOCUS_NODE_TARGET_ZOOM - MIN_FOCUS_NODE_TARGET_ZOOM)
  const neutralTargetZoomRatio = Number.isFinite(neutralTargetZoomRatioRaw)
    ? Math.max(0, Math.min(1, neutralTargetZoomRatioRaw))
    : 0.5

  return {
    '--settings-panel-range-neutral-ratio': neutralTargetZoomRatio,
  }
}

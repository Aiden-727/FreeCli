export interface GitWorklogChartPoint {
  x: number
  y: number
}

export function createGitWorklogPlotPoints(
  values: number[],
  maxValue: number,
  width: number,
  height: number,
  paddingLeft: number,
  paddingRight: number,
  paddingTop: number,
  paddingBottom: number,
): GitWorklogChartPoint[] {
  if (values.length === 0) {
    return []
  }

  const safeMaxValue = Math.max(1, maxValue)
  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingTop - paddingBottom
  const stepX = values.length > 1 ? plotWidth / (values.length - 1) : 0

  return values.map((value, index) => ({
    x: paddingLeft + stepX * index,
    y: paddingTop + plotHeight - (Math.max(0, value) / safeMaxValue) * plotHeight,
  }))
}

export function createGitWorklogSmoothPath(points: GitWorklogChartPoint[]): string {
  if (points.length === 0) {
    return ''
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`
  }

  return points
    .map((point, index) => {
      if (index === 0) {
        return `M ${point.x} ${point.y}`
      }

      const previous = points[index - 1]
      const controlX = (previous.x + point.x) / 2
      return `C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`
    })
    .join(' ')
}

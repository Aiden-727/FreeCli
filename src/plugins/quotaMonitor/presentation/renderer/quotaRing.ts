export function getQuotaRingColor(ratio: number): string {
  if (ratio >= 0.5) {
    return '#34c759'
  }

  if (ratio >= 0.3) {
    return '#3b82f6'
  }

  if (ratio >= 0.1) {
    return '#ff9f0a'
  }

  return '#ff3b30'
}

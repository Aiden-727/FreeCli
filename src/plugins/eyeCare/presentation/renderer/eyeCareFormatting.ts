export function formatEyeCareRemaining(seconds: number): string {
  const safeSeconds = Math.max(0, Math.trunc(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const restSeconds = safeSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`
}

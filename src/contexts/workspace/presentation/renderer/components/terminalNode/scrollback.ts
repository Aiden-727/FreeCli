import { MAX_SCROLLBACK_CHARS } from './constants'
import { resolveSuffixPrefixOverlap } from './overlap'

export function truncateScrollback(snapshot: string): string {
  if (snapshot.length <= MAX_SCROLLBACK_CHARS) {
    return snapshot
  }

  return snapshot.slice(-MAX_SCROLLBACK_CHARS)
}

export function resolveScrollbackDelta(previous: string, next: string): string {
  const previousSnapshot = truncateScrollback(previous)
  const nextSnapshot = truncateScrollback(next)

  if (previousSnapshot.length === 0) {
    return nextSnapshot
  }

  if (nextSnapshot.length === 0 || previousSnapshot === nextSnapshot) {
    return ''
  }

  if (previousSnapshot.includes(nextSnapshot)) {
    return ''
  }

  const overlap = resolveSuffixPrefixOverlap(previousSnapshot, nextSnapshot)
  return nextSnapshot.slice(overlap)
}

export function mergeScrollbackSnapshots(persisted: string, live: string): string {
  const persistedSnapshot = truncateScrollback(persisted)
  const liveSnapshot = truncateScrollback(live)

  if (persistedSnapshot.length === 0) {
    return liveSnapshot
  }

  if (liveSnapshot.length === 0) {
    return persistedSnapshot
  }

  if (persistedSnapshot === liveSnapshot) {
    return liveSnapshot
  }

  if (liveSnapshot.includes(persistedSnapshot)) {
    return liveSnapshot
  }

  if (persistedSnapshot.includes(liveSnapshot)) {
    return persistedSnapshot
  }

  const overlap = resolveSuffixPrefixOverlap(persistedSnapshot, liveSnapshot)
  return truncateScrollback(`${persistedSnapshot}${liveSnapshot.slice(overlap)}`)
}

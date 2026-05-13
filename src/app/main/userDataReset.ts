import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

const USER_DATA_RESET_MARKER_FILE_NAME = 'reset-user-data.json'

interface UserDataResetMarker {
  requestedAt: string
  reason: 'manual_reset'
}

function resolveMarkerPath(userDataPath: string): string {
  return join(userDataPath, USER_DATA_RESET_MARKER_FILE_NAME)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isValidMarkerPayload(value: unknown): value is UserDataResetMarker {
  if (!isRecord(value)) {
    return false
  }

  return value.reason === 'manual_reset' && typeof value.requestedAt === 'string'
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

async function removePath(targetPath: string): Promise<void> {
  await rm(targetPath, { recursive: true, force: true, maxRetries: 4, retryDelay: 120 })
}

export async function writeUserDataResetMarker(userDataPath: string): Promise<void> {
  const markerPath = resolveMarkerPath(userDataPath)
  await mkdir(userDataPath, { recursive: true })
  const payload: UserDataResetMarker = {
    requestedAt: new Date().toISOString(),
    reason: 'manual_reset',
  }
  await writeFile(markerPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export async function consumeAndResetUserDataIfNeeded(userDataPath: string): Promise<boolean> {
  const normalizedUserDataPath = resolve(userDataPath)
  const markerPath = resolveMarkerPath(normalizedUserDataPath)

  if (!(await pathExists(markerPath))) {
    return false
  }

  let marker: unknown = null
  try {
    const raw = await readFile(markerPath, 'utf8')
    marker = JSON.parse(raw)
  } catch {
    // Continue with cleanup even if the marker is partially corrupted.
  }

  if (marker !== null && !isValidMarkerPayload(marker)) {
    throw new Error('用户数据重置标记格式无效。')
  }

  const resetRootPath = resolve(
    dirname(normalizedUserDataPath),
    `${basename(normalizedUserDataPath)}.resetting`,
  )
  await removePath(resetRootPath)

  if (await pathExists(normalizedUserDataPath)) {
    await rename(normalizedUserDataPath, resetRootPath)
  }

  await mkdir(normalizedUserDataPath, { recursive: true })

  try {
    const entries = await readdir(resetRootPath)
    await Promise.all(
      entries
        .filter(entry => entry !== USER_DATA_RESET_MARKER_FILE_NAME)
        .map(entry => removePath(join(resetRootPath, entry))),
    )
    await removePath(resetRootPath)
  } catch {
    await removePath(resetRootPath)
  }

  const nextMarkerPath = resolveMarkerPath(normalizedUserDataPath)
  try {
    await unlink(nextMarkerPath)
  } catch {
    // The marker may already be absent after the directory reset.
  }

  return true
}

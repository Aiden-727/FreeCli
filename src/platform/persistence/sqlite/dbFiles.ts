import { copyFile, rename, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

function formatFileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function backupDbFile(dbPath: string, now: Date): Promise<string | null> {
  if (!(await fileExists(dbPath))) {
    return null
  }

  const stamp = formatFileTimestamp(now)
  const backupPath = resolve(dirname(dbPath), `freecli.db.bak-${stamp}`)

  await copyFile(dbPath, backupPath)
  return backupPath
}

export async function moveCorruptDbAside(dbPath: string, now: Date): Promise<string | null> {
  if (!(await fileExists(dbPath))) {
    return null
  }

  const stamp = formatFileTimestamp(now)
  const nextPath = resolve(dirname(dbPath), `freecli.db.corrupt-${stamp}`)

  await rename(dbPath, nextPath)
  return nextPath
}

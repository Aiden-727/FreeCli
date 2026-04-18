import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

// Branding changes should update both assets together instead of drifting per-platform.
const APPROVED_APP_ICON_HASHES = {
  'build/icon.png': '19d47c2053b83c63fc6c7140ebc6ef52221b0d346b747b6b456d7da64607f088',
  'build/icon.ico': 'f81550f889d7a908d619fb59ea0891328d246942e0fa81c55950f01bc6509089',
} as const

function sha256ForRepoFile(relativePath: string): string {
  const absolutePath = resolve(__dirname, '../../..', relativePath)
  return createHash('sha256').update(readFileSync(absolutePath)).digest('hex')
}

describe('app icon assets', () => {
  it('keeps the approved cross-platform branding assets checked in', () => {
    for (const [relativePath, expectedHash] of Object.entries(APPROVED_APP_ICON_HASHES)) {
      expect(sha256ForRepoFile(relativePath)).toBe(expectedHash)
    }
  })
})

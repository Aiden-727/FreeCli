import { describe, expect, it } from 'vitest'
import { isTrackableGitWorklogFilePath } from '../../../src/plugins/gitWorklog/presentation/main/GitWorklogScanner'

describe('isTrackableGitWorklogFilePath', () => {
  it('keeps source files but excludes dependency and environment artifacts', () => {
    expect(isTrackableGitWorklogFilePath('src/features/worklog/index.ts')).toBe(true)
    expect(isTrackableGitWorklogFilePath('packages/app/lib/main.dart')).toBe(true)

    expect(isTrackableGitWorklogFilePath('node_modules/react/index.js')).toBe(false)
    expect(isTrackableGitWorklogFilePath('.cache/vite/deps/chunk.js')).toBe(false)
    expect(isTrackableGitWorklogFilePath('.npm/_cacache/index-v5/file')).toBe(false)
    expect(isTrackableGitWorklogFilePath('.venv/lib/site-packages/foo.py')).toBe(false)
    expect(isTrackableGitWorklogFilePath('env/lib/site-packages/foo.py')).toBe(false)
    expect(isTrackableGitWorklogFilePath('.env')).toBe(false)
    expect(isTrackableGitWorklogFilePath('.env.production')).toBe(false)
    expect(isTrackableGitWorklogFilePath('pnpm-lock.yaml')).toBe(false)
    expect(isTrackableGitWorklogFilePath('package-lock.json')).toBe(false)
    expect(isTrackableGitWorklogFilePath('.npmrc')).toBe(false)
  })
})

import { test, expect } from '@playwright/test'
import { launchApp, testWorkspacePath } from './workspace-canvas.helpers'

test.describe('PTY Host Isolation', () => {
  test('should survive pty-host crash and spawn again', async () => {
    const { electronApp, window } = await launchApp()

    try {
      const first = await window.evaluate(async cwd => {
        return await window.freecliApi.pty.spawn({ cwd, cols: 80, rows: 24 })
      }, testWorkspacePath)

      expect(first.sessionId).toBeTruthy()

      await window.evaluate(async sessionId => {
        const timeoutMs = 10_000

        await new Promise<void>((resolve, reject) => {
          let unsubscribe: (() => void) | null = null
          const timer = setTimeout(() => {
            unsubscribe?.()
            reject(new Error(`[e2e] timed out waiting for pty exit: ${sessionId}`))
          }, timeoutMs)

          unsubscribe = window.freecliApi.pty.onExit(event => {
            if (event.sessionId !== sessionId) {
              return
            }

            clearTimeout(timer)
            unsubscribe?.()
            resolve()
          })

          void window.freecliApi.pty.debugCrashHost()
        })
      }, first.sessionId)

      const second = await window.evaluate(async cwd => {
        return await window.freecliApi.pty.spawn({ cwd, cols: 80, rows: 24 })
      }, testWorkspacePath)

      expect(second.sessionId).toBeTruthy()
      expect(second.sessionId).not.toBe(first.sessionId)
    } finally {
      await electronApp.close()
    }
  })
})

import path from 'node:path'
import { expect, test } from '@playwright/test'
import { clearAndSeedWorkspace, launchApp, testWorkspacePath } from './workspace-canvas.helpers'

const windowsOnly = process.platform !== 'win32'
const stubScriptPath = path.join(testWorkspacePath, 'scripts', 'test-agent-session-stub.mjs')

test.describe('Workspace Canvas - Terminal Wheel Raw TUI (Windows)', () => {
  test.skip(windowsOnly, 'Windows only')

  test('forwards wheel input to an alternate-screen codex-style TUI', async () => {
    const nodeId = 'node-raw-wheel-windows'
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(window, [
        {
          id: nodeId,
          title: 'terminal-raw-wheel-windows',
          position: { x: 120, y: 120 },
          width: 640,
          height: 360,
        },
      ])

      const terminal = window.locator('.terminal-node').first()
      await expect(terminal).toBeVisible()

      const xterm = terminal.locator('.xterm')
      await expect(xterm).toBeVisible()
      await xterm.click()
      await expect(terminal.locator('.xterm-helper-textarea')).toBeFocused()

      const launchCommand = `node "${stubScriptPath}" codex "${testWorkspacePath}" new default-model raw-alt-screen-wheel-echo`
      await window.keyboard.type(launchCommand)
      await window.keyboard.press('Enter')

      await expect(terminal).toContainText('ALT_SCREEN_WHEEL_READY')
      await window.waitForTimeout(120)

      const sgrWheelReport = '\u001b[<64;120;120M'
      await expect
        .poll(
          async () => {
            return await window.evaluate(
              async ({ currentNodeId, report }) => {
                const currentWindow = window as typeof window & {
                  __freecliWorkspaceCanvasTestApi?: {
                    getSessionIdByNodeId: (nodeId: string) => string | null
                  }
                }
                const sessionId =
                  currentWindow.__freecliWorkspaceCanvasTestApi?.getSessionIdByNodeId(currentNodeId) ??
                  null
                if (!sessionId) {
                  return false
                }

                await Array.from(report).reduce<Promise<void>>((chain, char) => {
                  return chain.then(() =>
                    window.freecliApi.pty.write({
                      sessionId,
                      data: char,
                    }),
                  )
                }, Promise.resolve())
                return true
              },
              { currentNodeId: nodeId, report: sgrWheelReport },
            )
          },
          {
            timeout: 5_000,
            intervals: [100, 150, 250],
          },
        )
        .toBe(true)

      await expect(terminal).toContainText('[freecli-test-wheel] wheel-up')
      await expect(terminal).not.toContainText('[freecli-test-wheel] timeout')
    } finally {
      await electronApp.close()
    }
  })
})

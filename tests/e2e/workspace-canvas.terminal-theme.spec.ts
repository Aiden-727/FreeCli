import { expect, test } from '@playwright/test'
import {
  clearAndSeedWorkspace,
  launchApp,
  selectCoveOption,
  testWorkspacePath,
} from './workspace-canvas.helpers'

test.describe('Workspace Canvas - Terminal Theme', () => {
  test('shows typed terminal input before submit in both themes', async ({
    browserName,
  }, testInfo) => {
    const { electronApp, window } = await launchApp()

    try {
      void browserName

      for (const theme of ['dark', 'light'] as const) {
        await clearAndSeedWorkspace(
          window,
          [
            {
              id: `node-terminal-inline-${theme}`,
              title: `terminal-inline-${theme}`,
              position: { x: 160, y: 140 },
              width: 520,
              height: 320,
            },
          ],
          {
            settings: {
              uiTheme: theme,
            },
          },
        )

        const terminal = window.locator('.terminal-node').first()
        const xterm = terminal.locator('.xterm')
        const helperTextarea = terminal.locator('.xterm-helper-textarea')
        const inlineCommand = `echo INLINE_${theme.toUpperCase()}`

        await expect(terminal).toBeVisible()
        await expect(xterm).toBeVisible()
        await xterm.click()
        await expect(helperTextarea).toBeFocused()
        await window.keyboard.type(inlineCommand)
        await expect(terminal).toContainText(inlineCommand)

        const screenshotPath = testInfo.outputPath(`terminal-inline-${theme}.png`)
        await terminal.screenshot({ path: screenshotPath })
        await testInfo.attach(`terminal-inline-${theme}`, {
          path: screenshotPath,
          contentType: 'image/png',
        })

        await window.keyboard.press('Enter')
        await expect(terminal).toContainText(`INLINE_${theme.toUpperCase()}`)
      }
    } finally {
      await electronApp.close()
    }
  })

  test('keeps terminal theme synchronized after switching ui theme', async ({
    browserName,
  }, testInfo) => {
    const { electronApp, window } = await launchApp()

    try {
      void browserName
      await clearAndSeedWorkspace(
        window,
        [
          {
            id: 'node-terminal-theme',
            title: 'terminal-theme',
            position: { x: 160, y: 140 },
            width: 520,
            height: 320,
          },
        ],
        {
          settings: {
            uiTheme: 'dark',
          },
        },
      )

      const terminalBody = window.locator('.terminal-node__terminal').first()
      await expect(terminalBody).toBeVisible()
      await expect(terminalBody).toHaveAttribute('data-cove-terminal-theme', 'dark')

      const settingsButton = window.locator('[data-testid="app-header-settings"]')
      await settingsButton.click({ noWaitAfter: true })

      await selectCoveOption(window, 'settings-ui-theme', 'light')

      await expect
        .poll(() =>
          window.evaluate(() => {
            return document.documentElement.dataset.coveTheme ?? null
          }),
        )
        .toBe('light')
      await expect(terminalBody).toHaveAttribute('data-cove-terminal-theme', 'light')

      await window.locator('.settings-panel__close').click()

      const screenshotPath = testInfo.outputPath('terminal-theme-light.png')
      await window.screenshot({ path: screenshotPath })
      await testInfo.attach('terminal-theme-light', {
        path: screenshotPath,
        contentType: 'image/png',
      })
    } finally {
      await electronApp.close()
    }
  })

  test('keeps opencode agent terminal frozen to dark after switching ui theme', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(
        window,
        [
          {
            id: 'node-opencode-theme',
            title: 'opencode · qwen',
            position: { x: 160, y: 140 },
            width: 520,
            height: 320,
            kind: 'agent',
            status: 'running',
            startedAt: '2026-03-23T10:00:00.000Z',
            endedAt: null,
            exitCode: null,
            lastError: null,
            agent: {
              provider: 'opencode',
              prompt: 'Investigate theme sync behavior',
              model: 'qwen',
              effectiveModel: 'qwen',
              launchMode: 'new',
              resumeSessionId: 'session-opencode-theme',
              resumeSessionIdVerified: true,
              executionDirectory: testWorkspacePath,
              directoryMode: 'workspace',
              customDirectory: null,
              shouldCreateDirectory: false,
            },
          },
        ],
        {
          settings: {
            uiTheme: 'dark',
          },
        },
      )

      const terminalNode = window.locator('.terminal-node').first()
      const terminalHeader = terminalNode.locator('.terminal-node__header')
      const terminalBody = terminalNode.locator('.terminal-node__terminal')

      await expect(terminalBody).toBeVisible()
      await expect(terminalNode).toHaveAttribute('data-cove-terminal-node-theme', 'dark')
      await expect(terminalBody).toHaveAttribute('data-cove-terminal-theme', 'dark')
      await expect(terminalHeader).toHaveCSS('background-color', 'rgba(18, 28, 50, 0.96)')

      const settingsButton = window.locator('[data-testid="app-header-settings"]')
      await settingsButton.click({ noWaitAfter: true })
      await selectCoveOption(window, 'settings-ui-theme', 'light')

      await expect
        .poll(() =>
          window.evaluate(() => {
            return document.documentElement.dataset.coveTheme ?? null
          }),
        )
        .toBe('light')

      await expect(terminalNode).toHaveAttribute('data-cove-terminal-node-theme', 'dark')
      await expect(terminalBody).toHaveAttribute('data-cove-terminal-theme', 'dark')
      await expect(terminalHeader).toHaveCSS('background-color', 'rgba(18, 28, 50, 0.96)')
    } finally {
      await electronApp.close()
    }
  })
})

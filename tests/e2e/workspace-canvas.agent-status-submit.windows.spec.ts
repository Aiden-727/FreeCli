import { expect, test } from '@playwright/test'
import { clearAndSeedWorkspace, launchApp } from './workspace-canvas.helpers'

const providerCases = [
  { provider: 'codex' as const, model: 'gpt-5.2-codex' },
  { provider: 'claude-code' as const, model: 'claude-sonnet-4-5' },
]
const standbyStatusPattern = /^(Standby|待命)$/
const workingStatusPattern = /^(Working|运行中)$/

for (const providerCase of providerCases) {
  test.describe(`Workspace Canvas - Agent Status Submit (${providerCase.provider})`, () => {
    test('switches to working immediately after submit on Windows', async () => {
      const { electronApp, window } = await launchApp({
        windowMode: 'offscreen',
        env: {
          FREECLI_TEST_ENABLE_SESSION_STATE_WATCHER: '1',
          FREECLI_TEST_AGENT_SESSION_SCENARIO: 'jsonl-stdin-submit-delayed-turn',
        },
      })

      try {
        await clearAndSeedWorkspace(window, [], {
          settings: {
            defaultProvider: providerCase.provider,
            customModelEnabledByProvider: {
              'claude-code': providerCase.provider === 'claude-code',
              codex: providerCase.provider === 'codex',
            },
            customModelByProvider: {
              'claude-code': providerCase.provider === 'claude-code' ? providerCase.model : '',
              codex: providerCase.provider === 'codex' ? providerCase.model : '',
            },
            customModelOptionsByProvider: {
              'claude-code': providerCase.provider === 'claude-code' ? [providerCase.model] : [],
              codex: providerCase.provider === 'codex' ? [providerCase.model] : [],
            },
          },
        })

        const pane = window.locator('.workspace-canvas .react-flow__pane')
        await expect(pane).toBeVisible()
        await pane.click({ button: 'right', position: { x: 320, y: 220 } })

        const runButton = window.locator('[data-testid="workspace-context-run-default-agent"]')
        await expect(runButton).toBeVisible()
        await runButton.click()

        const agentNode = window.locator('.terminal-node').first()
        const nodeStatus = agentNode.locator('.terminal-node__status')
        const sidebarStatus = window
          .locator('.workspace-sidebar .workspace-agent-item .workspace-agent-item__status--agent')
          .first()

        await expect(agentNode).toBeVisible()
        await expect(nodeStatus).toHaveText(standbyStatusPattern)
        await expect(sidebarStatus).toHaveText(standbyStatusPattern)

        const xterm = agentNode.locator('.xterm')
        await xterm.click()
        await expect(agentNode.locator('.xterm-helper-textarea')).toBeFocused()
        await window.keyboard.press('Enter')

        await expect(nodeStatus).toHaveText(workingStatusPattern, { timeout: 1000 })
        await expect(sidebarStatus).toHaveText(workingStatusPattern)
        await expect(nodeStatus).toHaveText(standbyStatusPattern, { timeout: 15000 })
        await expect(sidebarStatus).toHaveText(standbyStatusPattern)
      } finally {
        await electronApp.close()
      }
    })
  })
}

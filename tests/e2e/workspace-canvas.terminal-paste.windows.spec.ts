import { expect, test } from '@playwright/test'
import { clearAndSeedWorkspace, launchApp } from './workspace-canvas.helpers'

const windowsOnly = process.platform !== 'win32'
const PASTED_TOKEN = 'FREECLI_WINDOWS_PASTE_TOKEN'
const DOUBLE_PASTED_TOKEN = `${PASTED_TOKEN}${PASTED_TOKEN}`
const tinyPngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=='

test.describe('Workspace Canvas - Terminal Paste (Windows)', () => {
  test.skip(windowsOnly, 'Windows only')

  test('Ctrl+V pastes clipboard text into the terminal PTY', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await electronApp.evaluate(async ({ clipboard }) => {
        clipboard.clear()
        clipboard.writeText('FREECLI_WINDOWS_PASTE_TOKEN')
      })

      await clearAndSeedWorkspace(window, [
        {
          id: 'node-paste-windows',
          title: 'terminal-paste-windows',
          position: { x: 120, y: 120 },
          width: 520,
          height: 320,
        },
      ])

      const terminal = window.locator('.terminal-node').first()
      await expect(terminal).toBeVisible()

      const xterm = terminal.locator('.xterm')
      await expect(xterm).toBeVisible()
      await xterm.click()
      await expect(terminal.locator('.xterm-helper-textarea')).toBeFocused()

      await window.keyboard.type('Write-Output "')
      await window.keyboard.press('Control+V')
      await window.keyboard.type('"')
      await window.keyboard.press('Enter')

      await expect(terminal).toContainText(PASTED_TOKEN)
      const visibleRows = terminal.locator('.xterm-rows')
      await expect
        .poll(async () => {
          const text = await visibleRows.innerText()
          return {
            hasPastedToken: text.includes(PASTED_TOKEN),
            hasDuplicatedPaste: text.includes(DOUBLE_PASTED_TOKEN),
          }
        })
        .toEqual({
          hasPastedToken: true,
          hasDuplicatedPaste: false,
        })
    } finally {
      await electronApp.close()
    }
  })

  test('Ctrl+V materializes clipboard images into a temporary file path for the terminal', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await electronApp.evaluate(async ({ clipboard, nativeImage }, dataUrl) => {
        clipboard.clear()
        const image = nativeImage.createFromDataURL(dataUrl)
        clipboard.writeImage(image)
      }, tinyPngDataUrl)

      await clearAndSeedWorkspace(window, [
        {
          id: 'node-paste-image-windows',
          title: 'terminal-paste-image-windows',
          position: { x: 120, y: 120 },
          width: 520,
          height: 320,
        },
      ])

      const terminal = window.locator('.terminal-node').first()
      await expect(terminal).toBeVisible()

      const xterm = terminal.locator('.xterm')
      await expect(xterm).toBeVisible()
      await xterm.click()
      await expect(terminal.locator('.xterm-helper-textarea')).toBeFocused()

      await window.keyboard.type('Test-Path ')
      await window.keyboard.press('Control+V')
      await window.keyboard.press('Enter')

      await expect(terminal).toContainText('True')
      await expect(window.locator('.image-node')).toHaveCount(0)
    } finally {
      await electronApp.close()
    }
  })
})

import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { clearAndSeedWorkspace, launchApp } from './workspace-canvas.helpers'

const windowsOnly = process.platform !== 'win32'
const tinyPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=='

test.describe('Workspace Canvas - Terminal Drop (Windows)', () => {
  test.skip(windowsOnly, 'Windows only')

  test('drops an image onto the terminal as a quoted filesystem path', async ({ page }, testInfo) => {
    void page
    const { electronApp, window } = await launchApp()

    try {
      const imagePath = testInfo.outputPath('terminal-drop-image.png')
      await writeFile(imagePath, Buffer.from(tinyPngBase64, 'base64'))

      await clearAndSeedWorkspace(window, [
        {
          id: 'node-drop-windows',
          title: 'terminal-drop-windows',
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

      await window.keyboard.type('Write-Output ')

      await window.evaluate(() => {
        const existing = document.getElementById('terminal-drop-input')
        if (existing) {
          existing.remove()
        }

        const input = document.createElement('input')
        input.id = 'terminal-drop-input'
        input.type = 'file'
        input.style.position = 'fixed'
        input.style.left = '-10000px'
        input.style.top = '-10000px'
        document.body.append(input)
      })

      await window.locator('#terminal-drop-input').setInputFiles(imagePath)

      await window.evaluate(async () => {
        const target = document.querySelector('.terminal-node__terminal')
        if (!(target instanceof HTMLDivElement)) {
          throw new Error('terminal drop target missing')
        }

        const input = document.getElementById('terminal-drop-input')
        if (!(input instanceof HTMLInputElement) || !input.files || input.files.length === 0) {
          throw new Error('terminal drop input missing file')
        }

        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(input.files[0])
        target.dispatchEvent(
          new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer,
          }),
        )
      })

      await expect(terminal).toContainText(`Write-Output '${imagePath}'`)
      await expect(window.locator('.image-node')).toHaveCount(0)
    } finally {
      await electronApp.close()
    }
  })

  test('keeps canvas image drop behavior on the pane', async ({ page }, testInfo) => {
    void page
    const { electronApp, window } = await launchApp()

    try {
      const imagePath = testInfo.outputPath('canvas-drop-image.png')
      await writeFile(imagePath, Buffer.from(tinyPngBase64, 'base64'))

      await clearAndSeedWorkspace(window, [])

      const pane = window.locator('.workspace-canvas .react-flow__pane')
      await expect(pane).toBeVisible()

      await window.evaluate(() => {
        const existing = document.getElementById('canvas-drop-input')
        if (existing) {
          existing.remove()
        }

        const input = document.createElement('input')
        input.id = 'canvas-drop-input'
        input.type = 'file'
        input.style.position = 'fixed'
        input.style.left = '-10000px'
        input.style.top = '-10000px'
        document.body.append(input)
      })

      await window.locator('#canvas-drop-input').setInputFiles(imagePath)

      await window.evaluate(async () => {
        const target = document.querySelector('.workspace-canvas')
        if (!(target instanceof HTMLDivElement)) {
          throw new Error('workspace canvas missing')
        }

        const input = document.getElementById('canvas-drop-input')
        if (!(input instanceof HTMLInputElement) || !input.files || input.files.length === 0) {
          throw new Error('canvas drop input missing file')
        }

        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(input.files[0])

        target.dispatchEvent(
          new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer,
            clientX: 180,
            clientY: 180,
          }),
        )
      })

      await expect(window.locator('.image-node').first()).toBeVisible()
    } finally {
      await electronApp.close()
    }
  })
})

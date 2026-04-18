import { expect, test } from '@playwright/test'
import path from 'path'
import { launchApp } from './workspace-canvas.helpers'

const windowsOnly = process.platform !== 'win32'

test.describe('Application Runtime Icon (Windows)', () => {
  test.skip(windowsOnly, 'Windows only')

  test('uses the .ico runtime icon when launching the app', async () => {
    const { electronApp } = await launchApp()

    try {
      const runtimeIconPath = await electronApp.evaluate(async () => {
        return globalThis.__freecliRuntimeIconTestState?.runtimeIconPath ?? null
      })

      expect(runtimeIconPath).toBeTruthy()
      expect(path.basename(runtimeIconPath ?? '')).toBe('icon.ico')
      expect(path.extname(runtimeIconPath ?? '')).toBe('.ico')
    } finally {
      await electronApp.close()
    }
  })
})

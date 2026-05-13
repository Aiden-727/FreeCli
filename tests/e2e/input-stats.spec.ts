import { expect, test } from '@playwright/test'
import { launchApp, seedWorkspaceState, testWorkspacePath } from './workspace-canvas.helpers'

test.describe('Input Stats Plugin', () => {
  test('opens the Flutter-like input stats page from plugin manager', async ({
    page,
  }, testInfo) => {
    void page
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-input-stats',
        workspaces: [
          {
            id: 'workspace-input-stats',
            name: 'workspace-input-stats',
            path: testWorkspacePath,
            nodes: [],
          },
        ],
        settings: {
          uiTheme: 'dark',
          plugins: {
            enabledIds: ['input-stats'],
          },
        },
      })

      const pluginsButton = window.locator('[data-testid="app-header-plugins"]')
      await expect(pluginsButton).toBeVisible()
      await pluginsButton.click()

      await expect(window.locator('[data-testid="plugin-manager"]')).toBeVisible()
      await window.locator('[data-testid="plugin-manager-nav-input-stats"]').click()

      await expect(
        window.locator('[data-testid="plugin-manager-plugin-input-stats-section"]'),
      ).toBeVisible()
      await expect(window.locator('html')).toHaveAttribute('data-cove-theme', 'dark')
      await expect(window.locator('[data-testid="input-stats-overview"]')).toBeVisible()
      await expect(window.locator('[data-testid="input-stats-today-grid"]')).toBeVisible()
      await expect(window.locator('[data-testid="input-stats-key-distribution"]')).toBeVisible()
      await expect(window.locator('[data-testid="input-stats-history-section"]')).toBeVisible()
      await expect(window.locator('[data-testid="input-stats-history-line-chart"]')).toBeVisible()
      await expect(
        window.locator('[data-testid="input-stats-history-range-actions"]'),
      ).toBeVisible()
      await expect(window.locator('[data-testid="input-stats-history-metric-tabs"]')).toBeVisible()
      await expect(window.locator('[data-testid="input-stats-history-legend"]')).toBeVisible()
      await expect(window.locator('[data-testid="input-stats-cumulative-grid"]')).toBeVisible()
      await expect(
        window.locator('[data-testid="input-stats-cumulative-range-actions"]'),
      ).toBeVisible()
      await expect(
        window.locator('[data-testid="input-stats-distribution-range-actions"]'),
      ).toBeVisible()
      await expect(window.locator('[data-testid="input-stats-zoom-slider"]')).toHaveCount(0)
      await expect(window.locator('[data-testid="input-stats-history-path-clicks"]')).toHaveCount(1)
      await expect(window.locator('[data-testid="input-stats-history-path-keys"]')).toHaveCount(1)
      await expect(window.locator('[data-testid="input-stats-history-path-movement"]')).toHaveCount(
        1,
      )
      await expect(window.locator('[data-testid="input-stats-history-path-scroll"]')).toHaveCount(1)

      await window.locator('[data-testid="input-stats-history-metric-tab-keys"]').click()
      await expect(
        window.locator('[data-testid="input-stats-history-metric-tab-keys"]'),
      ).toHaveClass(/input-stats-history__metric-pill--active/)
      await expect(window.locator('[data-testid="input-stats-history-path-clicks"]')).toHaveCount(0)
      await expect(window.locator('[data-testid="input-stats-history-path-keys"]')).toHaveCount(1)
      await expect(window.locator('[data-testid="input-stats-history-path-movement"]')).toHaveCount(
        0,
      )
      await expect(window.locator('[data-testid="input-stats-history-path-scroll"]')).toHaveCount(0)

      await window.locator('[data-testid="input-stats-history-metric-tab-keys"]').click()
      await expect(
        window.locator('[data-testid="input-stats-history-metric-tab-keys"]'),
      ).not.toHaveClass(/input-stats-history__metric-pill--active/)
      await expect(window.locator('[data-testid="input-stats-history-path-clicks"]')).toHaveCount(1)
      await expect(window.locator('[data-testid="input-stats-history-path-keys"]')).toHaveCount(1)
      await expect(window.locator('[data-testid="input-stats-history-path-movement"]')).toHaveCount(
        1,
      )
      await expect(window.locator('[data-testid="input-stats-history-path-scroll"]')).toHaveCount(1)

      await window.locator('[data-testid="input-stats-cumulative-range-30"]').click()
      await expect(window.locator('[data-testid="input-stats-cumulative-range-30"]')).toHaveClass(
        /input-stats-range-actions__pill--active/,
      )
      await window.locator('[data-testid="input-stats-distribution-range-0"]').click()
      await expect(window.locator('[data-testid="input-stats-distribution-range-0"]')).toHaveClass(
        /input-stats-range-actions__pill--active/,
      )

      const firstKeyBackground = await window
        .locator('.input-stats-heatmap__key')
        .first()
        .evaluate(element => window.getComputedStyle(element).backgroundColor)
      expect(firstKeyBackground).not.toBe('rgb(255, 255, 255)')

      const screenshotPath = testInfo.outputPath('input-stats-dark-theme.png')
      await window.locator('[data-testid="plugin-manager-plugin-input-stats-section"]').screenshot({
        path: screenshotPath,
      })
      await testInfo.attach('input-stats-dark-theme', {
        path: screenshotPath,
        contentType: 'image/png',
      })
    } finally {
      await electronApp.close()
    }
  })
})

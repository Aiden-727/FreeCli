import { expect, test } from '@playwright/test'
import {
  dragLocatorTo,
  launchApp,
  seedWorkspaceState,
  testWorkspacePath,
} from './workspace-canvas.helpers'

async function verifyQuotaMonitorOverviewForThemes(
  themes: readonly ('dark' | 'light')[],
  testInfo: Parameters<typeof test>[1],
  index = 0,
): Promise<void> {
  const theme = themes[index]
  if (!theme) {
    return
  }

  const { electronApp, window } = await launchApp()

  try {
    await seedWorkspaceState(window, {
      activeWorkspaceId: `workspace-plugin-manager-quota-${theme}`,
      workspaces: [
        {
          id: `workspace-plugin-manager-quota-${theme}`,
          name: `workspace-plugin-manager-quota-${theme}`,
          path: testWorkspacePath,
          nodes: [],
        },
      ],
      settings: {
        uiTheme: theme,
        plugins: {
          enabledIds: ['quota-monitor'],
        },
      },
    })

    const pluginsButton = window.locator('[data-testid="app-header-plugins"]')
    await expect(pluginsButton).toBeVisible()
    await pluginsButton.click()

    await expect(window.locator('[data-testid="plugin-manager"]')).toBeVisible()
    await window.locator('[data-testid="plugin-manager-nav-quota-monitor"]').click()

    const overview = window.locator('[data-testid="quota-monitor-overview"]')
    await expect(window.locator('html')).toHaveAttribute('data-cove-theme', theme)
    await expect(overview).toBeVisible()
    await expect(window.locator('[data-testid="quota-monitor-config-key-profiles"]')).toBeVisible()
    await expect(window.locator('[data-testid="quota-monitor-refresh"]')).toBeVisible()

    const surfaceStyle = await overview.evaluate(element => {
      const style = window.getComputedStyle(element)
      return {
        backgroundImage: style.backgroundImage,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
      }
    })

    expect(surfaceStyle.backgroundImage).not.toBe('none')
    expect(surfaceStyle.borderColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(surfaceStyle.boxShadow).not.toBe('none')

    const screenshotPath = testInfo.outputPath(`quota-monitor-overview-${theme}.png`)
    await overview.screenshot({ path: screenshotPath })
    await testInfo.attach(`quota-monitor-overview-${theme}`, {
      path: screenshotPath,
      contentType: 'image/png',
    })
  } finally {
    await electronApp.close()
  }

  await verifyQuotaMonitorOverviewForThemes(themes, testInfo, index + 1)
}

test.describe('Control Center', () => {
  test('opens and toggles theme, sidebar, minimap', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-control-center',
        workspaces: [
          {
            id: 'workspace-control-center',
            name: 'workspace-control-center',
            path: testWorkspacePath,
            nodes: [],
          },
        ],
        settings: {
          uiTheme: 'dark',
          isPrimarySidebarCollapsed: false,
        },
      })

      const pane = window.locator('.workspace-canvas .react-flow__pane')
      await expect(pane).toBeVisible()

      const controlCenterButton = window.locator('[data-testid="app-header-control-center"]')
      await expect(controlCenterButton).toBeVisible()
      await controlCenterButton.click()

      await expect(window.locator('[data-testid="control-center"]')).toBeVisible()

      await window.locator('[data-testid="control-center-theme-light"]').click()
      await expect(window.locator('html')).toHaveAttribute('data-cove-theme', 'light')

      const sidebar = window.locator('.workspace-sidebar')
      await expect(sidebar).toBeVisible()
      await window.locator('[data-testid="control-center-toggle-sidebar"]').click()
      await expect(sidebar).toBeHidden()

      const minimap = window.locator('.workspace-canvas__minimap')
      const wasMinimapVisible = (await minimap.count()) > 0
      await window.locator('[data-testid="control-center-toggle-minimap"]').click()
      await expect(minimap).toHaveCount(wasMinimapVisible ? 0 : 1)
    } finally {
      await electronApp.close()
    }
  })

  test('opens settings from Control Center', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-control-center-settings',
        workspaces: [
          {
            id: 'workspace-control-center-settings',
            name: 'workspace-control-center-settings',
            path: testWorkspacePath,
            nodes: [],
          },
        ],
      })

      const controlCenterButton = window.locator('[data-testid="app-header-control-center"]')
      await expect(controlCenterButton).toBeVisible()
      await controlCenterButton.click()

      await expect(window.locator('[data-testid="control-center"]')).toBeVisible()
      await window.locator('[data-testid="control-center-open-settings"]').click()

      await expect(window.locator('[data-testid="settings-section-nav-general"]')).toBeVisible()
      await expect(window.locator('[data-testid="plugin-manager"]')).toHaveCount(0)
      await expect(window.locator('[data-testid="control-center"]')).toHaveCount(0)
    } finally {
      await electronApp.close()
    }
  })

  test('renders enabled plugin widgets in Control Center and opens plugin manager from the widget', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-control-center-plugin',
        workspaces: [
          {
            id: 'workspace-control-center-plugin',
            name: 'workspace-control-center-plugin',
            path: testWorkspacePath,
            nodes: [],
          },
        ],
        settings: {
          plugins: {
            enabledIds: ['input-stats'],
          },
        },
      })

      const controlCenterButton = window.locator('[data-testid="app-header-control-center"]')
      await expect(controlCenterButton).toBeVisible()
      await controlCenterButton.click()

      const pluginWidget = window.locator('[data-testid="control-center-plugin-input-stats"]')
      await expect(pluginWidget).toBeVisible()
      await pluginWidget.click()

      await expect(window.locator('[data-testid="plugin-manager"]')).toBeVisible()
      await expect(
        window.locator('[data-testid="plugin-manager-nav-input-stats"]'),
      ).toHaveClass(/settings-panel__nav-button--active/)
    } finally {
      await electronApp.close()
    }
  })

  test('opens plugin manager from the app header', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-plugin-manager',
        workspaces: [
          {
            id: 'workspace-plugin-manager',
            name: 'workspace-plugin-manager',
            path: testWorkspacePath,
            nodes: [],
          },
        ],
      })

      const pluginsButton = window.locator('[data-testid="app-header-plugins"]')
      await expect(pluginsButton).toBeVisible()
      await pluginsButton.click()

      await expect(window.locator('[data-testid="plugin-manager"]')).toBeVisible()
      await expect(
        window.locator('[data-testid="plugin-manager-card-quota-monitor"]'),
      ).toBeVisible()
      await expect(window.locator('[data-testid="settings-section-nav-general"]')).toHaveCount(0)
    } finally {
      await electronApp.close()
    }
  })

  test('shows the quota monitor overview panel in plugin manager', async ({ page }, testInfo) => {
    void page
    await verifyQuotaMonitorOverviewForThemes(['dark', 'light'], testInfo)
  })

  test('shows the git worklog repository manager dialog in plugin manager', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-plugin-manager-git-worklog',
        workspaces: [
          {
            id: 'workspace-plugin-manager-git-worklog',
            name: 'workspace-plugin-manager-git-worklog',
            path: testWorkspacePath,
            nodes: [],
          },
        ],
        settings: {
          plugins: {
            enabledIds: ['git-worklog'],
            gitWorklog: {
              repositories: [
                {
                  id: 'repo_1',
                  label: 'Workspace Root',
                  path: testWorkspacePath,
                  enabled: true,
                },
                {
                  id: 'repo_2',
                  label: 'Workspace API',
                  path: `${testWorkspacePath}\\api`,
                  enabled: false,
                },
              ],
            },
          },
        },
      })

      const pluginsButton = window.locator('[data-testid="app-header-plugins"]')
      await expect(pluginsButton).toBeVisible()
      await pluginsButton.click()

      await expect(window.locator('[data-testid="plugin-manager"]')).toBeVisible()
      await window.locator('[data-testid="plugin-manager-nav-git-worklog"]').click()

      await expect(window.locator('[data-testid="git-worklog-summary-trend"]')).toBeVisible()
      await expect(window.locator('[data-testid="git-worklog-heatmap"]')).toBeVisible()
      await expect(window.locator('[data-testid="git-worklog-open-config-dialog"]')).toBeVisible()
      await window.locator('[data-testid="git-worklog-open-config-dialog"]').click()
      await expect(window.locator('[data-testid="git-worklog-imported-workspaces"]')).toBeVisible()
      await window.locator('[data-testid="git-worklog-config-dialog-close"]').click()
      await expect(
        window.locator('[data-testid="git-worklog-manage-repository-repo_1"]'),
      ).toBeVisible()
      await window.locator('[data-testid="git-worklog-manage-repository-repo_1"]').click()
      await expect(
        window.locator('[data-testid="git-worklog-repository-dialog-repo_1"]'),
      ).toBeVisible()
    } finally {
      await electronApp.close()
    }
  })

  test('moves a git worklog repository into another stats group by drag and drop', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace_a',
        workspaces: [
          {
            id: 'workspace_a',
            name: 'Drone',
            path: 'D:\\Project\\Drone',
            nodes: [],
          },
          {
            id: 'workspace_b',
            name: 'Console',
            path: 'D:\\Project\\Console',
            nodes: [],
          },
        ],
        settings: {
          plugins: {
            enabledIds: ['git-worklog'],
            gitWorklog: {
              repositories: [
                {
                  id: 'repo_1',
                  label: 'Drone API',
                  path: 'D:\\Project\\Drone\\api',
                  enabled: true,
                  origin: 'manual',
                  assignedWorkspaceId: null,
                },
                {
                  id: 'repo_2',
                  label: 'Console Admin',
                  path: 'D:\\Project\\Console\\admin',
                  enabled: true,
                  origin: 'manual',
                  assignedWorkspaceId: null,
                },
              ],
            },
          },
        },
      })

      const pluginsButton = window.locator('[data-testid="app-header-plugins"]')
      await expect(pluginsButton).toBeVisible()
      await pluginsButton.click()

      await expect(window.locator('[data-testid="plugin-manager"]')).toBeVisible()
      await window.locator('[data-testid="plugin-manager-nav-git-worklog"]').click()

      await window.locator('[data-testid="git-worklog-manage-repository-repo_2"]').click()
      await expect(window.locator('[data-testid="git-worklog-repository-dialog-repo_2"]')).toBeVisible()
      await window
        .locator('[data-testid="git-worklog-repository-workspace-repo_2"]')
        .selectOption('workspace_b')
      await window.locator('[data-testid="git-worklog-repository-dialog-close-repo_2"]').click()
      await expect(
        window.locator('[data-testid="git-worklog-repository-dialog-repo_2"]'),
      ).toHaveCount(0)

      const sourceRepo = window.locator('[data-testid="git-worklog-repo-card-repo_1"]')
      const targetGroup = window.locator('[data-testid="git-worklog-workspace-card-workspace_b"]')
      await expect(sourceRepo).toBeVisible()
      await expect(targetGroup).toBeVisible()
      await expect(targetGroup.locator('[data-testid="git-worklog-repo-card-repo_2"]')).toBeVisible()
      await expect(targetGroup.locator('[data-testid="git-worklog-repo-card-repo_1"]')).toHaveCount(0)

      await dragLocatorTo(window, sourceRepo, targetGroup.locator('.git-worklog-overview__repo-list'), {
        sourcePosition: { x: 24, y: 24 },
        steps: 20,
      })

      await expect(targetGroup.locator('[data-testid="git-worklog-repo-card-repo_1"]')).toBeVisible()
      await expect(targetGroup.locator('[data-testid="git-worklog-repo-card-repo_2"]')).toBeVisible()
    } finally {
      await electronApp.close()
    }
  })

  test('shows quota monitor header widget and opens the quota plugin page', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-plugin-header-quota',
        workspaces: [
          {
            id: 'workspace-plugin-header-quota',
            name: 'workspace-plugin-header-quota',
            path: testWorkspacePath,
            nodes: [],
          },
        ],
        settings: {
          plugins: {
            enabledIds: ['quota-monitor'],
          },
        },
      })

      await expect(window.locator('[data-testid="app-header-quota-monitor"]')).toBeVisible()
      await window.locator('[data-testid="app-header-quota-monitor"]').click()

      await expect(window.locator('[data-testid="plugin-manager"]')).toBeVisible()
      await expect(
        window.locator('[data-testid="plugin-manager-plugin-quota-monitor-section"]'),
      ).toBeVisible()
    } finally {
      await electronApp.close()
    }
  })

  test('shows system monitor header widget and still opens the system monitor page', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-plugin-header-system-monitor',
        workspaces: [
          {
            id: 'workspace-plugin-header-system-monitor',
            name: 'workspace-plugin-header-system-monitor',
            path: testWorkspacePath,
            nodes: [],
          },
        ],
        settings: {
          plugins: {
            enabledIds: ['system-monitor', 'oss-backup'],
            systemMonitor: {
              pollIntervalMs: 1000,
              backgroundPollIntervalMs: 1000,
              saveIntervalMs: 30000,
              historyRangeDays: 7,
              gpuMode: 'off',
              header: {
                displayItems: ['download', 'upload', 'cpu'],
              },
            },
          },
        },
      })

      const systemMonitorWidget = window.locator('[data-testid="app-header-system-monitor"]')
      await expect(systemMonitorWidget).toBeVisible()
      await expect(window.locator('[data-testid="app-header-system-monitor-download"]')).toBeVisible()
      await expect(window.locator('[data-testid="app-header-system-monitor-upload"]')).toBeVisible()
      await expect(window.locator('[data-testid="app-header-system-monitor-cpu"]')).toBeVisible()

      await systemMonitorWidget.click()

      await expect(window.locator('[data-testid="plugin-manager"]')).toBeVisible()
      await expect(
        window.locator('[data-testid="plugin-manager-plugin-system-monitor-section"]'),
      ).toBeVisible()
    } finally {
      await electronApp.close()
    }
  })
})

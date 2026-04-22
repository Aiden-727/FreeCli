import { expect, test } from '@playwright/test'
import {
  createTestUserDataDir,
  dragMouse,
  launchApp,
  removePathWithRetry,
  seedWorkspaceState,
  storageKey,
  testWorkspacePath,
} from './workspace-canvas.helpers'

test.describe('Workspace Canvas - Sidebar Workspaces', () => {
  test('keeps settings visible while the project list scrolls', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-scroll-0',
        workspaces: Array.from({ length: 18 }, (_, index) => ({
          id: `workspace-scroll-${index}`,
          name: `workspace-scroll-${index}`,
          path: `${testWorkspacePath}-scroll-${index}`,
          nodes: [],
        })),
      })

      const sidebar = window.locator('.workspace-sidebar')
      const sidebarList = window.locator('.workspace-sidebar__list')
      const settingsButton = window.locator('[data-testid="app-header-settings"]')
      const lastWorkspaceName = window.locator('.workspace-item__name', {
        hasText: 'workspace-scroll-17',
      })

      await expect(settingsButton).toBeVisible()

      const sidebarMetrics = await sidebarList.evaluate(element => {
        element.scrollTop = element.scrollHeight

        return {
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          scrollTop: element.scrollTop,
        }
      })

      expect(sidebarMetrics.scrollHeight).toBeGreaterThan(sidebarMetrics.clientHeight)
      expect(sidebarMetrics.scrollTop).toBeGreaterThan(0)
      await expect(lastWorkspaceName).toBeVisible()
      await expect(sidebar).toBeVisible()
      await expect(settingsButton).toBeVisible()
    } finally {
      await electronApp.close()
    }
  })

  test('shows agents under each workspace and focuses selected workspace', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-a',
        workspaces: [
          {
            id: 'workspace-a',
            name: 'workspace-a',
            path: testWorkspacePath,
            nodes: [
              {
                id: 'agent-node-a',
                title: 'codex · gpt-5.2-codex',
                position: { x: 120, y: 120 },
                width: 520,
                height: 320,
                kind: 'agent',
                status: 'running',
                startedAt: '2026-02-09T08:00:00.000Z',
                endedAt: null,
                exitCode: null,
                lastError: null,
                agent: {
                  provider: 'codex',
                  prompt: 'task a',
                  model: 'gpt-5.2-codex',
                  effectiveModel: 'gpt-5.2-codex',
                  launchMode: 'new',
                  resumeSessionId: null,
                  executionDirectory: testWorkspacePath,
                  directoryMode: 'workspace',
                  customDirectory: null,
                  shouldCreateDirectory: false,
                },
              },
            ],
          },
          {
            id: 'workspace-b',
            name: 'workspace-b',
            path: `${testWorkspacePath}-b`,
            nodes: [
              {
                id: 'agent-node-b',
                title: 'claude · claude-opus-4-6',
                position: { x: 560, y: 420 },
                width: 520,
                height: 320,
                kind: 'agent',
                status: 'running',
                startedAt: '2026-02-09T09:00:00.000Z',
                endedAt: null,
                exitCode: null,
                lastError: null,
                agent: {
                  provider: 'claude-code',
                  prompt: 'task b',
                  model: 'claude-opus-4-6',
                  effectiveModel: 'claude-opus-4-6',
                  launchMode: 'new',
                  resumeSessionId: null,
                  executionDirectory: `${testWorkspacePath}-b`,
                  directoryMode: 'workspace',
                  customDirectory: null,
                  shouldCreateDirectory: false,
                },
              },
            ],
          },
        ],
      })

      const workspaceAGroup = window
        .locator('.workspace-item-group')
        .filter({ has: window.locator('.workspace-item__name', { hasText: 'workspace-a' }) })
      const workspaceBGroup = window
        .locator('.workspace-item-group')
        .filter({ has: window.locator('.workspace-item__name', { hasText: 'workspace-b' }) })

      await expect(
        workspaceAGroup.locator('.workspace-item__agents .workspace-agent-item'),
      ).toHaveCount(1)
      await expect(
        workspaceBGroup.locator('.workspace-item__agents .workspace-agent-item'),
      ).toHaveCount(1)

      await expect(
        workspaceAGroup.locator('[data-testid="workspace-agent-item-workspace-a-agent-node-a"]'),
      ).toBeVisible()
      await expect(
        workspaceBGroup.locator('[data-testid="workspace-agent-item-workspace-b-agent-node-b"]'),
      ).toBeVisible()

      await window.locator('[data-testid="workspace-agent-item-workspace-b-agent-node-b"]').click()
      await expect(window.locator('.workspace-item.workspace-item--active')).toContainText(
        'workspace-b',
      )
      await expect(window.locator('.terminal-node__title').first()).toContainText('claude')

      await window.locator('[data-testid="workspace-agent-item-workspace-a-agent-node-a"]').click()
      await expect(window.locator('.workspace-item.workspace-item--active')).toContainText(
        'workspace-a',
      )
      await expect(window.locator('.terminal-node__title').first()).toContainText('codex')
    } finally {
      await electronApp.close()
    }
  })

  test('shows steady green terminal status dot when all terminals are completed', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-active-other',
        workspaces: [
          {
            id: 'workspace-active-other',
            name: 'workspace-active-other',
            path: `${testWorkspacePath}-active-other`,
            nodes: [],
          },
          {
            id: 'workspace-project-done',
            name: 'workspace-project-done',
            path: testWorkspacePath,
            nodes: [
              {
                id: 'terminal-done-a',
                title: 'terminal-done-a',
                position: { x: 120, y: 120 },
                width: 460,
                height: 300,
                kind: 'terminal',
                status: 'exited',
                startedAt: '2026-02-09T08:00:00.000Z',
                endedAt: '2026-02-09T08:15:00.000Z',
                exitCode: 0,
                lastError: null,
              },
              {
                id: 'terminal-done-b',
                title: 'terminal-done-b',
                position: { x: 120, y: 460 },
                width: 460,
                height: 300,
                kind: 'terminal',
                status: 'exited',
                startedAt: '2026-02-09T09:00:00.000Z',
                endedAt: '2026-02-09T09:20:00.000Z',
                exitCode: 0,
                lastError: null,
              },
            ],
          },
        ],
      })

      const statusDot = window.locator(
        '[data-testid="workspace-status-dot-workspace-project-done"]',
      )

      await expect(statusDot).toBeVisible()
      await expect(statusDot).toHaveClass(/workspace-item__status-dot--done/)
      await expect(statusDot).toHaveClass(/workspace-item__status-dot--steady/)
      await expect(statusDot).not.toHaveClass(/workspace-item__status-dot--pulse/)
    } finally {
      await electronApp.close()
    }
  })

  test('shows pulsing green terminal status dot while at least one terminal is running', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-project-active',
        workspaces: [
          {
            id: 'workspace-project-active',
            name: 'workspace-project-active',
            path: testWorkspacePath,
            nodes: [
              {
                id: 'terminal-running',
                title: 'terminal-running',
                position: { x: 120, y: 120 },
                width: 460,
                height: 300,
                kind: 'terminal',
                status: 'running',
                startedAt: '2026-02-09T08:00:00.000Z',
                endedAt: null,
                exitCode: null,
                lastError: null,
              },
              {
                id: 'terminal-standby',
                title: 'terminal-standby',
                position: { x: 520, y: 120 },
                width: 460,
                height: 300,
                kind: 'terminal',
                status: 'standby',
                startedAt: '2026-02-09T07:30:00.000Z',
                endedAt: null,
                exitCode: null,
                lastError: null,
              },
            ],
          },
        ],
      })

      const statusDot = window.locator(
        '[data-testid="workspace-status-dot-workspace-project-active"]',
      )

      await expect(statusDot).toBeVisible()
      await expect(statusDot).toHaveClass(/workspace-item__status-dot--active/)
      await expect(statusDot).toHaveClass(/workspace-item__status-dot--pulse/)
    } finally {
      await electronApp.close()
    }
  })

  test('keeps restoring terminals in active status until runtime state arrives', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-project-restoring',
        workspaces: [
          {
            id: 'workspace-project-restoring',
            name: 'workspace-project-restoring',
            path: testWorkspacePath,
            nodes: [
              {
                id: 'terminal-restoring',
                title: 'terminal-restoring',
                position: { x: 120, y: 120 },
                width: 460,
                height: 300,
                kind: 'terminal',
                status: 'restoring',
                startedAt: '2026-02-09T08:00:00.000Z',
                endedAt: null,
                exitCode: null,
                lastError: null,
                hostedAgent: {
                  provider: 'codex',
                  state: 'active',
                  promptHint: null,
                  lastError: null,
                  restoreIntent: true,
                  model: null,
                },
              },
            ],
          },
        ],
      })

      const statusDot = window.locator(
        '[data-testid="workspace-status-dot-workspace-project-restoring"]',
      )
      const popover = window.locator(
        '[data-testid="workspace-status-popover-workspace-project-restoring"]',
      )

      await expect(statusDot).toBeVisible()
      await expect(statusDot).toHaveClass(/workspace-item__status-dot--active/)
      await expect(statusDot).toHaveClass(/workspace-item__status-dot--pulse/)

      await window
        .locator('[data-testid="workspace-status-trigger-workspace-project-restoring"]')
        .hover()
      await expect(popover).toBeVisible()
      await expect(popover).toContainText(/恢复中|Restoring/)
    } finally {
      await electronApp.close()
    }
  })

  test('shows error terminal status dot when any terminal fails', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-terminal-status',
        workspaces: [
          {
            id: 'workspace-terminal-status',
            name: 'workspace-terminal-status',
            path: testWorkspacePath,
            nodes: [
              {
                id: 'terminal-running',
                title: 'terminal-running',
                position: { x: 120, y: 120 },
                width: 460,
                height: 300,
                kind: 'terminal',
                status: 'running',
                startedAt: '2026-02-09T08:00:00.000Z',
                endedAt: null,
                exitCode: null,
                lastError: null,
              },
              {
                id: 'terminal-failed',
                title: 'terminal-failed',
                position: { x: 120, y: 460 },
                width: 460,
                height: 300,
                kind: 'terminal',
                status: 'failed',
                startedAt: '2026-02-09T09:00:00.000Z',
                endedAt: '2026-02-09T09:03:00.000Z',
                exitCode: 1,
                lastError: 'process crashed',
              },
            ],
          },
        ],
      })

      const workspaceGroup = window.locator('.workspace-item-group').filter({
        has: window.locator('.workspace-item__name', { hasText: 'workspace-terminal-status' }),
      })

      await expect(
        workspaceGroup.locator('[data-testid="workspace-status-dot-workspace-terminal-status"]'),
      ).toBeVisible()
      await expect(
        workspaceGroup.locator('[data-testid="workspace-status-dot-workspace-terminal-status"]'),
      ).toHaveClass(/workspace-item__status-dot--error/)
      await expect(
        workspaceGroup.locator('[data-testid="workspace-status-dot-workspace-terminal-status"]'),
      ).toHaveClass(/workspace-item__status-dot--steady/)
      await expect(workspaceGroup.locator('.workspace-item__meta')).toContainText(
        /2 个终端|2 terminals/,
      )
    } finally {
      await electronApp.close()
    }
  })

  test('shows yellow terminal status dot when all terminals are standby', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-terminal-standby',
        workspaces: [
          {
            id: 'workspace-terminal-standby',
            name: 'workspace-terminal-standby',
            path: `${testWorkspacePath}-standby`,
            nodes: [
              {
                id: 'terminal-standby-a',
                title: 'terminal-standby-a',
                position: { x: 120, y: 120 },
                width: 460,
                height: 300,
                kind: 'terminal',
                status: 'standby',
                startedAt: '2026-02-09T08:00:00.000Z',
                endedAt: null,
                exitCode: null,
                lastError: null,
              },
              {
                id: 'terminal-standby-b',
                title: 'terminal-standby-b',
                position: { x: 120, y: 460 },
                width: 460,
                height: 300,
                kind: 'terminal',
                status: 'standby',
                startedAt: '2026-02-09T08:30:00.000Z',
                endedAt: null,
                exitCode: null,
                lastError: null,
              },
            ],
          },
        ],
      })

      const statusDot = window.locator(
        '[data-testid="workspace-status-dot-workspace-terminal-standby"]',
      )

      await expect(statusDot).toBeVisible()
      await expect(statusDot).toHaveClass(/workspace-item__status-dot--standby/)
      await expect(statusDot).toHaveClass(/workspace-item__status-dot--steady/)
      await expect(statusDot).not.toHaveClass(/workspace-item__status-dot--pulse/)
    } finally {
      await electronApp.close()
    }
  })

  test('shows terminal status hover card with per-terminal runtime details', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-terminal-hover',
        workspaces: [
          {
            id: 'workspace-terminal-hover',
            name: 'workspace-terminal-hover',
            path: `${testWorkspacePath}-hover`,
            nodes: [
              {
                id: 'terminal-hover-running',
                title: 'terminal-hover-running',
                position: { x: 120, y: 120 },
                width: 460,
                height: 300,
                kind: 'terminal',
                status: 'running',
                startedAt: '2026-02-09T08:00:00.000Z',
                endedAt: null,
                exitCode: null,
                lastError: null,
              },
              {
                id: 'terminal-hover-done',
                title: 'terminal-hover-done',
                position: { x: 120, y: 460 },
                width: 460,
                height: 300,
                kind: 'terminal',
                status: 'exited',
                startedAt: '2026-02-09T07:10:00.000Z',
                endedAt: '2026-02-09T07:55:00.000Z',
                exitCode: 0,
                lastError: null,
              },
            ],
          },
        ],
      })

      const trigger = window.locator(
        '[data-testid="workspace-status-trigger-workspace-terminal-hover"]',
      )
      const popover = window.locator(
        '[data-testid="workspace-status-popover-workspace-terminal-hover"]',
      )

      await trigger.hover()
      await expect(popover).toBeVisible()
      await expect(popover).toContainText(/终端状态：进行中|Terminal status: In progress/)
      await expect(popover).toContainText('terminal-hover-running')
      await expect(popover).toContainText('terminal-hover-done')
      await expect(popover).toContainText(/运行中|Working/)
      await expect(popover).toContainText(/已退出|Exited/)
    } finally {
      await electronApp.close()
    }
  })

  test('reorders projects by drag and keeps the order after relaunch', async () => {
    const userDataDir = await createTestUserDataDir()
    let firstApp: Awaited<ReturnType<typeof launchApp>> | null = null
    let secondApp: Awaited<ReturnType<typeof launchApp>> | null = null

    try {
      firstApp = await launchApp({ userDataDir, cleanupUserDataDir: false })

      await seedWorkspaceState(firstApp.window, {
        activeWorkspaceId: 'workspace-order-a',
        workspaces: [
          {
            id: 'workspace-order-a',
            name: 'workspace-order-a',
            path: `${testWorkspacePath}-order-a`,
            nodes: [],
          },
          {
            id: 'workspace-order-b',
            name: 'workspace-order-b',
            path: `${testWorkspacePath}-order-b`,
            nodes: [],
          },
          {
            id: 'workspace-order-c',
            name: 'workspace-order-c',
            path: `${testWorkspacePath}-order-c`,
            nodes: [],
          },
        ],
      })

      const draggedWorkspace = firstApp.window
        .locator('.workspace-item')
        .filter({
          has: firstApp.window.locator('.workspace-item__name', { hasText: 'workspace-order-c' }),
        })
        .first()
      const targetWorkspace = firstApp.window
        .locator('.workspace-item')
        .filter({
          has: firstApp.window.locator('.workspace-item__name', { hasText: 'workspace-order-a' }),
        })
        .first()

      await expect(draggedWorkspace).toBeVisible()
      await expect(targetWorkspace).toBeVisible()

      const sidebarList = firstApp.window.locator('.workspace-sidebar__list')

      const draggedBox = await draggedWorkspace.boundingBox()
      const targetBox = await targetWorkspace.boundingBox()
      if (!draggedBox || !targetBox) {
        throw new Error('workspace sidebar item bounding box unavailable')
      }

      await firstApp.window.evaluate(
        ({ sourceId, targetId }) => {
          const source = document.querySelector<HTMLElement>(`[data-testid="${sourceId}"]`)
          const target = document.querySelector<HTMLElement>(`[data-testid="${targetId}"]`)
          if (!source || !target) {
            throw new Error('workspace drag source or target not found')
          }

          const sourceRect = source.getBoundingClientRect()
          const targetRect = target.getBoundingClientRect()
          const sourceCenterX = sourceRect.left + sourceRect.width / 2
          const sourceCenterY = sourceRect.top + sourceRect.height / 2
          const targetCenterX = targetRect.left + targetRect.width / 2
          const targetCenterY = targetRect.top + targetRect.height / 2

          source.dispatchEvent(
            new MouseEvent('mousedown', {
              bubbles: true,
              cancelable: true,
              button: 0,
              buttons: 1,
              clientX: sourceCenterX,
              clientY: sourceCenterY,
              view: window,
            }),
          )

          window.dispatchEvent(
            new MouseEvent('mousemove', {
              bubbles: true,
              cancelable: true,
              button: 0,
              buttons: 1,
              clientX: sourceCenterX,
              clientY: sourceCenterY - 12,
              view: window,
            }),
          )

          window.dispatchEvent(
            new MouseEvent('mousemove', {
              bubbles: true,
              cancelable: true,
              button: 0,
              buttons: 1,
              clientX: targetCenterX,
              clientY: targetCenterY,
              view: window,
            }),
          )

          window.dispatchEvent(
            new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              button: 0,
              buttons: 0,
              clientX: targetCenterX,
              clientY: targetCenterY,
              view: window,
            }),
          )
        },
        {
          sourceId: 'workspace-item-workspace-order-c',
          targetId: 'workspace-item-workspace-order-a',
        },
      )

      await expect
        .poll(async () => {
          return await sidebarList.evaluate(element => ({
            hasHorizontalOverflow: element.scrollWidth > element.clientWidth,
            scrollLeft: element.scrollLeft,
          }))
        })
        .toEqual({
          hasHorizontalOverflow: false,
          scrollLeft: 0,
        })

      await expect
        .poll(async () => {
          return await firstApp?.window
            .locator('.workspace-sidebar .workspace-item__name')
            .evaluateAll(nodes => nodes.map(node => node.textContent?.trim() ?? ''))
        })
        .toEqual(['workspace-order-c', 'workspace-order-a', 'workspace-order-b'])

      await expect
        .poll(async () => {
          return await firstApp?.window.evaluate(async key => {
            void key

            const raw = await window.freecliApi.persistence.readWorkspaceStateRaw()
            if (!raw) {
              return null
            }

            const parsed = JSON.parse(raw) as {
              workspaces?: Array<{
                id?: string
              }>
            }

            return (parsed.workspaces ?? [])
              .map(workspace => (typeof workspace.id === 'string' ? workspace.id : ''))
              .filter(id => id.length > 0)
          }, storageKey)
        })
        .toEqual(['workspace-order-c', 'workspace-order-a', 'workspace-order-b'])

      await firstApp.electronApp.close()
      firstApp = null

      secondApp = await launchApp({ userDataDir, cleanupUserDataDir: false })

      await expect
        .poll(async () => {
          return await secondApp?.window
            .locator('.workspace-sidebar .workspace-item__name')
            .evaluateAll(nodes => nodes.map(node => node.textContent?.trim() ?? ''))
        })
        .toEqual(['workspace-order-c', 'workspace-order-a', 'workspace-order-b'])
    } finally {
      if (firstApp) {
        await firstApp.electronApp.close()
      }
      if (secondApp) {
        await secondApp.electronApp.close()
      }
      await removePathWithRetry(userDataDir)
    }
  })

  test('removes project from sidebar via right-click menu', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-remove-b',
        workspaces: [
          {
            id: 'workspace-remove-a',
            name: 'workspace-remove-a',
            path: testWorkspacePath,
            nodes: [],
          },
          {
            id: 'workspace-remove-b',
            name: 'workspace-remove-b',
            path: `${testWorkspacePath}-b`,
            nodes: [],
          },
        ],
      })

      const targetWorkspace = window
        .locator('.workspace-item')
        .filter({ has: window.locator('.workspace-item__name', { hasText: 'workspace-remove-b' }) })
        .first()
      await expect(targetWorkspace).toBeVisible()

      await targetWorkspace.click({ button: 'right' })

      const removeButton = window.locator(
        '[data-testid="workspace-project-remove-workspace-remove-b"]',
      )
      await expect(removeButton).toBeVisible()

      await removeButton.click()

      const removeDialog = window.locator('[data-testid="workspace-project-delete-confirmation"]')
      await expect(removeDialog).toBeVisible()
      await expect(removeDialog).toContainText('workspace-remove-b')

      await window.locator('[data-testid="workspace-project-delete-confirm"]').click()
      await expect(removeDialog).toHaveCount(0)

      await expect(window.locator('.workspace-item')).toHaveCount(1)
      await expect(window.locator('.workspace-item.workspace-item--active')).toContainText(
        'workspace-remove-a',
      )

      await expect
        .poll(
          async () => {
            return await window.evaluate(async key => {
              void key

              const raw = await window.freecliApi.persistence.readWorkspaceStateRaw()
              if (!raw) {
                return null
              }

              const parsed = JSON.parse(raw) as {
                activeWorkspaceId?: string | null
                workspaces?: Array<{
                  id?: string
                }>
              }

              return {
                activeWorkspaceId:
                  typeof parsed.activeWorkspaceId === 'string' ? parsed.activeWorkspaceId : null,
                workspaceIds: (parsed.workspaces ?? [])
                  .map(workspace => (typeof workspace.id === 'string' ? workspace.id : ''))
                  .filter(id => id.length > 0),
              }
            }, storageKey)
          },
          { timeout: 10_000 },
        )
        .toEqual({
          activeWorkspaceId: 'workspace-remove-a',
          workspaceIds: ['workspace-remove-a'],
        })
    } finally {
      await electronApp.close()
    }
  })

  test('opens project from sidebar via right-click open submenu', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-open-b',
        workspaces: [
          {
            id: 'workspace-open-a',
            name: 'workspace-open-a',
            path: testWorkspacePath,
            nodes: [],
          },
          {
            id: 'workspace-open-b',
            name: 'workspace-open-b',
            path: `${testWorkspacePath}-b`,
            nodes: [],
          },
        ],
      })

      await window.evaluate(() => {
        const openCalls: Array<{ path: string; openerId: string }> = []
        Object.defineProperty(window, '__projectOpenCalls', {
          configurable: true,
          value: openCalls,
          writable: true,
        })

        window.freecliApi.workspace.listPathOpeners = async () => ({
          openers: [
            { id: 'finder', label: 'Explorer' },
            { id: 'vscode', label: 'VS Code' },
            { id: 'pycharm', label: 'PyCharm' },
          ],
        })
        window.freecliApi.workspace.openPath = async (payload: {
          path: string
          openerId: string
        }) => {
          openCalls.push(payload)
        }
      })

      const targetWorkspace = window
        .locator('.workspace-item')
        .filter({ has: window.locator('.workspace-item__name', { hasText: 'workspace-open-b' }) })
        .first()
      await expect(targetWorkspace).toBeVisible()

      await targetWorkspace.click({ button: 'right' })

      const openButton = window.locator('[data-testid="workspace-project-open-workspace-open-b"]')
      await expect(openButton).toBeVisible()
      await expect(openButton).toBeEnabled()
      await openButton.hover()

      const submenu = window.locator('[data-testid="workspace-project-open-menu-workspace-open-b"]')
      await expect(submenu).toBeVisible()

      await expect(
        window.locator('[data-testid="workspace-project-open-workspace-open-b-finder"]'),
      ).toBeVisible()
      await expect(
        window.locator('[data-testid="workspace-project-open-workspace-open-b-vscode"]'),
      ).toBeVisible()
      await expect(
        window.locator('[data-testid="workspace-project-open-workspace-open-b-pycharm"]'),
      ).toBeVisible()
    } finally {
      await electronApp.close()
    }
  })
})

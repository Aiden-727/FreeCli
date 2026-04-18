import React from 'react'
import { ChevronRight, FolderOpen, FolderX, LoaderCircle } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { WorkspacePathOpener, WorkspacePathOpenerId } from '@shared/contracts/dto'

const MENU_WIDTH = 188
const SUBMENU_WIDTH = 188
const VIEWPORT_PADDING = 12
const SUBMENU_CLOSE_DELAY_MS = 120

function getWorkspacePathOpenerSortRank(openerId: WorkspacePathOpenerId): number {
  if (openerId === 'finder') {
    return 0
  }

  if (openerId === 'terminal') {
    return 1
  }

  return 2
}

function sortWorkspacePathOpeners(openers: WorkspacePathOpener[]): WorkspacePathOpener[] {
  return [...openers].sort((left, right) => {
    const rankDifference =
      getWorkspacePathOpenerSortRank(left.id) - getWorkspacePathOpenerSortRank(right.id)

    if (rankDifference !== 0) {
      return rankDifference
    }

    return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
  })
}

export function ProjectContextMenu({
  workspaceId,
  x,
  y,
  availableOpeners,
  isLoadingOpeners,
  onOpenPath,
  onRequestRemove,
}: {
  workspaceId: string
  x: number
  y: number
  availableOpeners: WorkspacePathOpener[]
  isLoadingOpeners: boolean
  onOpenPath: (workspaceId: string, openerId: WorkspacePathOpenerId) => void | Promise<void>
  onRequestRemove: (workspaceId: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [isOpenSubmenuVisible, setIsOpenSubmenuVisible] = React.useState(false)
  const closeSubmenuTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const sortedOpeners = React.useMemo(
    () => sortWorkspacePathOpeners(availableOpeners),
    [availableOpeners],
  )

  const cancelScheduledSubmenuClose = React.useCallback(() => {
    if (closeSubmenuTimeoutRef.current === null) {
      return
    }

    clearTimeout(closeSubmenuTimeoutRef.current)
    closeSubmenuTimeoutRef.current = null
  }, [])

  const scheduleSubmenuClose = React.useCallback(() => {
    cancelScheduledSubmenuClose()
    closeSubmenuTimeoutRef.current = setTimeout(() => {
      closeSubmenuTimeoutRef.current = null
      setIsOpenSubmenuVisible(false)
    }, SUBMENU_CLOSE_DELAY_MS)
  }, [cancelScheduledSubmenuClose])

  React.useEffect(() => {
    cancelScheduledSubmenuClose()
    setIsOpenSubmenuVisible(false)
  }, [cancelScheduledSubmenuClose, workspaceId, x, y])

  React.useEffect(() => {
    return () => {
      cancelScheduledSubmenuClose()
    }
  }, [cancelScheduledSubmenuClose])

  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight
  const menuLeft = Math.min(x, viewportWidth - MENU_WIDTH - VIEWPORT_PADDING)
  const menuTop = Math.min(y, viewportHeight - 120)
  const submenuWouldOverflow =
    menuLeft + MENU_WIDTH + SUBMENU_WIDTH > viewportWidth - VIEWPORT_PADDING
  const submenuLeft = submenuWouldOverflow ? menuLeft - SUBMENU_WIDTH : menuLeft + MENU_WIDTH
  const shouldShowOpenButton = isLoadingOpeners || sortedOpeners.length > 0

  return (
    <>
      <div
        className="workspace-context-menu workspace-project-context-menu"
        data-testid={`workspace-project-context-menu-${workspaceId}`}
        style={{
          top: menuTop,
          left: menuLeft,
        }}
        onMouseDown={event => {
          event.stopPropagation()
        }}
        onClick={event => {
          event.stopPropagation()
        }}
        onMouseEnter={cancelScheduledSubmenuClose}
        onMouseLeave={scheduleSubmenuClose}
      >
        {shouldShowOpenButton ? (
          <button
            type="button"
            data-testid={`workspace-project-open-${workspaceId}`}
            disabled={isLoadingOpeners}
            onMouseEnter={() => {
              cancelScheduledSubmenuClose()
              if (!isLoadingOpeners) {
                setIsOpenSubmenuVisible(true)
              }
            }}
            onFocus={() => {
              cancelScheduledSubmenuClose()
              if (!isLoadingOpeners) {
                setIsOpenSubmenuVisible(true)
              }
            }}
            onClick={() => {
              cancelScheduledSubmenuClose()
              if (!isLoadingOpeners) {
                setIsOpenSubmenuVisible(previous => !previous)
              }
            }}
          >
            {isLoadingOpeners ? (
              <LoaderCircle
                className="workspace-context-menu__icon workspace-context-menu__spinner"
                aria-hidden="true"
              />
            ) : (
              <FolderOpen className="workspace-context-menu__icon" aria-hidden="true" />
            )}
            <span className="workspace-context-menu__label">{t('projectContextMenu.open')}</span>
            {!isLoadingOpeners ? (
              <ChevronRight className="workspace-context-menu__icon" aria-hidden="true" />
            ) : null}
          </button>
        ) : null}

        {shouldShowOpenButton ? <div className="workspace-context-menu__separator" /> : null}

        <button
          type="button"
          data-testid={`workspace-project-remove-${workspaceId}`}
          onClick={() => {
            onRequestRemove(workspaceId)
          }}
        >
          <FolderX className="workspace-context-menu__icon" aria-hidden="true" />
          <span className="workspace-context-menu__label">
            {t('projectContextMenu.removeProject')}
          </span>
        </button>
      </div>

      {isOpenSubmenuVisible && sortedOpeners.length > 0 ? (
        <div
          className="workspace-context-menu workspace-context-menu--submenu workspace-project-context-menu workspace-project-context-menu--submenu"
          data-testid={`workspace-project-open-menu-${workspaceId}`}
          style={{ top: menuTop, left: submenuLeft }}
          onClick={event => {
            event.stopPropagation()
          }}
          onMouseEnter={() => {
            cancelScheduledSubmenuClose()
            setIsOpenSubmenuVisible(true)
          }}
          onMouseLeave={scheduleSubmenuClose}
        >
          {sortedOpeners.map(opener => (
            <button
              key={opener.id}
              type="button"
              data-testid={`workspace-project-open-${workspaceId}-${opener.id}`}
              onClick={() => {
                void Promise.resolve(onOpenPath(workspaceId, opener.id)).finally(() => {
                  setIsOpenSubmenuVisible(false)
                })
              }}
            >
              <FolderOpen className="workspace-context-menu__icon" aria-hidden="true" />
              <span className="workspace-context-menu__label">{opener.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  )
}

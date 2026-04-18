import { useEffect } from 'react'
import type { ProjectContextMenuState } from '../types'

export function useProjectContextMenuDismiss({
  projectContextMenu,
  setProjectContextMenu,
}: {
  projectContextMenu: ProjectContextMenuState | null
  setProjectContextMenu: React.Dispatch<React.SetStateAction<ProjectContextMenuState | null>>
}): void {
  useEffect(() => {
    if (!projectContextMenu) {
      return
    }

    const closeMenu = (event: MouseEvent): void => {
      if (
        event.target instanceof Element &&
        event.target.closest('.workspace-project-context-menu')
      ) {
        return
      }

      setProjectContextMenu(null)
    }

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setProjectContextMenu(null)
      }
    }

    window.addEventListener('mousedown', closeMenu)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', closeMenu)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [projectContextMenu, setProjectContextMenu])
}

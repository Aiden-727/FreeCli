import { toErrorMessage } from '@contexts/workspace/presentation/renderer/components/workspaceCanvas/helpers'
import { FreeCliAppError } from '@shared/errors/appError'
import type { TranslateFn } from '@app/renderer/i18n'

export function toSpaceWorktreeErrorMessage(error: unknown, t: TranslateFn): string {
  if (error instanceof FreeCliAppError && error.code === 'worktree.remove_uncommitted_changes') {
    return t('worktree.archiveUncommittedChangesWarning')
  }

  return toErrorMessage(error)
}

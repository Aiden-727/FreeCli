import type { AgentProviderId } from '@shared/contracts/dto'
import {
  clearResumeSessionBinding,
  hasResumeSessionId,
  isResumeSessionBindingVerified,
} from '../agentResumeBinding'
import { normalizeOptionalString } from './normalize'

export function normalizeResumeSessionBinding(
  provider: AgentProviderId,
  record: Record<string, unknown>,
): {
  resumeSessionId: string | null
  resumeSessionIdVerified: boolean
} {
  const resumeSessionId = normalizeOptionalString(record.resumeSessionId)
  const resumeSessionIdVerifiedInput =
    typeof record.resumeSessionIdVerified === 'boolean' ? record.resumeSessionIdVerified : undefined

  if (!hasResumeSessionId(resumeSessionId)) {
    return clearResumeSessionBinding()
  }

  if (
    isResumeSessionBindingVerified({
      provider,
      resumeSessionId,
      resumeSessionIdVerified: resumeSessionIdVerifiedInput,
    })
  ) {
    return {
      resumeSessionId,
      resumeSessionIdVerified: true,
    }
  }

  return {
    resumeSessionId,
    resumeSessionIdVerified: false,
  }
}

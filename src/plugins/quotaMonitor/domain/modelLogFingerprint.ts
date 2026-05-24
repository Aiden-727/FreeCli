import { createHash } from 'node:crypto'

export interface QuotaMonitorModelLogFingerprintInput {
  sourceId?: string | null
  modelName: string
  requestEpochSeconds: number
  requestTimeText: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  quota: number
}

export function createQuotaMonitorModelLogFingerprint(
  input: QuotaMonitorModelLogFingerprintInput,
): string {
  const payload = [
    input.sourceId?.trim() ?? '',
    input.modelName.trim(),
    String(input.requestEpochSeconds),
    input.requestTimeText.trim(),
    String(input.promptTokens),
    String(input.completionTokens),
    String(input.totalTokens),
    String(input.quota),
  ].join('|')

  return createHash('sha1').update(payload).digest('hex')
}

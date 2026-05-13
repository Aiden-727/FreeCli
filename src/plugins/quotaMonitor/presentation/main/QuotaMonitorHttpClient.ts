import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { URL } from 'node:url'
import type {
  QuotaMonitorErrorDto,
  QuotaMonitorKeyProfileDto,
  QuotaMonitorKeyType,
  QuotaMonitorProfileStateDto,
  QuotaMonitorSettingsDto,
} from '@shared/contracts/dto'

interface TokenInfoResponse {
  name?: unknown
  today_used_quota?: unknown
  remain_quota_display?: unknown
  today_usage_count?: unknown
  expired_time_formatted?: unknown
  status?: {
    text?: unknown
  } | null
}

interface TokenStatsResponse {
  data?: {
    token_info?: TokenInfoResponse | null
  } | null
}

interface TokenLogResponseItem {
  model_name?: unknown
  created_at?: unknown
  created_time?: unknown
  prompt_tokens?: unknown
  completion_tokens?: unknown
  quota?: unknown
}

interface TokenLogPaginationResponse {
  page?: unknown
  page_size?: unknown
  total?: unknown
  total_pages?: unknown
}

interface TokenLogPageResponse {
  data?: {
    logs?: unknown
    pagination?: TokenLogPaginationResponse | null
  } | null
}

export interface QuotaMonitorModelLogEntry {
  modelName: string
  requestEpochSeconds: number
  requestTimeText: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  quota: number
}

export interface QuotaMonitorModelLogPage {
  logs: QuotaMonitorModelLogEntry[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export class QuotaMonitorRequestError extends Error {
  public readonly descriptor: QuotaMonitorErrorDto

  public constructor(descriptor: QuotaMonitorErrorDto) {
    super(descriptor.message)
    this.name = 'QuotaMonitorRequestError'
    this.descriptor = descriptor
  }
}

function normalizeNumber(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN

  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeInteger(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN

  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0
}

function normalizeEpochSeconds(raw: number): number {
  if (raw >= 1_000_000_000_000_000) {
    return Math.floor(raw / 1_000_000)
  }

  if (raw >= 1_000_000_000_000) {
    return Math.floor(raw / 1000)
  }

  return raw
}

function parseRemainQuotaValue(raw: string): number {
  const cleaned = raw.replaceAll(/[^0-9.+-]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatRemainQuotaDisplay(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed === '--') {
    return raw
  }

  const cleaned = raw.replaceAll(/[^0-9.+-]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed.toFixed(0) : raw
}

function estimateRemainingHours(
  remainQuotaValue: number,
  todayUsedQuota: number,
  now: Date,
): number | null {
  if (remainQuotaValue <= 0 || todayUsedQuota <= 0) {
    return null
  }

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const elapsedHours = (now.getTime() - dayStart.getTime()) / (1000 * 60 * 60)
  if (!Number.isFinite(elapsedHours) || elapsedHours <= 0) {
    return null
  }

  const hourlyUsageRate = todayUsedQuota / elapsedHours
  if (!Number.isFinite(hourlyUsageRate) || hourlyUsageRate <= 0) {
    return null
  }

  return remainQuotaValue / hourlyUsageRate
}

function formatEstimatedRemainingTimeLabel(hours: number | null): string {
  if (hours === null || Number.isNaN(hours) || !Number.isFinite(hours)) {
    return '--'
  }

  const totalMinutes = Math.round(hours * 60)
  if (totalMinutes <= 0) {
    return '--'
  }

  const roundedHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (roundedHours > 9999) {
    return '≥9999时'
  }

  return `${roundedHours}时${minutes}分`
}

function formatQuotaInteger(value: number): string {
  return clampToNonNegative(value).toFixed(0)
}

function clampToNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function parseDateTime(raw: string): Date | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }

  const normalized = trimmed.replace(' ', 'T')
  const direct = new Date(normalized)
  return Number.isNaN(direct.getTime()) ? null : direct
}

function formatRemainingDaysLabel(value: string): string {
  const parsed = parseDateTime(value)
  if (!parsed) {
    return value || '--'
  }

  const seconds = Math.floor((parsed.getTime() - Date.now()) / 1000)
  if (seconds <= 0) {
    return '已过期'
  }

  return `剩余${Math.ceil(seconds / 86400)}天`
}

function isProbablyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

function extractServerErrorDetail(
  statusCode: number,
  body: string,
  location: string | undefined,
): string {
  const segments = [`HTTP ${statusCode}`]

  if (location && statusCode >= 300 && statusCode < 400) {
    segments.push(`Location: ${location}`)
  }

  const trimmed = body.trim()
  if (trimmed.length === 0) {
    return segments.join(' · ')
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const message =
      typeof parsed.message === 'string' && parsed.message.trim().length > 0
        ? parsed.message.trim()
        : null
    if (message) {
      segments.push(message)
      return segments.join(' · ')
    }
  } catch {
    // Ignore JSON parse failures and fall back to the raw body preview.
  }

  segments.push(trimmed.slice(0, 240))
  return segments.join(' · ')
}

function createErrorDescriptor(
  type: QuotaMonitorErrorDto['type'],
  message: string,
  detail: string | null,
): QuotaMonitorErrorDto {
  return { type, message, detail }
}

export class QuotaMonitorHttpClient {
  public async fetchProfile(
    settings: QuotaMonitorSettingsDto,
    profile: QuotaMonitorKeyProfileDto,
  ): Promise<QuotaMonitorProfileStateDto> {
    try {
      return await this.fetchProfileWithSslMode(settings, profile, settings.verifySsl)
    } catch (error) {
      if (
        settings.verifySsl &&
        error instanceof QuotaMonitorRequestError &&
        error.descriptor.type === 'ssl'
      ) {
        return await this.fetchProfileWithSslMode(settings, profile, false)
      }

      throw error
    }
  }

  public async fetchProfileLogs(params: {
    settings: QuotaMonitorSettingsDto
    profile: QuotaMonitorKeyProfileDto
    page: number
    pageSize?: number
  }): Promise<QuotaMonitorModelLogPage> {
    try {
      return await this.fetchProfileLogsWithSslMode({
        ...params,
        verifySsl: params.settings.verifySsl,
      })
    } catch (error) {
      if (
        params.settings.verifySsl &&
        error instanceof QuotaMonitorRequestError &&
        error.descriptor.type === 'ssl'
      ) {
        return await this.fetchProfileLogsWithSslMode({
          ...params,
          verifySsl: false,
        })
      }

      throw error
    }
  }

  private async fetchProfileWithSslMode(
    settings: QuotaMonitorSettingsDto,
    profile: QuotaMonitorKeyProfileDto,
    verifySsl: boolean,
  ): Promise<QuotaMonitorProfileStateDto> {
    const attempts = Math.max(1, settings.retryTimes)
    const tryFetch = async (attempt: number): Promise<QuotaMonitorProfileStateDto> => {
      try {
        const payload = await this.requestStats(settings, profile, verifySsl)
        return this.toProfileState(profile, payload)
      } catch (error) {
        const nextError =
          error instanceof QuotaMonitorRequestError
            ? error
            : new QuotaMonitorRequestError(
                createErrorDescriptor('unknown', '未知错误', this.toDetail(error)),
              )
        if (attempt >= attempts - 1) {
          throw (
            nextError ??
            new QuotaMonitorRequestError(createErrorDescriptor('unknown', '未知错误', null))
          )
        }

        await new Promise<void>(resolveRetry => {
          setTimeout(resolveRetry, Math.min(5000, 800 * 2 ** attempt))
        })
        return await tryFetch(attempt + 1)
      }
    }

    return await tryFetch(0)
  }

  private async fetchProfileLogsWithSslMode(params: {
    settings: QuotaMonitorSettingsDto
    profile: QuotaMonitorKeyProfileDto
    page: number
    pageSize?: number
    verifySsl: boolean
  }): Promise<QuotaMonitorModelLogPage> {
    const attempts = Math.max(1, params.settings.retryTimes)
    const tryFetch = async (attempt: number): Promise<QuotaMonitorModelLogPage> => {
      try {
        const payload = await this.requestLogPage(
          params.settings,
          params.profile,
          params.page,
          params.pageSize ?? 50,
          params.verifySsl,
        )
        return this.toLogPage(payload)
      } catch (error) {
        const nextError =
          error instanceof QuotaMonitorRequestError
            ? error
            : new QuotaMonitorRequestError(
                createErrorDescriptor('unknown', '未知错误', this.toDetail(error)),
              )
        if (attempt >= attempts - 1) {
          throw (
            nextError ??
            new QuotaMonitorRequestError(createErrorDescriptor('unknown', '未知错误', null))
          )
        }

        await new Promise<void>(resolveRetry => {
          setTimeout(resolveRetry, Math.min(5000, 800 * 2 ** attempt))
        })
        return await tryFetch(attempt + 1)
      }
    }

    return await tryFetch(0)
  }

  private async requestStats(
    settings: QuotaMonitorSettingsDto,
    profile: QuotaMonitorKeyProfileDto,
    verifySsl: boolean,
  ): Promise<TokenStatsResponse> {
    if (isProbablyUrl(profile.apiKey)) {
      throw new QuotaMonitorRequestError(
        createErrorDescriptor(
          'invalid_response',
          'API Key 配置疑似错误',
          '当前 API Key 看起来像接口地址。请分别填写“API 地址”和真正的 dashboard API Key”。',
        ),
      )
    }

    const url = new URL(settings.apiBaseUrl)
    url.searchParams.set('token_key', profile.apiKey)
    url.searchParams.set('page', '1')
    url.searchParams.set('page_size', '10')

    const requestImpl = url.protocol === 'https:' ? httpsRequest : httpRequest

    return await new Promise<TokenStatsResponse>((resolve, reject) => {
      const req = requestImpl(
        url,
        {
          method: 'GET',
          rejectUnauthorized: verifySsl,
        },
        response => {
          const chunks: Buffer[] = []

          response.on('data', chunk => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          })

          response.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8')

            if (response.statusCode !== 200) {
              reject(
                new QuotaMonitorRequestError(
                  createErrorDescriptor(
                    'network',
                    '服务返回异常',
                    extractServerErrorDetail(
                      response.statusCode ?? 0,
                      body,
                      typeof response.headers.location === 'string'
                        ? response.headers.location
                        : undefined,
                    ),
                  ),
                ),
              )
              return
            }

            try {
              resolve(JSON.parse(body) as TokenStatsResponse)
            } catch (error) {
              reject(
                new QuotaMonitorRequestError(
                  createErrorDescriptor('invalid_response', '响应解析失败', this.toDetail(error)),
                ),
              )
            }
          })
        },
      )

      req.setTimeout(settings.timeoutSeconds * 1000, () => {
        req.destroy(
          new QuotaMonitorRequestError(
            createErrorDescriptor('timeout', '请求超时', `${settings.timeoutSeconds}s`),
          ),
        )
      })

      req.on('error', error => {
        if (error instanceof QuotaMonitorRequestError) {
          reject(error)
          return
        }

        const detail = this.toDetail(error)
        const code =
          typeof error === 'object' && error && 'code' in error ? String(error.code) : null
        const type =
          code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
          code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
          code === 'SELF_SIGNED_CERT_IN_CHAIN'
            ? 'ssl'
            : 'network'
        const message = type === 'ssl' ? 'SSL 握手失败' : '网络连接失败'
        reject(new QuotaMonitorRequestError(createErrorDescriptor(type, message, detail)))
      })

      req.end()
    })
  }

  private async requestLogPage(
    settings: QuotaMonitorSettingsDto,
    profile: QuotaMonitorKeyProfileDto,
    page: number,
    pageSize: number,
    verifySsl: boolean,
  ): Promise<TokenLogPageResponse> {
    if (isProbablyUrl(profile.apiKey)) {
      throw new QuotaMonitorRequestError(
        createErrorDescriptor(
          'invalid_response',
          'API Key 配置疑似错误',
          '当前 API Key 看起来像接口地址。请分别填写“API 地址”和真正的 dashboard API Key”。',
        ),
      )
    }

    const url = new URL(settings.apiBaseUrl)
    url.searchParams.set('token_key', profile.apiKey)
    url.searchParams.set('page', `${Math.max(1, page)}`)
    url.searchParams.set('page_size', `${Math.max(1, pageSize)}`)

    const requestImpl = url.protocol === 'https:' ? httpsRequest : httpRequest
    return await new Promise<TokenLogPageResponse>((resolve, reject) => {
      const req = requestImpl(
        url,
        {
          method: 'GET',
          rejectUnauthorized: verifySsl,
        },
        response => {
          const chunks: Buffer[] = []

          response.on('data', chunk => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          })

          response.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8')

            if (response.statusCode !== 200) {
              reject(
                new QuotaMonitorRequestError(
                  createErrorDescriptor(
                    'network',
                    '服务返回异常',
                    extractServerErrorDetail(
                      response.statusCode ?? 0,
                      body,
                      typeof response.headers.location === 'string'
                        ? response.headers.location
                        : undefined,
                    ),
                  ),
                ),
              )
              return
            }

            try {
              resolve(JSON.parse(body) as TokenLogPageResponse)
            } catch (error) {
              reject(
                new QuotaMonitorRequestError(
                  createErrorDescriptor('invalid_response', '响应解析失败', this.toDetail(error)),
                ),
              )
            }
          })
        },
      )

      req.setTimeout(settings.timeoutSeconds * 1000, () => {
        req.destroy(
          new QuotaMonitorRequestError(
            createErrorDescriptor('timeout', '请求超时', `${settings.timeoutSeconds}s`),
          ),
        )
      })

      req.on('error', error => {
        if (error instanceof QuotaMonitorRequestError) {
          reject(error)
          return
        }

        const detail = this.toDetail(error)
        const code =
          typeof error === 'object' && error && 'code' in error ? String(error.code) : null
        const type =
          code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
          code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
          code === 'SELF_SIGNED_CERT_IN_CHAIN'
            ? 'ssl'
            : 'network'
        const message = type === 'ssl' ? 'SSL 握手失败' : '网络连接失败'
        reject(new QuotaMonitorRequestError(createErrorDescriptor(type, message, detail)))
      })

      req.end()
    })
  }

  private toProfileState(
    profile: QuotaMonitorKeyProfileDto,
    response: TokenStatsResponse,
  ): QuotaMonitorProfileStateDto {
    const now = new Date()
    const tokenInfo = response.data?.token_info ?? {}
    const tokenName =
      typeof tokenInfo.name === 'string' && tokenInfo.name.trim().length > 0
        ? tokenInfo.name.trim()
        : profile.label
    const todayUsedQuota = normalizeNumber(tokenInfo.today_used_quota)
    const remainQuotaDisplay =
      tokenInfo.remain_quota_display === null || tokenInfo.remain_quota_display === undefined
        ? '--'
        : String(tokenInfo.remain_quota_display)
    const remainQuotaValue = parseRemainQuotaValue(remainQuotaDisplay)
    const remainQuotaIntDisplay = formatRemainQuotaDisplay(remainQuotaDisplay)
    const totalQuota = remainQuotaValue + todayUsedQuota
    const remainRatio = totalQuota > 0 ? Math.max(0, Math.min(1, remainQuotaValue / totalQuota)) : 0
    const estimatedRemainingHoursValue = estimateRemainingHours(
      remainQuotaValue,
      todayUsedQuota,
      now,
    )

    return {
      profileId: profile.id,
      label: profile.label,
      keyType: profile.type,
      tokenName,
      todayUsedQuota,
      todayUsedQuotaIntDisplay: formatQuotaInteger(todayUsedQuota),
      averageQuotaPerCall:
        normalizeInteger(tokenInfo.today_usage_count) > 0
          ? todayUsedQuota / normalizeInteger(tokenInfo.today_usage_count)
          : 0,
      remainQuotaDisplay,
      remainQuotaValue,
      remainQuotaIntDisplay,
      todayUsageCount: normalizeInteger(tokenInfo.today_usage_count),
      expiredTimeFormatted:
        typeof tokenInfo.expired_time_formatted === 'string'
          ? tokenInfo.expired_time_formatted
          : '--',
      remainingDaysLabel:
        typeof tokenInfo.expired_time_formatted === 'string'
          ? formatRemainingDaysLabel(tokenInfo.expired_time_formatted)
          : '--',
      estimatedRemainingHours: estimatedRemainingHoursValue,
      estimatedRemainingTimeLabel: formatEstimatedRemainingTimeLabel(estimatedRemainingHoursValue),
      statusText:
        typeof tokenInfo.status?.text === 'string' && tokenInfo.status.text.trim().length > 0
          ? tokenInfo.status.text.trim()
          : '正常',
      remainRatio,
      workDurationTodaySeconds: 0,
      workDurationAllTimeSeconds: 0,
      dailyTrend: [],
      hourlyTrend: [],
      modelUsageSummary: null,
      dailyTokenTrend: { labels: [], seriesByModel: {} },
      hourlyTokenTrend: { labels: [], seriesByModel: {} },
      cappedInsight: profile.type === 'capped' ? this.createEmptyCappedInsight(profile.type) : null,
      lastFetchedAt: now.toISOString(),
      error: null,
    }
  }

  private toLogPage(response: TokenLogPageResponse): QuotaMonitorModelLogPage {
    const logsRaw = response.data?.logs
    const pagination = response.data?.pagination ?? {}
    const logs = Array.isArray(logsRaw)
      ? logsRaw.flatMap(item => {
          const normalized = this.toLogEntry(item)
          return normalized ? [normalized] : []
        })
      : []

    return {
      logs,
      page: normalizeInteger(pagination.page),
      pageSize: normalizeInteger(pagination.page_size),
      total: normalizeInteger(pagination.total),
      totalPages: normalizeInteger(pagination.total_pages),
    }
  }

  private toLogEntry(raw: unknown): QuotaMonitorModelLogEntry | null {
    if (!raw || typeof raw !== 'object') {
      return null
    }

    const record = raw as TokenLogResponseItem
    const createdTimeRaw = typeof record.created_time === 'string' ? record.created_time.trim() : ''
    const createdTime =
      createdTimeRaw.length > 0
        ? createdTimeRaw
        : new Date(normalizeEpochSeconds(normalizeInteger(record.created_at)) * 1000).toISOString()
    const parsedDate = parseDateTime(createdTime)
    const requestEpochSeconds = normalizeEpochSeconds(
      normalizeInteger(record.created_at) ||
        Math.floor((parsedDate ?? new Date()).getTime() / 1000),
    )
    const promptTokens = normalizeInteger(record.prompt_tokens)
    const completionTokens = normalizeInteger(record.completion_tokens)

    return {
      modelName:
        typeof record.model_name === 'string' && record.model_name.trim().length > 0
          ? record.model_name.trim()
          : 'unknown',
      requestEpochSeconds,
      requestTimeText: createdTime,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      quota: normalizeNumber(record.quota),
    }
  }

  private createEmptyCappedInsight(keyType: QuotaMonitorKeyType) {
    if (keyType !== 'capped') {
      return null
    }

    return {
      wastedTodayQuota: 0,
      wastedTotalQuota: 0,
      requiredConsume: 0,
      nextTopUpInMinutes: null,
      nextTopUpAmount: null,
    }
  }

  private toDetail(error: unknown): string | null {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message
    }

    return typeof error === 'string' && error.trim().length > 0 ? error : null
  }
}

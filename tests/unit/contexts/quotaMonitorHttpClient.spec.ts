import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import {
  DEFAULT_QUOTA_MONITOR_SETTINGS,
  createDefaultQuotaMonitorKeyProfile,
} from '../../../src/contexts/plugins/domain/quotaMonitorSettings'
import {
  QuotaMonitorHttpClient,
  QuotaMonitorRequestError,
} from '../../../src/plugins/quotaMonitor/presentation/main/QuotaMonitorHttpClient'

function createSettings(baseUrl: string) {
  return {
    ...DEFAULT_QUOTA_MONITOR_SETTINGS,
    apiBaseUrl: baseUrl,
    verifySsl: false,
    retryTimes: 1,
    timeoutSeconds: 3,
  }
}

describe('QuotaMonitorHttpClient', () => {
  let server: Server | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-02T12:00:00'))
  })

  afterEach(async () => {
    vi.useRealTimers()

    if (!server) {
      return
    }

    await new Promise<void>(resolve => {
      server?.close(() => resolve())
    })
    server = null
  })

  it('surfaces backend message details for non-200 responses', async () => {
    server = createServer((_request, response) => {
      response.statusCode = 400
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ success: false, message: 'Token key不能为空' }))
    })

    await new Promise<void>(resolve => {
      server?.listen(0, '127.0.0.1', () => resolve())
    })

    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected an IPv4 test server address')
    }

    const client = new QuotaMonitorHttpClient()

    await expect(
      client.fetchProfile(createSettings(`http://127.0.0.1:${address.port}/api/token-logs`), {
        ...createDefaultQuotaMonitorKeyProfile(0),
        apiKey: 'bad-key',
      }),
    ).rejects.toMatchObject({
      descriptor: {
        type: 'network',
        message: '服务返回异常',
        detail: 'HTTP 400 · Token key不能为空',
      },
    } satisfies Partial<QuotaMonitorRequestError>)
  })

  it('rejects url-like api key values before sending requests', async () => {
    const client = new QuotaMonitorHttpClient()

    await expect(
      client.fetchProfile(createSettings('https://quota.example.test/api/token-logs'), {
        ...createDefaultQuotaMonitorKeyProfile(0),
        apiKey: 'https://his.ppchat.vip/api/token-logs',
      }),
    ).rejects.toMatchObject({
      descriptor: {
        type: 'invalid_response',
        message: 'API Key 配置疑似错误',
      },
    } satisfies Partial<QuotaMonitorRequestError>)
  })

  it('derives remain quota display and estimated remaining time from numeric snapshot values', async () => {
    server = createServer((_request, response) => {
      response.statusCode = 200
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          data: {
            token_info: {
              name: 'Primary Token',
              today_used_quota: 24,
              remain_quota_display: 120.4,
              today_usage_count: 6,
              expired_time_formatted: '2026-12-31 23:59:59',
              status: { text: '正常' },
            },
          },
        }),
      )
    })

    await new Promise<void>(resolve => {
      server?.listen(0, '127.0.0.1', () => resolve())
    })

    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected an IPv4 test server address')
    }

    const client = new QuotaMonitorHttpClient()
    const state = await client.fetchProfile(
      createSettings(`http://127.0.0.1:${address.port}/api/token-logs`),
      {
        ...createDefaultQuotaMonitorKeyProfile(0),
        apiKey: 'valid-key',
      },
    )

    expect(state.remainQuotaValue).toBe(120.4)
    expect(state.remainQuotaIntDisplay).toBe('120')
    expect(state.estimatedRemainingHours).toBeCloseTo(60.2, 1)
    expect(state.estimatedRemainingTimeLabel).toBe('60时12分')
  })
})

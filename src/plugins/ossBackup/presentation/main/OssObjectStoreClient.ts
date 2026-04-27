import type { OssBackupSettingsDto, PluginBackupSnapshotDto } from '@shared/contracts/dto'
import { normalizeOssBackupObjectDirectory } from '@contexts/plugins/domain/ossBackupSettings'

const OSS_PLUGIN_SETTINGS_FILE_NAME = 'latest.json'

function resolvePluginSettingsObjectKey(objectDirectory: string): string {
  return `${normalizeOssBackupObjectDirectory(objectDirectory)}/${OSS_PLUGIN_SETTINGS_FILE_NAME}`
}

export class OssObjectStoreClient {
  private ossModulePromise: Promise<typeof import('ali-oss')> | null = null

  private loadOssModule(): Promise<typeof import('ali-oss')> {
    if (this.ossModulePromise === null) {
      this.ossModulePromise = import('ali-oss')
    }

    return this.ossModulePromise
  }

  private async createClient(settings: OssBackupSettingsDto) {
    const { default: OSS } = await this.loadOssModule()

    return new OSS({
      endpoint: settings.endpoint,
      region: settings.region,
      bucket: settings.bucket,
      accessKeyId: settings.accessKeyId,
      accessKeySecret: settings.accessKeySecret,
      secure: settings.endpoint.startsWith('https://'),
    })
  }

  public async testConnection(settings: OssBackupSettingsDto): Promise<void> {
    const client = await this.createClient(settings)
    await client.getBucketInfo(settings.bucket)
  }

  public async uploadSnapshot(
    settings: OssBackupSettingsDto,
    snapshot: PluginBackupSnapshotDto,
  ): Promise<void> {
    await this.putJson(settings, resolvePluginSettingsObjectKey(settings.objectKey), snapshot)
  }

  public async downloadSnapshot(settings: OssBackupSettingsDto): Promise<unknown> {
    return await this.getJson(settings, resolvePluginSettingsObjectKey(settings.objectKey))
  }

  public async putJson(
    settings: OssBackupSettingsDto,
    objectKey: string,
    payload: unknown,
  ): Promise<void> {
    const client = await this.createClient(settings)
    const content = Buffer.from(JSON.stringify(payload, null, 2), 'utf8')
    await client.put(objectKey, content)
  }

  public async getJson(settings: OssBackupSettingsDto, objectKey: string): Promise<unknown> {
    const client = await this.createClient(settings)
    const result = await client.get(objectKey)
    const content =
      result.content instanceof Buffer
        ? result.content.toString('utf8')
        : result.content instanceof Uint8Array
          ? Buffer.from(result.content).toString('utf8')
          : String(result.content)

    return JSON.parse(content)
  }

  public async getJsonIfExists(
    settings: OssBackupSettingsDto,
    objectKey: string,
  ): Promise<unknown | null> {
    try {
      return await this.getJson(settings, objectKey)
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'NoSuchKey'
      ) {
        return null
      }

      if (
        error &&
        typeof error === 'object' &&
        'status' in error &&
        (error as { status?: unknown }).status === 404
      ) {
        return null
      }

      throw error
    }
  }
}

declare module 'ali-oss' {
  export interface OSSClientOptions {
    endpoint?: string
    region?: string
    bucket?: string
    accessKeyId?: string
    accessKeySecret?: string
    secure?: boolean
    timeout?: string | number
  }

  export interface OSSGetBucketInfoResult {
    bucket?: unknown
    res?: unknown
  }

  export interface OSSPutResult {
    name: string
    url: string
    res?: unknown
  }

  export interface OSSGetResult {
    content: Buffer | Uint8Array | string
    res?: unknown
  }

  export default class OSS {
    constructor(options: OSSClientOptions)
    getBucketInfo(name?: string): Promise<OSSGetBucketInfoResult>
    put(name: string, file: Buffer | Uint8Array | string): Promise<OSSPutResult>
    get(name: string): Promise<OSSGetResult>
  }
}

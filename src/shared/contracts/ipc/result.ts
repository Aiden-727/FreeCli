import type { AppErrorDescriptor } from '../dto'

export interface IpcSuccessResult<T> {
  __freecliIpcEnvelope: true
  ok: true
  value: T
}

export interface IpcFailureResult {
  __freecliIpcEnvelope: true
  ok: false
  error: AppErrorDescriptor
}

export type IpcInvokeResult<T> = IpcSuccessResult<T> | IpcFailureResult

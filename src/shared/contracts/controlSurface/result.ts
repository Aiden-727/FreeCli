import type { AppErrorDescriptor } from '../dto'

export interface ControlSurfaceSuccessResult<T> {
  __freecliControlEnvelope: true
  ok: true
  value: T
}

export interface ControlSurfaceFailureResult {
  __freecliControlEnvelope: true
  ok: false
  error: AppErrorDescriptor
}

export type ControlSurfaceInvokeResult<T> =
  | ControlSurfaceSuccessResult<T>
  | ControlSurfaceFailureResult

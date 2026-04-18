import { FreeCliApi } from '../preload/index'

declare global {
  interface Window {
    freecliApi: FreeCliApi
  }
}

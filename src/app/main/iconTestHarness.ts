type RuntimeIconTestState = {
  runtimeIconPath: string | null
}

declare global {
  var __freecliRuntimeIconTestState: RuntimeIconTestState | undefined
}

export function setRuntimeIconTestState(runtimeIconPath: string | null): void {
  globalThis.__freecliRuntimeIconTestState = {
    runtimeIconPath,
  }
}

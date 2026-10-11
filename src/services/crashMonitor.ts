export interface CrashMonitor {
  crashed: boolean
  reasons: string[]
  exitCode: number | null
  pageErrors: string[]
  beginTeardown(): void
  browserDisconnected(): void
  electronExit(code: number): void
  rendererCrashed(): void
  pageError(message: string): void
}

/**
 * Keeps renderer/ Electron crash evidence separate from intentional case
 * teardown. Live replay previously recorded browser.close() as a crash after
 * the case result was already valid.
 */
export function createCrashMonitor(): CrashMonitor {
  const state = {
    crashed: false,
    reasons: [] as string[],
    exitCode: null as number | null,
    pageErrors: [] as string[],
    tearingDown: false,
  }
  const record = (reason: string) => {
    if (state.crashed) return
    state.crashed = true
    state.reasons.push(reason)
  }
  return {
    get crashed() { return state.crashed },
    get reasons() { return [...state.reasons] },
    get exitCode() { return state.exitCode },
    get pageErrors() { return [...state.pageErrors] },
    beginTeardown() {
      state.tearingDown = true
    },
    browserDisconnected() {
      if (state.tearingDown) return
      record('Electron browser disconnected')
    },
    electronExit(code: number) {
      state.exitCode = code
      if (state.tearingDown) return
      record(`Electron process exited during the turn with code ${code}`)
    },
    rendererCrashed() {
      record('renderer page crashed')
    },
    pageError(message: string) {
      state.pageErrors.push(message)
    },
  }
}

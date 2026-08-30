export declare const DiagLogger: {
  init(): void
  log(level: "error" | "warn" | "info" | "debug", category: string, message: string, detail?: Record<string, unknown>): void
  error(category: string, message: string, detail?: Record<string, unknown>): void
  warn(category: string, message: string, detail?: Record<string, unknown>): void
  info(category: string, message: string, detail?: Record<string, unknown>): void
  debug(category: string, message: string, detail?: Record<string, unknown>): void
  trackApiCall(model: string, tokenEstimate: number, elapsed: number, status: "ok" | "error", errorMessage?: string): void
}

export declare function subscribe(listener: (entry: Record<string, unknown>) => void): () => void

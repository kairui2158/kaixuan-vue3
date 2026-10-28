/**
 * IPC boundaries use structured clone, while Vue/Pinia expose reactive proxies.
 * This single source keeps only serializable state crossing those boundaries.
 */
export function toCloneableSnapshot(value: unknown): unknown {
  try {
    if (typeof structuredClone === 'function') return structuredClone(value)
  } catch (error) {
    // Vue proxies and non-serializable values fall through to the JSON snapshot.
  }
  return JSON.parse(JSON.stringify(value))
}

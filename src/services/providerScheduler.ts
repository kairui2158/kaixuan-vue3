export const DEFAULT_PROVIDER_CONCURRENCY = 2

export interface ProviderQueueEvent {
  providerId: string
  status: 'queued' | 'started' | 'canceled'
  position?: number
  waiting?: number
  maxConcurrencyPerProvider: number
}

export class ProviderSchedulerCanceledError extends Error {
  providerId: string

  constructor(providerId: string) {
    super('等待供应商槽位时已取消')
    this.name = 'ProviderSchedulerCanceledError'
    this.providerId = providerId
  }
}

export interface ProviderSchedulerSlot {
  release: () => void
}

export interface ProviderSchedulerSnapshot {
  maxConcurrencyPerProvider: number
  activeCountByProvider: Record<string, number>
  waitingCountByProvider: Record<string, number>
}

interface QueueItem {
  onEvent?: (event: ProviderQueueEvent) => void
  start: () => void
  cancel: () => void
  detachSignal: () => void
}

export function createProviderScheduler(options?: {
  maxConcurrencyPerProvider?: number
}) {
  const maxConcurrencyPerProvider = Math.max(
    1,
    options?.maxConcurrencyPerProvider ?? DEFAULT_PROVIDER_CONCURRENCY,
  )
  const activeCountByProvider = new Map<string, number>()
  const queuesByProvider = new Map<string, QueueItem[]>()
  let externalSnapshot: Partial<ProviderSchedulerSnapshot> = {}
  let externalSnapshotEnabled = false

  const queueSnapshot = (providerId: string) =>
    queuesByProvider.get(providerId) || []

  const reportQueue = (providerId: string) => {
    const queue = queueSnapshot(providerId)
    queue.forEach((item, index) => {
      item.onEvent?.({
        providerId,
        status: 'queued',
        position: index + 1,
        waiting: queue.length,
        maxConcurrencyPerProvider,
      })
    })
  }

  const releaseSlot = (providerId: string) => {
    const active = activeCountByProvider.get(providerId) || 0
    if (active <= 1) activeCountByProvider.delete(providerId)
    else activeCountByProvider.set(providerId, active - 1)

    const queue = queueSnapshot(providerId)
    while (
      queue.length > 0
      && (activeCountByProvider.get(providerId) || 0) < maxConcurrencyPerProvider
    ) {
      const item = queue.shift()!
      if (queue.length === 0) queuesByProvider.delete(providerId)
      item.detachSignal()
      activeCountByProvider.set(
        providerId,
        (activeCountByProvider.get(providerId) || 0) + 1,
      )
      item.start()
      item.onEvent?.({
        providerId,
        status: 'started',
        maxConcurrencyPerProvider,
      })
    }
    reportQueue(providerId)
  }

  async function acquire(input: {
    providerId: string
    signal?: AbortSignal
    onEvent?: (event: ProviderQueueEvent) => void
  }): Promise<ProviderSchedulerSlot> {
    const providerId = input.providerId
    if (input.signal?.aborted) {
      input.onEvent?.({
        providerId,
        status: 'canceled',
        maxConcurrencyPerProvider,
      })
      throw new ProviderSchedulerCanceledError(providerId)
    }

    if ((activeCountByProvider.get(providerId) || 0) < maxConcurrencyPerProvider) {
      activeCountByProvider.set(
        providerId,
        (activeCountByProvider.get(providerId) || 0) + 1,
      )
      input.onEvent?.({
        providerId,
        status: 'started',
        maxConcurrencyPerProvider,
      })
      return { release: () => releaseSlot(providerId) }
    }

    return new Promise<ProviderSchedulerSlot>((resolve, reject) => {
      let settled = false
      const queue: QueueItem[] = []
      let queuedItem: QueueItem | null = null
      const abortHandler = () => {
        if (settled) return
        settled = true
        const providerQueue = queuesByProvider.get(providerId)
        if (providerQueue && queuedItem) {
          const index = providerQueue.indexOf(queuedItem)
          if (index >= 0) {
            providerQueue.splice(index, 1)
            if (providerQueue.length === 0) queuesByProvider.delete(providerId)
          }
        }
        input.onEvent?.({
          providerId,
          status: 'canceled',
          maxConcurrencyPerProvider,
        })
        reject(new ProviderSchedulerCanceledError(providerId))
        reportQueue(providerId)
      }

      queuedItem = {
        onEvent: input.onEvent,
        detachSignal: () => input.signal?.removeEventListener('abort', abortHandler),
        start: () => {
          if (settled) return
          settled = true
          resolve({ release: () => releaseSlot(providerId) })
        },
        cancel: abortHandler,
      }
      queue.push(queuedItem)
      queuesByProvider.set(providerId, (queuesByProvider.get(providerId) || []).concat(queue))
      input.signal?.addEventListener('abort', abortHandler, { once: true })
      reportQueue(providerId)
    })
  }

  return {
    acquire,
    snapshot: (): ProviderSchedulerSnapshot => {
      const localSnapshot = {
        maxConcurrencyPerProvider,
        activeCountByProvider: Object.fromEntries(activeCountByProvider),
        waitingCountByProvider: Object.fromEntries(
          [...queuesByProvider.entries()].map(([providerId, items]) => [providerId, items.length]),
        ),
      }
      return externalSnapshotEnabled ? { ...localSnapshot, ...externalSnapshot } : localSnapshot
    },
    setExternalSnapshot: (snapshot: Partial<ProviderSchedulerSnapshot> | null | undefined) => {
      if (!snapshot || typeof snapshot !== 'object') {
        externalSnapshot = {}
        externalSnapshotEnabled = false
        return
      }
      externalSnapshot = { ...snapshot }
      externalSnapshotEnabled = true
    },
    externalSnapshot: () => ({ ...externalSnapshot }),
    isExternalSnapshotEnabled: () => externalSnapshotEnabled,
  }
}

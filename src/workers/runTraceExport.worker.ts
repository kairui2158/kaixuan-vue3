import { handleRunTraceExportWorkerMessage } from '../services/runTraceExportService'

const workerScope = self as unknown as {
  onmessage?: ((event: Parameters<typeof handleRunTraceExportWorkerMessage>[0]) => void) | null
}

workerScope.onmessage = handleRunTraceExportWorkerMessage

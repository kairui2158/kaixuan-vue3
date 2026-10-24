declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

interface ElectronApiBridge {
  [key: string]: any
  storageRead(key: string): Promise<any> | any
  storageWrite(key: string, data: any): Promise<any> | any
  storageRemove(key: string): Promise<any> | any
  storageList(): Promise<any> | any
  outlineJournalApply(projectId: string, commands: any[], options?: { immediate?: boolean }): Promise<any> | any
  outlineJournalSnapshot(projectId: string): Promise<any> | any
  outlineJournalMigrate(projectId: string, messages: any[]): Promise<any> | any
  outlineJournalFlush(projectId: string): Promise<any> | any
  outlineJournalFlushAll(): Promise<any> | any
  outlineJournalRestore(projectId: string, snapshot: any): Promise<any> | any
  outlineJournalTestFailureControl(command: { op: 'fail' | 'clear'; operation?: 'apply' | 'flush'; error?: string }): Promise<any> | any
  providerNetRegistry(): Promise<any> | any
  providerNetHeartbeat(streamId: string): Promise<any> | any
  providerNetSchedulerSnapshot(): Promise<any> | any
  providerNetStreamFrame: any
  onProviderNetStreamFrame(callback: (payload: any) => void): () => void
  responsivenessLedger(): Promise<any> | any
  responsivenessReport(payload: { kind: string; detail?: unknown }): Promise<any> | any
  onResponsivenessEvent(callback: (detail: any) => void): () => void
  dialogReadFile(filePath: string): Promise<any> | any
  dialogReadFileAsync(filePath: string): Promise<any> | any
  dialogWriteFile(filePath: string, content: string): Promise<any> | any
  dialogSaveFile(defaultName?: string): Promise<any> | any
  dialogSaveFileAsync(defaultName?: string): Promise<any> | any
  dialogOpenFile(): Promise<any> | any
  dialogOpenFileAsync(): Promise<any> | any
}

declare global {
  const __SHENYI_BODY_ABSENT_TIMEOUT_MS__: string
  const __SHENYI_BUILD_MANIFEST__: string
  interface Window {
    electronAPI: ElectronApiBridge
  }
}

declare module '*.js' {
  const value: any
  export = value
}

export {}

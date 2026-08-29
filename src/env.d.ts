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
  dialogReadFile(filePath: string): Promise<any> | any
  dialogReadFileAsync(filePath: string): Promise<any> | any
  dialogWriteFile(filePath: string, content: string): Promise<any> | any
  dialogSaveFile(defaultName?: string): Promise<any> | any
  dialogSaveFileAsync(defaultName?: string): Promise<any> | any
  dialogOpenFile(): Promise<any> | any
  dialogOpenFileAsync(): Promise<any> | any
}

declare global {
  interface Window {
    electronAPI: ElectronApiBridge
  }
}

declare module '*.js' {
  const value: any
  export = value
}

export {}

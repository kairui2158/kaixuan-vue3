import type { EditorTab } from '../stores/editor'

export interface WorkspaceSnapshot {
  createdAt: number
  tabCount: number
  tabs: Array<{
    id: string
    title: string
    content: string
    chapterId: string
    isDirty: boolean
    mode?: string
  }>
  activeTabId: string | null
}

let currentSnapshot: WorkspaceSnapshot | null = null

export function captureWorkspaceSnapshot(
  tabs: EditorTab[],
  activeTabId: string | null
): WorkspaceSnapshot {
  const snapshot: WorkspaceSnapshot = {
    createdAt: Date.now(),
    tabCount: tabs.length,
    tabs: tabs.map(tab => ({
      id: tab.id,
      title: tab.title,
      content: tab.content,
      chapterId: tab.chapterId,
      isDirty: tab.isDirty,
      mode: tab.mode,
    })),
    activeTabId,
  }
  currentSnapshot = snapshot
  return snapshot
}

export function getCurrentWorkspaceSnapshot(): WorkspaceSnapshot | null {
  return currentSnapshot
}

export function restoreWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
  return {
    tabs: snapshot.tabs.map(tab => ({ ...tab })),
    activeTabId: snapshot.activeTabId,
  }
}

export function clearWorkspaceSnapshot(): void {
  currentSnapshot = null
}

export function hasWorkspaceSnapshot(): boolean {
  return currentSnapshot !== null
}

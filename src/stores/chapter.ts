import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'

export interface Chapter {
  id: string
  volumeId: string
  title: string
  plot: string
  body: string
  order: number
}

function toPlain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

export const useChapterStore = defineStore('chapter', () => {
  const chapters = ref<Chapter[]>([])
  const currentVolumeId = ref<string | null>(null)

  const volumeChapters = computed(() => {
    if (!currentVolumeId.value) return []
    return chapters.value
      .filter(c => c.volumeId === currentVolumeId.value)
      .sort((a, b) => a.order - b.order)
  })

  function loadChapters(projectId: string) {
    const data = window.electronAPI.storageRead(storageKey('chapters_' + projectId))
    if (data) chapters.value = data.chapters || data || []
  }

  function saveChapters(projectId: string) {
    window.electronAPI.storageWrite(storageKey('chapters_' + projectId), { chapters: toPlain(chapters.value) })
  }

  function addChapter(chapter: Chapter) {
    chapters.value.push(chapter)
  }

  function updateChapter(id: string, data: Partial<Chapter>) {
    const idx = chapters.value.findIndex(c => c.id === id)
    if (idx >= 0) {
      chapters.value[idx] = { ...chapters.value[idx], ...data }
    }
  }

  function removeChapter(id: string) {
    chapters.value = chapters.value.filter(c => c.id !== id)
  }

  function setVolume(volumeId: string) {
    currentVolumeId.value = volumeId
  }

  function getChapter(id: string) {
    return chapters.value.find(c => c.id === id)
  }

  return {
    chapters, currentVolumeId, volumeChapters,
    loadChapters, saveChapters, addChapter, updateChapter, removeChapter,
    setVolume, getChapter
  }
})


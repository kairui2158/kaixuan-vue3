import { describe, expect, it } from 'vitest'
import { computed } from 'vue'
import { buildLiveApiStatusLines, useLiveApiStatus } from './useLiveApiStatus'

describe('useLiveApiStatus', () => {
  it('shows connecting and streaming lines during a running call', () => {
    expect(buildLiveApiStatusLines({
      active: true,
      message: '正在连接 API...',
      latestCall: { status: 'running', streamLength: 1200, retrying: false }
    })).toEqual([
      { kind: 'connecting', text: '正在连接 API...' },
      { kind: 'streaming', text: '流式接收中 · 已接收 1200 字' }
    ])
  })

  it('falls back to the default connecting text without a status message', () => {
    expect(buildLiveApiStatusLines({
      active: true,
      message: '',
      latestCall: null
    })).toEqual([{ kind: 'connecting', text: '正在连接 API...' }])
  })

  it('marks retry states through the retrying flag', () => {
    const lines = buildLiveApiStatusLines({
      active: true,
      message: '正在直出重试',
      latestCall: { status: 'running', streamLength: 0, retrying: true }
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].kind).toBe('retrying')
  })

  it('keeps a terminal message but never shows stream progress after completion', () => {
    expect(buildLiveApiStatusLines({
      active: false,
      message: '生成完成',
      latestCall: { status: 'success', streamLength: 3000, retrying: false }
    })).toEqual([{ kind: 'terminal', text: '生成完成' }])
  })

  it('is silent when inactive and no terminal message exists', () => {
    expect(buildLiveApiStatusLines({ active: false, message: '', latestCall: null })).toEqual([])
  })

  it('exposes the same mapping through the composable', () => {
    const lines = useLiveApiStatus(computed(() => ({
      active: true,
      message: '正在接收 AI 输出…',
      latestCall: { status: 'running', streamLength: 26, retrying: false }
    })))
    expect(lines.value).toEqual([
      { kind: 'connecting', text: '正在接收 AI 输出…' },
      { kind: 'streaming', text: '流式接收中 · 已接收 26 字' }
    ])
  })
})

const PREFIX = 'wa_'

/**
 * 统一存储键名，确保所有存储都带 wa_ 前缀
 * 与旧架构 StorageManager.key() 行为对齐
 */
export function storageKey(name: string): string {
  // 如果已经带前缀，直接返回
  if (name.startsWith(PREFIX)) return name
  return PREFIX + name
}

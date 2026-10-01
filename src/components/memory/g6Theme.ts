export function g6Token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

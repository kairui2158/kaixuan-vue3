import { getLockedSettingsForLayer, type SettingsProjectionLayer } from './settingsProjection'

export function characterLinesForLayer(
  layer: SettingsProjectionLayer,
  collection: Parameters<typeof getLockedSettingsForLayer>[1],
  context: Parameters<typeof getLockedSettingsForLayer>[2] = {}
): string[] {
  const projection = getLockedSettingsForLayer(layer, collection, context)
  const selected = new Set(projection.blocks.flatMap(block => block.lines))
  return projection
    .items
    .filter(item => String(item.category).includes('人物'))
    .filter(item => selected.has(`${item.category} - ${item.name} - ${item.text}`))
    .map(item => `${item.name}（${item.text}）`)
}

export function characterContextForStep(
  step: number,
  collection: Parameters<typeof getLockedSettingsForLayer>[1]
): string {
  const layerByStep: Record<number, SettingsProjectionLayer> = {
    1: 'home',
    2: 'volume',
    3: 'chapter',
    4: 'body'
  }
  const layer = layerByStep[step] || 'body'
  return characterLinesForLayer(layer, collection).join('；')
}

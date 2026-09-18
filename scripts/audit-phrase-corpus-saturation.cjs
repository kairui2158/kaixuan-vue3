const fs = require('fs')
const path = require('path')

const corpusFile = path.join(__dirname, '..', '_audit', 'phrase-corpus-saturated.json')
const corpus = JSON.parse(fs.readFileSync(corpusFile, 'utf8'))

const problems = []
const categoryStats = []
const allPhrases = new Map()

for (const [category, definition] of Object.entries(corpus.categories)) {
  let phraseCount = 0
  const groupStats = []
  for (const group of definition.groups) {
    const unique = new Set(group.phrases)
    if (unique.size !== group.phrases.length) {
      problems.push(`${category}/${group.name}: duplicate phrases (${group.phrases.length - unique.size})`)
    }
    for (const phrase of group.phrases) {
      phraseCount += 1
      if (!phrase.trim()) {
        problems.push(`${category}/${group.name}: empty phrase`)
        continue
      }
      const key = `${category}\u0000${phrase}`
      if (allPhrases.has(key)) {
        problems.push(`${category}/${group.name}: duplicate phrase "${phrase}"`)
      }
      allPhrases.set(key, group.name)
    }
    groupStats.push({ group: group.name, count: group.phrases.length, source: group.source })
  }
  categoryStats.push({ category, phraseCount, groups: groupStats })
}

const crossCategoryDuplicates = []
for (const [key, group] of allPhrases) {
  const [category, phrase] = key.split('\u0000')
  const otherCategories = []
  for (const [otherKey, otherGroup] of allPhrases) {
    const [otherCategory, otherPhrase] = otherKey.split('\u0000')
    if (otherCategory === category || otherPhrase !== phrase) continue
    otherCategories.push(`${otherCategory}/${otherGroup}`)
  }
  if (otherCategories.length > 0) {
    crossCategoryDuplicates.push({ phrase, category, duplicates: otherCategories })
  }
}
for (const item of crossCategoryDuplicates) {
  problems.push(`cross-category duplicate "${item.phrase}": ${item.category} <-> ${item.duplicates.join(', ')}`)
}

const sampleStats = []
const samplePhraseCount = new Map()
for (const group of corpus.sampleGroups) {
  const unique = new Set(group.samples)
  if (unique.size !== group.samples.length) {
    problems.push(`sample-group/${group.name}: duplicate samples (${group.samples.length - unique.size})`)
  }
  sampleStats.push({
    group: group.name,
    expectedIntent: group.expectedIntent,
    source: group.source,
    count: group.samples.length,
  })
  for (const sample of group.samples) {
    samplePhraseCount.set(sample, (samplePhraseCount.get(sample) || 0) + 1)
  }
}

const writeActions = corpus.categories.editDirectives.groups
  .filter((group) => group.name !== 'write-targets')
  .flatMap((group) => group.phrases)
const statusPermissionPhrases = corpus.categories.readOnlyStatusPermission.groups.flatMap(
  (group) => group.phrases,
)
const locationPhrases = corpus.categories.readOnlyLocation.groups.flatMap(
  (group) => group.phrases,
)

// 语义护栏：同词只允许出现在一个权限层；层级靠 conflictPriority 表达，不靠复制词表。
const permissionLayerMap = new Map()
for (const phrase of [...writeActions, ...statusPermissionPhrases, ...locationPhrases]) {
  const previous = permissionLayerMap.get(phrase)
  const current =
    writeActions.includes(phrase)
      ? 'write'
      : statusPermissionPhrases.includes(phrase)
        ? 'status-permission'
        : 'location'
  if (previous && previous !== current) {
    problems.push(`permission-layer duplicate "${phrase}": ${previous} <-> ${current}`)
  } else if (!previous) {
    permissionLayerMap.set(phrase, current)
  }
}

// 词表包含观测：同类别允许“短语式 + 长语式”共存，匹配器按最长命中优先。
// 这里只记录饱和度，不作为阻断项；阻断项是跨类别重复和权限层串词。
const containmentObservations = []
for (const category of Object.values(corpus.categories)) {
  const phrases = category.groups.flatMap((group) => group.phrases)
  for (const phrase of phrases) {
    const container = phrases.find((other) => other !== phrase && other.includes(phrase))
    if (container) {
      containmentObservations.push({ phrase, container, category: category.description })
    }
  }
}
for (const [sample, count] of samplePhraseCount) {
  if (count > 1) {
    problems.push(`sample appears ${count} times: "${sample}"`)
  }
}

const totals = {
  categoryCount: categoryStats.length,
  phraseCount: categoryStats.reduce((sum, item) => sum + item.phraseCount, 0),
  groupCount: categoryStats.reduce((sum, item) => sum + item.groups.length, 0),
  sampleCount: sampleStats.reduce((sum, item) => sum + item.count, 0),
  writeActionCount: categoryStats.find((item) => item.category === 'editDirectives')?.phraseCount || 0,
  locationCount: categoryStats.find((item) => item.category === 'readOnlyLocation')?.phraseCount || 0,
  statusPermissionCount:
    categoryStats.find((item) => item.category === 'readOnlyStatusPermission')?.phraseCount || 0,
  referenceCount: categoryStats.find((item) => item.category === 'readOnlyReference')?.phraseCount || 0,
  containmentObservationCount: containmentObservations.length,
}

const report = {
  file: corpusFile,
  totals,
  categoryStats,
  sampleStats,
  containmentObservations,
  problems,
}

console.log(JSON.stringify(report, null, 2))
if (problems.length > 0) process.exitCode = 1

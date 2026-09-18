const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const jsonFile = path.join(root, '_audit', 'phrase-corpus-saturated.json')
const tsFile = path.join(root, 'src', 'services', 'chainIntentPhraseCorpus.ts')

const corpus = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))
const source = fs.readFileSync(tsFile, 'utf8')

const jsonGroups = Object.values(corpus.categories).flatMap((category) =>
  category.groups.map((group) => ({ ...group, category: category.description })),
)

const tsGroups = [
  ...source.matchAll(
    /\{\s*category:\s*'([^']+)'\s*,\s*name:\s*'([^']+)'\s*,\s*source:\s*'([^']+)'\s*,\s*phrases:\s*\[([^\]]*)\]\s*,?\s*\}/g,
  ),
].map((match) => ({
  category: match[1],
  name: match[2],
  source: match[3],
  phrases: [...match[4].matchAll(/'((?:\\.|[^'])*)'/g)].map((item) => item[1]),
}))

const problems = []

const categoryPhrases = new Map()
for (const group of jsonGroups) {
  const phrases = categoryPhrases.get(group.category) || []
  phrases.push(...group.phrases)
  categoryPhrases.set(group.category, phrases)
}

const jsonGroupNames = jsonGroups.map((group) => group.name)
const tsGroupNames = tsGroups.map((group) => group.name)
if (JSON.stringify(jsonGroupNames) !== JSON.stringify(tsGroupNames)) {
  problems.push(`group order mismatch: json=${JSON.stringify(jsonGroupNames)} ts=${JSON.stringify(tsGroupNames)}`)
}

const jsonGroupMap = new Map(jsonGroups.map((group) => [group.name, group]))
for (const tsGroup of tsGroups) {
  const jsonGroup = jsonGroupMap.get(tsGroup.name)
  if (!jsonGroup) {
    problems.push(`ts-only group: ${tsGroup.name}`)
    continue
  }
  if (tsGroup.source !== jsonGroup.source) {
    problems.push(`${tsGroup.name}: source json=${jsonGroup.source} ts=${tsGroup.source}`)
  }
  if (JSON.stringify(tsGroup.phrases) !== JSON.stringify(jsonGroup.phrases)) {
    const jsonSet = new Set(jsonGroup.phrases)
    const tsSet = new Set(tsGroup.phrases)
    const jsonOnly = jsonGroup.phrases.filter((phrase) => !tsSet.has(phrase))
    const tsOnly = tsGroup.phrases.filter((phrase) => !jsonSet.has(phrase))
    if (jsonOnly.length > 0) problems.push(`${tsGroup.name}: json-only ${JSON.stringify(jsonOnly)}`)
    if (tsOnly.length > 0) {
      const coveredPhrases = categoryPhrases.get(jsonGroup.category) || []
      const covered = new Set(coveredPhrases)
      const uncovered = tsOnly.filter((phrase) => !covered.has(phrase))
      problems.push(`${tsGroup.name}: ts-only ${JSON.stringify(tsOnly)}`)
      if (uncovered.length > 0) {
        problems.push(`${tsGroup.name}: ts-only-uncovered ${JSON.stringify(uncovered)}`)
      }
    }
    if (jsonOnly.length === 0 && tsOnly.length === 0) {
      problems.push(`${tsGroup.name}: phrase order mismatch`)
    }
  }
}

let collecting = false
const tsSamples = []
for (const line of source.split('\n')) {
  if (line.includes('export const SATURATED_INTENT_SAMPLES')) collecting = true
  if (!collecting) continue
  if (line.trim().startsWith(']')) break
  const match = line.match(
    /groupName:\s*'([^']*)',\s*source:\s*'([^']*)',\s*expectedIntent:\s*'([^']*)',\s*input:\s*'((?:\\.|[^'])*)'/,
  )
  if (match) {
    tsSamples.push({
      groupName: match[1],
      source: match[2],
      expectedIntent: match[3],
      input: match[4],
    })
  }
}

const jsonSamples = corpus.sampleGroups.flatMap((group) =>
  group.samples.map((input) => ({
    groupName: group.name,
    source: group.source,
    expectedIntent: group.expectedIntent,
    input,
  })),
)

if (JSON.stringify(jsonSamples) !== JSON.stringify(tsSamples)) {
  const jsonSampleKeys = new Set(jsonSamples.map((item) => `${item.groupName}\u0000${item.input}`))
  const tsSampleKeys = new Set(tsSamples.map((item) => `${item.groupName}\u0000${item.input}`))
  for (const item of jsonSamples.filter((item) => !tsSampleKeys.has(`${item.groupName}\u0000${item.input}`))) {
    problems.push(`sample json-only: ${item.groupName} / ${item.input}`)
  }
  for (const item of tsSamples.filter((item) => !jsonSampleKeys.has(`${item.groupName}\u0000${item.input}`))) {
    problems.push(`sample ts-only: ${item.groupName} / ${item.input}`)
  }
  if (problems.length === 0) problems.push('sample order or metadata mismatch')
}

const totals = {
  jsonPhraseCount: jsonGroups.reduce((sum, group) => sum + group.phrases.length, 0),
  tsPhraseCount: tsGroups.reduce((sum, group) => sum + group.phrases.length, 0),
  jsonGroupCount: jsonGroups.length,
  tsGroupCount: tsGroups.length,
  jsonSampleCount: jsonSamples.length,
  tsSampleCount: tsSamples.length,
}

console.log(JSON.stringify({ totals, problems }, null, 2))
if (problems.length > 0) process.exitCode = 1

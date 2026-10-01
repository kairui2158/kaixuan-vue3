const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const jsonFile = path.join(root, '_audit', 'phrase-corpus-saturated.json')
const tsFile = path.join(root, 'src', 'services', 'chainIntentPhraseCorpus.ts')

const corpus = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))

const categoryByGroup = new Map([
  ['strong-write-actions', 'strongWriteActions'],
  ['weak-write-actions', 'weakWriteActions'],
  ['community-write-actions', 'strongWriteActions'],
  ['community-write-intensifiers', 'writeIntensifiers'],
  ['write-intensifiers', 'writeIntensifiers'],
  ['write-targets', 'writeTargets'],
  ['interrogative-location', 'readOnlyLocationQuestion'],
  ['structural-anchors', 'readOnlyLocationQuestion'],
  ['location-request-verbs', 'readOnlyLocationRequest'],
  ['permission-questions', 'readOnlyPermissionQuestion'],
  ['community-permission-questions', 'readOnlyPermissionQuestion'],
  ['status-questions', 'readOnlyStatusQuestion'],
  ['prohibition-rollback', 'readOnlyProhibition'],
  ['community-prohibition', 'readOnlyProhibition'],
  ['request-reference', 'readOnlyReference'],
  ['how-to-questions', 'readOnlyReference'],
  ['preview-and-explain', 'readOnlyReference'],
  ['affirmative', 'contextualReplies'],
  ['continuation', 'contextualReplies'],
  ['closing', 'contextualReplies'],
  ['desire-and-preference', 'clarificationRequests'],
  ['interrogative-modal', 'clarificationRequests'],
  ['discourse-continuation', 'clarificationRequests'],
  ['analyze', 'analyzeKeywords'],
  ['generate', 'generateKeywords'],
  ['discuss', 'discussKeywords'],
])

for (const category of Object.values(corpus.categories)) {
  for (const group of category.groups) {
    if (!categoryByGroup.has(group.name)) throw new Error(`unmapped group: ${group.name}`)
  }
}

function quote(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function renderGroup(group) {
  const category = categoryByGroup.get(group.name)
  if (!category) throw new Error(`unknown group: ${group.name}`)
  return `  {
    category: ${quote(category)},
    name: ${quote(group.name)},
    source: ${quote(group.source)},
    phrases: [${group.phrases.map(quote).join(', ')}],
  },`
}

function renderSample(group, input) {
  return `  { groupName: ${quote(group.name)}, source: ${quote(group.source)}, expectedIntent: ${quote(group.expectedIntent)}, input: ${quote(input)} },`
}

const groupsBlock = Object.values(corpus.categories)
  .flatMap(category => category.groups)
  .map(renderGroup)
  .join('\n')

const samplesBlock = corpus.sampleGroups
  .flatMap(group => group.samples.map(input => renderSample(group, input)))
  .join('\n')

let source = fs.readFileSync(tsFile, 'utf8')

const groupsStart = source.indexOf('export const PHRASE_CORPUS_GROUPS: PhraseCorpusGroup[] = [')
const groupsEndRegex = /\r?\n\]\r?\n\r?\nexport const SATURATED_PHRASE_ENTRIES/
const groupsEndMatch = groupsEndRegex.exec(source.slice(groupsStart))
const groupsEnd = groupsEndMatch ? groupsStart + groupsEndMatch.index + groupsEndMatch[0].length : -1
if (groupsStart < 0 || groupsEnd < 0) throw new Error('PHRASE_CORPUS_GROUPS block not found')
source = `${source.slice(0, groupsStart)}export const PHRASE_CORPUS_GROUPS: PhraseCorpusGroup[] = [\n${groupsBlock}\n]\n\nexport const SATURATED_PHRASE_ENTRIES${source.slice(groupsEnd)}`

const samplesStart = source.indexOf('export const SATURATED_INTENT_SAMPLES: readonly SaturatedIntentSample[] = [')
if (samplesStart < 0) throw new Error('SATURATED_INTENT_SAMPLES block not found')
const samplesEnd = source.lastIndexOf(']', source.length)
if (samplesEnd < samplesStart) throw new Error('SATURATED_INTENT_SAMPLES end not found')
source = `${source.slice(0, samplesStart)}export const SATURATED_INTENT_SAMPLES: readonly SaturatedIntentSample[] = [\n${samplesBlock}\n]\n`

fs.writeFileSync(tsFile, source, 'utf8')

const phraseCount = Object.values(corpus.categories).reduce(
  (sum, category) => sum + category.groups.reduce((groupSum, group) => groupSum + group.phrases.length, 0),
  0,
)
const sampleCount = corpus.sampleGroups.reduce((sum, group) => sum + group.samples.length, 0)
console.log(
  JSON.stringify({
    generated: path.relative(root, tsFile),
    groupCount: categoryByGroup.size,
    phraseCount,
    sampleCount,
  }),
)

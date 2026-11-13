import fs from 'node:fs'
import path from 'node:path'

export function corpusFail(label, message) {
  console.error(`[${label}] FAIL: ${message}`)
  process.exit(1)
}

export function parseJsonl(filePath, label = 'deai-calibration-corpus') {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false })
  if (!stat?.isFile()) corpusFail(label, `missing corpus file: ${filePath}`)
  const records = []
  fs.readFileSync(filePath, 'utf8').split('\n').forEach((line, index) => {
    if (!line.trim()) return []
    try {
      records.push(JSON.parse(line))
    } catch (error) {
      throw new Error(`[${label}] invalid JSONL ${filePath}:${index + 1}: ${error.message}`)
    }
  })
  return records
}

function humanSourcePathFor(record, corpusRoot) {
  const author = encodeURIComponent(String(record.author || 'unknown').trim().toLowerCase())
  const work = encodeURIComponent(String(record.work || 'unknown').trim().toLowerCase())
  return path.join(corpusRoot, 'sources', 'human', 'authors', author, 'works', work, 'chapters.jsonl')
}

function modelSourcePathFor(record, corpusRoot) {
  return path.join(corpusRoot, 'sources', 'model', record.provider, record.model, 'samples.jsonl')
}

function indexJsonlBy(filePath, keyOf, label) {
  const index = new Map()
  for (const record of parseJsonl(filePath, label)) index.set(keyOf(record), record)
  return index
}

export function loadHumanSamples(corpusRoot, label = 'deai-calibration-corpus') {
  const labels = parseJsonl(path.join(corpusRoot, 'labels', 'human-negative.jsonl'), label)
  const sourceByPath = new Map()
  const missing = []
  for (const labelRecord of labels) {
    const filePath = humanSourcePathFor(labelRecord, corpusRoot)
    if (!sourceByPath.has(filePath)) {
      if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
        missing.push({ id: labelRecord.id, path: filePath, reason: 'missing-source-file' })
        continue
      }
      sourceByPath.set(filePath, indexJsonlBy(filePath, record => record.id, label))
    }
    if (!sourceByPath.get(filePath)?.has(labelRecord.id)) {
      missing.push({ id: labelRecord.id, path: filePath, reason: 'id-not-found' })
    }
  }
  if (missing.length) corpusFail(label, `missing human source records: ${JSON.stringify(missing.slice(0, 5))}`)
  return labels.map(labelRecord => {
    const source = sourceByPath.get(humanSourcePathFor(labelRecord, corpusRoot)).get(labelRecord.id)
    return {
      id: labelRecord.id,
      author: labelRecord.author,
      authorVerified: labelRecord.authorVerified ?? true,
      work: labelRecord.work,
      genre: labelRecord.genre || 'unknown',
      chapter: labelRecord.chapter,
      title: labelRecord.title,
      charCount: labelRecord.charCount,
      text: source.text
    }
  })
}

export function loadModelSamples(corpusRoot, label = 'deai-calibration-corpus') {
  const labels = parseJsonl(path.join(corpusRoot, 'labels', 'model-positive.jsonl'), label)
  const sourceByPath = new Map()
  const missing = []
  for (const labelRecord of labels) {
    const filePath = modelSourcePathFor(labelRecord, corpusRoot)
    if (!sourceByPath.has(filePath)) {
      if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
        missing.push({ id: labelRecord.id, path: filePath, reason: 'missing-source-file' })
        continue
      }
      sourceByPath.set(filePath, indexJsonlBy(filePath, record => record.id, label))
    }
    if (!sourceByPath.get(filePath)?.has(labelRecord.id)) {
      missing.push({ id: labelRecord.id, path: filePath, reason: 'id-not-found' })
    }
  }
  if (missing.length) corpusFail(label, `missing model source records: ${JSON.stringify(missing.slice(0, 5))}`)
  return labels.map(labelRecord => {
    const source = sourceByPath.get(modelSourcePathFor(labelRecord, corpusRoot)).get(labelRecord.id)
    return {
      id: labelRecord.id,
      provider: labelRecord.provider,
      model: labelRecord.model,
      generationStep: labelRecord.generationStep,
      charCount: labelRecord.charCount,
      text: source.text
    }
  })
}

export function mulberry32(seed) {
  let state = seed >>> 0
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function groupBy(samples, keyOf) {
  return samples.reduce((acc, sample) => {
    const key = keyOf(sample)
    if (!acc[key]) acc[key] = []
    acc[key].push(sample)
    return acc
  }, {})
}

export function countWorks(samples) {
  return new Set(samples.map(sample => `${sample.author}::${sample.work}`)).size
}

export function deterministicWorkSplit(samples, { perWork, seed }, label = 'deai-calibration-corpus') {
  if (perWork < 7) corpusFail(label, `per-work sample count below minimum: ${perWork}`)
  const random = mulberry32(seed)
  const sampled = []
  const workKeys = []
  for (const [work, workSamples] of Object.entries(groupBy(samples, sample => `${sample.author}::${sample.work}`))) {
    const shuffled = [...workSamples]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    sampled.push(...shuffled.slice(0, perWork))
    workKeys.push(work)
  }
  workKeys.sort()

  const rotated = workKeys.map((work, index) => ({ work, bucket: ['train', 'dev', 'heldOut'][(index + seed) % 3] }))
  const bucketByWork = new Map(rotated.map(item => [item.work, item.bucket]))
  const train = []
  const dev = []
  const heldOut = []
  for (const sample of sampled) {
    const bucket = bucketByWork.get(`${sample.author}::${sample.work}`)
    if (bucket === 'train') train.push(sample)
    else if (bucket === 'dev') dev.push(sample)
    else heldOut.push(sample)
  }

  const worksByBucket = Object.fromEntries(['train', 'dev', 'heldOut'].map(bucket => {
    const works = rotated.filter(item => item.bucket === bucket).map(item => item.work)
    return [bucket === 'heldOut' ? 'heldOut' : bucket, works]
  }))
  if (!train.length || !dev.length || !heldOut.length) corpusFail(label, 'work split produced an empty bucket')
  const overlap = []
  for (const { work } of rotated) {
    const bucketCount = [train, dev, heldOut].filter(bucket =>
      bucket.some(sample => `${sample.author}::${sample.work}` === work)).length
    if (bucketCount > 1) overlap.push({ work, bucketCount })
  }
  if (overlap.length) corpusFail(label, `work-level split leakage: ${JSON.stringify(overlap.slice(0, 5))}`)
  return { train, dev, heldOut, worksByBucket }
}

export function deterministicModelSplit(samples, { seed }, label = 'deai-calibration-corpus') {
  const random = mulberry32(seed + 7717)
  const groups = Object.entries(groupBy(samples, sample => `${sample.provider}/${sample.model}`)).sort(([a], [b]) => a.localeCompare(b))
  const train = []
  const dev = []
  const heldOut = []
  for (const [, groupSamples] of groups) {
    const shuffled = [...groupSamples].sort((a, b) => String(a.id).localeCompare(String(b.id)))
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const trainCount = shuffled.length <= 2
      ? shuffled.length
      : Math.max(1, Math.floor(shuffled.length * 0.6))
    const remainder = shuffled.length - trainCount
    const devCount = remainder >= 2 ? Math.ceil(remainder / 2) : 0
    const heldOutCount = remainder - devCount
    train.push(...shuffled.slice(0, trainCount))
    dev.push(...shuffled.slice(trainCount, trainCount + devCount))
    heldOut.push(...shuffled.slice(trainCount + devCount))
  }
  if (!train.length || !dev.length || !heldOut.length) {
    corpusFail(label, 'model split produced an empty bucket')
  }
  return { train, dev, heldOut }
}

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  countWorks,
  deterministicModelSplit,
  deterministicWorkSplit,
  groupBy,
  loadHumanSamples,
  loadModelSamples,
  mulberry32,
  parseJsonl
} from '../lib/deai-calibration-corpus.mjs'

const cases = []
function test(name, fn) {
  cases.push({ name, fn })
}

function makeCorpus() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deai-corpus-'))
  const humanLabels = []
  for (let workIndex = 0; workIndex < 3; workIndex += 1) {
    const work = `work-${workIndex}`
    const chapters = []
    for (let chapterIndex = 0; chapterIndex < 8; chapterIndex += 1) {
      const id = `${work}-${chapterIndex}`
      const chapter = {
        id,
        title: `第${chapterIndex + 1}章`,
        text: `人写样本 ${id}。`
      }
      chapters.push(chapter)
      humanLabels.push({
        id,
        author: 'author',
        authorVerified: true,
        work,
        genre: 'genre',
        chapter: chapterIndex,
        title: chapter.title,
        charCount: chapter.text.length
      })
    }
    const chapterPath = path.join(root, 'sources', 'human', 'authors', 'author', 'works', work, 'chapters.jsonl')
    fs.mkdirSync(path.dirname(chapterPath), { recursive: true })
    fs.writeFileSync(chapterPath, chapters.map(item => JSON.stringify(item)).join('\n') + '\n')
  }
  fs.mkdirSync(path.join(root, 'labels'), { recursive: true })
  fs.writeFileSync(path.join(root, 'labels', 'human-negative.jsonl'), humanLabels.map(item => JSON.stringify(item)).join('\n') + '\n')

  const modelSamples = []
  for (let index = 0; index < 5; index += 1) {
    modelSamples.push({ id: `p-${index}`, text: `模型样本 ${index}。` })
  }
  const modelPath = path.join(root, 'sources', 'model', 'prov', 'model')
  fs.mkdirSync(modelPath, { recursive: true })
  fs.writeFileSync(path.join(modelPath, 'samples.jsonl'), modelSamples.map(item => JSON.stringify(item)).join('\n') + '\n')
  const modelLabels = modelSamples.map((item, index) => ({
    id: item.id,
    provider: 'prov',
    model: 'model',
    generationStep: 'S2',
    charCount: item.text.length
  }))
  fs.writeFileSync(path.join(root, 'labels', 'model-positive.jsonl'), modelLabels.map(item => JSON.stringify(item)).join('\n') + '\n')
  return root
}

test('loaders join labels to source records without mutation', () => {
  const root = makeCorpus()
  const humans = loadHumanSamples(root)
  const models = loadModelSamples(root)
  assert.equal(humans.length, 24)
  assert.equal(humans[0].text, '人写样本 work-0-0。')
  assert.equal(models.length, 5)
  assert.equal(models[0].text, '模型样本 0。')
  fs.rmSync(root, { recursive: true, force: true })
})

test('work split is deterministic and leak-free', () => {
  const root = makeCorpus()
  const samples = loadHumanSamples(root)
  const first = deterministicWorkSplit(samples, { perWork: 7, seed: 20261029 })
  const second = deterministicWorkSplit(samples, { perWork: 7, seed: 20261029 })
  assert.deepEqual(first.worksByBucket, second.worksByBucket)
  assert.deepEqual(first.train.map(item => item.id), second.train.map(item => item.id))
  assert.equal(first.train.length + first.dev.length + first.heldOut.length, 21)
  const works = new Set([...first.train, ...first.dev, ...first.heldOut].map(item => `${item.author}::${item.work}`))
  assert.equal(works.size, 3)
  assert.equal(countWorks(samples), 3)
  fs.rmSync(root, { recursive: true, force: true })
})

test('model split is deterministic and keeps all samples', () => {
  const root = makeCorpus()
  const samples = loadModelSamples(root)
  const first = deterministicModelSplit(samples, { seed: 20261029 })
  const second = deterministicModelSplit(samples, { seed: 20261029 })
  assert.deepEqual(first.train.map(item => item.id), second.train.map(item => item.id))
  assert.equal(first.train.length + first.dev.length + first.heldOut.length, 5)
  assert.equal(first.train.length, 3)
  assert.equal(first.dev.length, 1)
  assert.equal(first.heldOut.length, 1)
  fs.rmSync(root, { recursive: true, force: true })
})

test('JSONL parser rejects malformed lines and helper utilities are stable', () => {
  const root = makeCorpus()
  const badPath = path.join(root, 'bad.jsonl')
  fs.writeFileSync(badPath, '{"ok":true}\n{invalid\n')
  assert.throws(() => parseJsonl(badPath), /invalid JSONL/)
  assert.equal(groupBy([{ k: 'a' }, { k: 'a' }, { k: 'b' }], item => item.k).a.length, 2)
  assert.equal(mulberry32(1)(), mulberry32(1)())
  fs.rmSync(root, { recursive: true, force: true })
})

let failed = 0
for (const item of cases) {
  try {
    item.fn()
    console.log(`PASS ${item.name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${item.name}`)
    console.error(error)
  }
}

if (failed > 0) {
  console.error(`${failed} test(s) failed`)
  process.exit(1)
}
console.log(`${cases.length} tests passed`)

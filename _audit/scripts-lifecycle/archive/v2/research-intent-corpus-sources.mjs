import fs from 'node:fs'
import path from 'node:path'

const OUTPUT_PATH = path.join(
  process.cwd(),
  '_audit',
  'RESEARCH_2026-09-22_INTENT_CORPUS_FACTORY_SOURCES.json',
)

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'novel-workshop-intent-corpus-research',
    },
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`)
  return response.json()
}

const githubQueries = [
  '中文 意图识别 数据集',
  'Chinese intent classification dataset',
  'Chinese task-oriented dialogue dataset',
  'Chinese instruction intent dataset',
  'CrossWOZ Chinese dialogue',
  'RiSAWOZ Chinese dialogue',
  'BAAI COIG CQIA',
  'BelleGroup train 1M Chinese',
]

const sources = []
for (const query of githubQueries) {
  try {
    const encoded = encodeURIComponent(query)
    const result = await fetchJson(
      `https://api.github.com/search/repositories?q=${encoded}&per_page=10`,
    )
    for (const item of result.items) {
    sources.push({
      provider: 'github',
      query,
      id: item.full_name,
      url: item.html_url,
      description: item.description,
      license: item.license?.spdx_id || null,
      stars: item.stargazers_count,
      updatedAt: item.updated_at,
      fetchedAt: new Date().toISOString(),
      trust: 'bronze',
      candidateDataFiles: [],
      inspected: false,
    })
    }
  } catch (error) {
    sources.push({
      provider: 'github-search',
      query,
      error: String(error),
      fetchedAt: new Date().toISOString(),
      trust: 'bronze',
      candidateDataFiles: [],
      inspected: false,
    })
  }
}

const hfDatasets = [
  'BAAI/COIG-PC-Lite',
  'BAAI/COIG-CQIA',
  'BelleGroup/train_1M_CN',
  'clue/crosswoz',
  'modelscope/RiSAWOZ',
]
for (const id of hfDatasets) {
  try {
    const result = await fetchJson(
      `https://huggingface.co/api/datasets/${encodeURIComponent(id)}`,
    )
    sources.push({
      provider: 'huggingface',
      query: 'known-dataset',
      id,
      url: `https://huggingface.co/datasets/${id}`,
      description: result.description || result.cardData?.description || null,
      license: result.cardData?.license || result.license || null,
      stars: result.likes ?? null,
      updatedAt: result.lastModified || null,
      fetchedAt: new Date().toISOString(),
      trust: 'bronze',
      candidateDataFiles: (result.siblings || []).map(file => file.rfilename).slice(0, 20),
      inspected: false,
    })
  } catch (error) {
    sources.push({
      provider: 'huggingface',
      query: 'known-dataset',
      id,
      url: `https://huggingface.co/datasets/${id}`,
      error: String(error),
      fetchedAt: new Date().toISOString(),
      trust: 'bronze',
      candidateDataFiles: [],
      inspected: false,
    })
  }
}

const report = {
  schema: 'shenyi.intent-corpus-source-research',
  version: 1,
  generatedAt: new Date().toISOString(),
  methodology: {
    searchApis: ['GitHub repository search', 'Hugging Face dataset API'],
    selectionRule:
      'Only real Chinese intent/instruction/dialogue datasets are eligible; every source records provider URL, license, and fetch timestamp. Extracted samples are Bronze until human review.',
    noReadmeOnlyConclusions: true,
  },
  sources,
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf8')
console.log(
  JSON.stringify({
    sources: sources.length,
    github: sources.filter(source => source.provider === 'github').length,
    huggingface: sources.filter(source => source.provider === 'huggingface').length,
    output: OUTPUT_PATH,
  }),
)

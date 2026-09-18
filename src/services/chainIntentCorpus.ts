import type { ChainIntent } from './chainIntentRouter'

export type IntentCorpusSample = {
  input: string
  expectedIntent: Exclude<ChainIntent, 'auto'>
  source?: string
}

export type CorpusEvaluationResult = {
  total: number
  correct: number
  accuracy: number
  failures: Array<IntentCorpusSample & { actualIntent: ChainIntent }>
}

// 单源语料集：生产规则与回归测试都从这里取样。
// 来源：2026-09-17 大纲工作台直写失效 trace（8 轮原话）与既有负样本。
export const INTENT_CORPUS_SAMPLES: readonly IntentCorpusSample[] = [
  { input: '我们来捋清楚一下大纲的时间线，时间线对后续卷纲的作用是很明显的', expectedIntent: 'discuss', source: 'trace-2026-09-17' },
  { input: '好的，按你的方案来出修改文案', expectedIntent: 'discuss', source: 'trace-2026-09-17' },
  { input: '你出#3的替换给我参考', expectedIntent: 'discuss', source: 'trace-2026-09-17' },
  { input: '现在先把我们前面两轮讨论好的事情先输入进编辑器', expectedIntent: 'edit', source: 'trace-2026-09-17' },
  { input: '先把确定的改完，改完以后再处理剩余的', expectedIntent: 'edit', source: 'trace-2026-09-17' },
  { input: '你写入编辑器了么？', expectedIntent: 'discuss', source: 'trace-2026-09-17' },
  { input: '你有写入权限啊。为什么说没有呢？', expectedIntent: 'discuss', source: 'trace-2026-09-17' },
  { input: '那你试着把修改一下大纲编辑器里的内容来验证你有没有写入权限， 你现在在第一行大纲总纲后面随意加几个字', expectedIntent: 'edit', source: 'trace-2026-09-17-direct-write' },
  { input: '那你试着改一下来验证你有没有写入权限', expectedIntent: 'edit', source: 'trace-2026-09-17-direct-write' },
  { input: '在第一行后面随意加几个字', expectedIntent: 'edit', source: 'trace-2026-09-17-direct-write' },
  { input: '这段设定写在哪里合适？', expectedIntent: 'discuss' },
  { input: '插入点在哪里？', expectedIntent: 'discuss' },
  { input: '这个内容应该放在哪个节点？', expectedIntent: 'discuss' },
  { input: '先把这个设定录入编辑器', expectedIntent: 'edit' },
  { input: '把已经确定的修改同步到编辑器', expectedIntent: 'edit' },
  { input: '把讨论结果填进第二段', expectedIntent: 'edit' },
  { input: '按刚才讨论的内容更新到编辑器', expectedIntent: 'edit' },
  { input: '把方案A落实到当前节点', expectedIntent: 'edit' },
  { input: '这段讨论结果定稿', expectedIntent: 'edit' },
  { input: '继续执行刚才的写入方案', expectedIntent: 'edit' },
]

export function evaluateIntentCorpus(
  classify: (input: string) => ChainIntent,
  samples: readonly IntentCorpusSample[] = INTENT_CORPUS_SAMPLES,
): CorpusEvaluationResult {
  const failures: Array<IntentCorpusSample & { actualIntent: ChainIntent }> = []
  let correct = 0
  for (const sample of samples) {
    const actualIntent = classify(sample.input)
    if (actualIntent === sample.expectedIntent) {
      correct += 1
      continue
    }
    failures.push({ ...sample, actualIntent })
  }
  return {
    total: samples.length,
    correct,
    accuracy: samples.length === 0 ? 0 : correct / samples.length,
    failures,
  }
}

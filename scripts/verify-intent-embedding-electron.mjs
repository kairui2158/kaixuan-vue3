import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron } from 'playwright';

const ROOT = path.resolve(process.cwd());
const APP_ROOT = path.join(ROOT, 'dist', 'win-unpacked', '神意助手.exe');
const OUTPUT_DIR = path.join(ROOT, '_audit', 'verification-intent-embedding-electron');
const EXPECTED_DIMS = 512;
const LAUNCH_TIMEOUT_MS = 90_000;
const STEP_TIMEOUT_MS = 120_000;

if (!(await fs.access(APP_ROOT).then(() => true, () => false))) {
  console.error(`Missing packaged app: ${APP_ROOT}`);
  process.exit(1);
}

const rounds = [
  { round: 1, dimension: 'mainline', inputs: ['生成一个完整大纲', '分析一下大纲缺失什么'] },
  { round: 2, dimension: 'variants', inputs: ['开篇那个吸引点我不太满意', '第一卷钩子得重新弄一下', '开头抓人的地方要再强化'] },
  { round: 3, dimension: 'stress-loading-window', inputs: Array.from({ length: 20 }, (_, i) => `第${i + 1}轮混合意图输入：请检查第一卷钩子并说明修改建议`) },
];

const results = [];

function withTimeout(promise, label, timeoutMs = STEP_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

console.log('[stage] launching packaged app');
const electronApp = await _electron.launch({
  executablePath: APP_ROOT,
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
});

const electronProcess = electronApp.process();
if (electronProcess) {
  electronProcess.stdout?.on('data', (chunk) => process.stdout.write(`[app:stdout] ${chunk}`));
  electronProcess.stderr?.on('data', (chunk) => process.stderr.write(`[app:stderr] ${chunk}`));
}

let window;
try {
  console.log('[stage] waiting for first window');
  window = await withTimeout(electronApp.firstWindow(), 'firstWindow', LAUNCH_TIMEOUT_MS);
  await withTimeout(window.waitForLoadState('domcontentloaded'), 'domcontentloaded', LAUNCH_TIMEOUT_MS);

  const apiReady = await withTimeout(window.waitForFunction(() => Boolean(window.electronAPI?.intentEmbed), null, { timeout: STEP_TIMEOUT_MS }), 'electronAPI.intentEmbed');
  if (!apiReady) throw new Error('electronAPI.intentEmbed is unavailable');

  for (const round of rounds) {
    console.log(`[stage] round ${round.round}/${rounds.length}: ${round.dimension}`);
    const statusBefore = await withTimeout(window.evaluate(() => window.electronAPI.intentEmbeddingStatus()), `round ${round.round} statusBefore`);
    const vectors = [];
    for (const input of round.inputs) {
      const output = await withTimeout(window.evaluate(async (text) => window.electronAPI.intentEmbed([text]), input), `round ${round.round} embed`);
      if (output.error || !Array.isArray(output.vectors) || output.vectors.length !== 1) {
        throw new Error(`Round ${round.round} embed failed: ${JSON.stringify(output).slice(0, 300)}`);
      }
      vectors.push(output.vectors[0]);
    }
    const statusAfter = await withTimeout(window.evaluate(() => window.electronAPI.intentEmbeddingStatus()), `round ${round.round} statusAfter`);
    const validShape = vectors.every((vector) => Array.isArray(vector) && vector.length === EXPECTED_DIMS);
    const finite = vectors.every((vector) => vector.every((value) => Number.isFinite(value)));
    if (!validShape || !finite || statusAfter.state !== 'ready') {
      throw new Error(`Round ${round.round} invalid: shape=${validShape} finite=${finite} status=${statusAfter.state}`);
    }
    results.push({
      ...round,
      statusBefore,
      statusAfter,
      vectorCount: vectors.length,
      dims: EXPECTED_DIMS,
      verdict: 'pass',
    });
  }

  const warmup = await withTimeout(window.evaluate(() => window.electronAPI.intentEmbeddingWarmup()), 'warmup');
  if (!warmup.ok || warmup.state !== 'ready') {
    throw new Error(`Warmup invalid: ${JSON.stringify(warmup)}`);
  }

  const evidence = {
    schemaVersion: 'v6-phase2-embedding-electron-v1',
    generatedAt: new Date().toISOString(),
    model: 'Xenova/bge-small-zh-v1.5',
    rounds: results,
    warmup,
  };
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, 'intent-embedding-electron-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log('===== INTENT EMBEDDING V6 PHASE 2 ELECTRON VERIFICATION PASSED =====');
  console.log(`rounds=${results.length}; dims=${EXPECTED_DIMS}; evidence=${path.join(OUTPUT_DIR, 'intent-embedding-electron-evidence.json')}`);
} finally {
  await withTimeout(electronApp.close(), 'electronApp.close', 15_000).catch(async () => {
    electronProcess?.kill('SIGKILL');
    await electronApp.close().catch(() => {});
  });
}

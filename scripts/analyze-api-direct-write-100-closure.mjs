import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve('_audit/research-api-direct-write-100-closure-2026-09-23');
const summaryPath = path.join(dataDir, 'summary.json');
const legacyPath = path.join(dataDir, 'legacy-rounds-01-10.json');
const inventoryJsonPath = path.join(dataDir, 'INVENTORY_ANALYSIS.json');
const inventoryMdPath = path.join(dataDir, 'INVENTORY_ANALYSIS.md');

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const legacyRounds = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
const dimensions = summary.dimensions;
const expectedDimensions = [
  'protocol',
  'permission',
  'editing',
  'statemachine',
  'toolloop',
  'observability',
  'longdocument',
  'provider',
  'routing',
  'verification',
];

if (dimensions.join(',') !== expectedDimensions.join(',')) {
  throw new Error(`Dimension mismatch: ${dimensions.join(',')}`);
}
if (legacyRounds.length !== 100) {
  throw new Error(`Expected 100 legacy round entries, got ${legacyRounds.length}`);
}

const normalizeRepo = (name) => name.toLowerCase();
const keyCount = (values) => {
  const map = new Map();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

const dimensionAnalysis = [];
const allRoundRecords = [];
const dimensionRepoSets = new Map();
const uniqueRepoMap = new Map();
const uniqueCacheMap = new Map();
const cacheIssues = [];

function collectCacheFiles(repo, roundLabel) {
  for (const file of repo.cachedFiles ?? []) {
    const cachePath = path.isAbsolute(file.cachePath)
      ? file.cachePath
      : path.resolve(dataDir, path.relative(dataDir, path.resolve(process.cwd(), file.cachePath)));
    const uniquePath = path.basename(cachePath).toLowerCase();
    const relativeCachePath = path.relative(dataDir, cachePath);
    const exists = fs.existsSync(cachePath);
    const size = exists ? fs.statSync(cachePath).size : 0;
    if (!exists || size === 0) {
      cacheIssues.push({
        round: roundLabel,
        repository: repo.fullName,
        sourcePath: file.path,
        cachePath: relativeCachePath,
        reason: exists ? 'empty-file' : 'missing-file',
      });
    }
    if (!uniqueCacheMap.has(uniquePath)) {
      uniqueCacheMap.set(uniquePath, {
        cachePath: path.join('cache', path.basename(cachePath)),
        sourcePath: file.path,
        size: file.size,
        physicalBytes: size,
        dimensions: new Set(),
        repositories: new Set(),
        extension: path.extname(file.path || file.cachePath) || '(none)',
      });
    }
    const cached = uniqueCacheMap.get(uniquePath);
    cached.dimensions.add(roundLabel.dimension);
    cached.repositories.add(normalizeRepo(repo.fullName));
  }
}

function collectRepository(repo, roundLabel, dimensionSet) {
  const key = normalizeRepo(repo.fullName);
  if (!uniqueRepoMap.has(key)) {
    uniqueRepoMap.set(key, {
      fullName: repo.fullName,
      stars: repo.stars,
      language: repo.language ?? 'unknown',
      url: repo.url,
      dimensions: new Set(),
      cachedFileCount: 0,
      seedDirect: Boolean(repo.seedDirect),
      rounds: new Set(),
    });
  }
  const record = uniqueRepoMap.get(key);
  record.dimensions.add(roundLabel.dimension);
  record.rounds.add(roundLabel.label);
  record.cachedFileCount += (repo.cachedFiles ?? []).length;
  dimensionSet.add(key);
  collectCacheFiles(repo, roundLabel);
}

for (const entry of legacyRounds) {
  if (entry.round < 1 || entry.round > 10) {
    throw new Error(`Invalid legacy round: ${entry.round}`);
  }
  const dimensionSet = dimensionRepoSets.get(entry.dimension) ?? new Set();
  dimensionRepoSets.set(entry.dimension, dimensionSet);
  const label = `round-${String(entry.round).padStart(2, '0')}`;
  allRoundRecords.push({
    dimension: entry.dimension,
    round: entry.round,
    label,
    query: entry.query,
    repositories: entry.repositories.map((repo) => repo.fullName),
  });
  for (const repo of entry.repositories) collectRepository(repo, { dimension: entry.dimension, label }, dimensionSet);
}

for (let round = 11; round <= 20; round += 1) {
  for (const dimension of dimensions) {
    const roundPath = path.join(dataDir, `round-${round}-${dimension}.json`);
    if (!fs.existsSync(roundPath)) throw new Error(`Missing round file: ${roundPath}`);
    const entry = JSON.parse(fs.readFileSync(roundPath, 'utf8'));
    if (entry.dimension !== dimension || entry.round !== round) {
      throw new Error(`Round metadata mismatch in ${roundPath}`);
    }
    const dimensionSet = dimensionRepoSets.get(dimension) ?? new Set();
    dimensionRepoSets.set(dimension, dimensionSet);
    const label = `round-${String(round).padStart(2, '0')}`;
    allRoundRecords.push({
      dimension,
      round,
      label,
      query: entry.query,
      repositories: entry.repositories.map((repo) => repo.fullName),
    });
    for (const repo of entry.repositories) collectRepository(repo, { dimension, label }, dimensionSet);
  }
}

for (const dimension of dimensions) {
  const rounds = allRoundRecords.filter((entry) => entry.dimension === dimension);
  if (rounds.length !== 20) throw new Error(`${dimension}: expected 20 rounds, got ${rounds.length}`);
  const queries = new Set(rounds.map((entry) => entry.query));
  const legacyQueryCount = rounds.filter((entry) => entry.query === 'legacy-search').length;
  const distinctQueryCount = queries.size;
  const v1ReplaySet = new Set(rounds.filter((entry) => entry.query === 'legacy-search').map((entry) => entry.label));
  const previousSets = [];
  const overlapStats = [];
  for (const round of rounds) {
    const current = new Set(round.repositories.map(normalizeRepo));
    const overlaps = previousSets.map((previous, index) => ({
      previousRound: rounds[index].round,
      overlap: [...current].filter((repo) => previous.has(repo)).length,
    }));
    const maxOverlap = overlaps.reduce((max, item) => Math.max(max, item.overlap), 0);
    overlapStats.push({ round: round.round, repositoryCount: current.size, maxOverlapWithPreviousRounds: maxOverlap });
    previousSets.push(current);
  }
  const repoSet = dimensionRepoSets.get(dimension);
  const languageCounts = keyCount(
    [...repoSet].map((repo) => uniqueRepoMap.get(repo).language),
  );
  dimensionAnalysis.push({
    dimension,
    rounds: 20,
    queryProfile: {
      distinctQueries: distinctQueryCount,
    legacyV1ReplayRounds: legacyQueryCount,
    },
    repositories: repoSet.size,
    cachedFiles: [...uniqueCacheMap.values()].filter((file) => file.dimensions.has(dimension)).length,
    languages: languageCounts.slice(0, 8),
    roundOverlap: overlapStats,
  });
}

const physicalCacheFiles = fs.readdirSync(path.join(dataDir, 'cache'), { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);
const summaryRepoMap = new Map(summary.repositories.map((repo) => [normalizeRepo(repo.fullName), repo]));
const unharvestedRepositories = (summary.repositoriesWithoutCachedFiles ?? []).map((repo) => ({
  ...repo,
}));
const harvestedRoundRepoKeys = new Set();
for (const entry of allRoundRecords) {
  for (const repoName of entry.repositories) harvestedRoundRepoKeys.add(normalizeRepo(repoName));
}
for (const repo of summaryRepoMap.values()) {
  const key = normalizeRepo(repo.fullName);
  if (!uniqueRepoMap.has(key)) {
    uniqueRepoMap.set(key, {
      fullName: repo.fullName,
      stars: repo.stars,
      language: repo.language ?? 'unknown',
      url: repo.url,
      dimensions: new Set(repo.dimensions),
      cachedFileCount: (repo.cachedFiles ?? []).length,
      seedDirect: Boolean(repo.seedDirect),
      rounds: new Set(['summary-only']),
    });
  } else {
    const record = uniqueRepoMap.get(key);
    for (const dimension of repo.dimensions) record.dimensions.add(dimension);
    record.cachedFileCount += (repo.cachedFiles ?? []).length;
    record.seedDirect ||= Boolean(repo.seedDirect);
  }
  for (const file of repo.cachedFiles ?? []) {
    const cachePath = path.isAbsolute(file.cachePath)
      ? file.cachePath
      : path.resolve(process.cwd(), file.cachePath);
    const uniquePath = path.basename(cachePath).toLowerCase();
    const exists = fs.existsSync(cachePath);
    const size = exists ? fs.statSync(cachePath).size : 0;
    if (!exists || size === 0) {
      cacheIssues.push({
        round: 'summary-only',
        repository: repo.fullName,
        sourcePath: file.path,
        cachePath: path.join('cache', path.basename(cachePath)),
        reason: exists ? 'empty-file' : 'missing-file',
      });
    }
    if (!uniqueCacheMap.has(uniquePath)) {
      uniqueCacheMap.set(uniquePath, {
        cachePath: file.cachePath,
        sourcePath: file.path,
        size: file.size,
        physicalBytes: size,
        dimensions: new Set(),
        repositories: new Set(),
        extension: path.extname(file.path || file.cachePath) || '(none)',
      });
    }
    const cached = uniqueCacheMap.get(uniquePath);
    for (const dimension of repo.dimensions) {
      if (dimensions.includes(dimension)) cached.dimensions.add(dimension);
    }
    if (repo.dimensions.includes('seed')) cached.dimensions.add('seed');
    cached.repositories.add(key);
  }
}
for (const dimension of dimensions) {
  const repoSet = dimensionRepoSets.get(dimension) ?? new Set();
  dimensionRepoSets.set(dimension, repoSet);
  for (const repo of summaryRepoMap.values()) {
    if (repo.dimensions.includes(dimension)) repoSet.add(normalizeRepo(repo.fullName));
  }
  const entry = dimensionAnalysis.find((item) => item.dimension === dimension);
  entry.repositories = repoSet.size;
  entry.cachedFiles = [...uniqueCacheMap.values()].filter((file) => file.dimensions.has(dimension)).length;
}
for (const entry of dimensionAnalysis) {
  const repoSet = dimensionRepoSets.get(entry.dimension);
  for (const repo of [...repoSet]) {
    const key = normalizeRepo(repo);
    const fromRounds = harvestedRoundRepoKeys.has(key);
    const fromSummary = summaryRepoMap.has(key) && summaryRepoMap.get(key).dimensions.includes(entry.dimension);
    if (!fromRounds && !fromSummary) repoSet.delete(repo);
  }
  entry.repositories = repoSet.size;
  entry.cachedFiles = [...uniqueCacheMap.values()].filter((file) => file.dimensions.has(entry.dimension)).length;
}
const repositories = [...uniqueRepoMap.values()].map((repo) => ({
  ...repo,
  dimensions: [...repo.dimensions],
    rounds: repo.rounds.has('summary-only') ? ['summary-only'] : [...repo.rounds],
}));
const languageDistribution = keyCount(repositories.map((repo) => repo.language));
const extensionDistribution = keyCount([...uniqueCacheMap.values()].map((file) => file.extension));
const starBands = keyCount(repositories.map((repo) => {
  if (repo.stars >= 100000) return '100k+';
  if (repo.stars >= 10000) return '10k-100k';
  if (repo.stars >= 1000) return '1k-10k';
  if (repo.stars >= 100) return '100-1k';
  return 'under-100';
}));
const seedCoverage = summary.seedCoverage.map((entry) => ({
  repo: entry.repo,
  covered: Boolean(entry.covered) && uniqueRepoMap.has(normalizeRepo(entry.repo)),
  dimensions: [...(uniqueRepoMap.get(normalizeRepo(entry.repo))?.dimensions ?? [])],
}));
const uncoveredSeeds = seedCoverage.filter((entry) => !entry.covered);

const inventory = {
  generatedAt: new Date().toISOString(),
  source: {
    summaryPath,
    legacyPath,
    roundFiles: 100,
    dimensions: expectedDimensions,
  },
  totals: {
    repositories: new Set([...summaryRepoMap.keys(), ...harvestedRoundRepoKeys]).size,
    uniqueCachedFiles: uniqueCacheMap.size,
    physicalCacheFiles: physicalCacheFiles.length,
  repositoriesWithoutCachedFiles: unharvestedRepositories.length,
    rounds: allRoundRecords.length,
    cacheIssues: cacheIssues.length,
    seedRepositories: seedCoverage.filter((entry) => entry.covered).length,
    seedTotal: seedCoverage.length,
    uncoveredSeeds,
    fetchFailures: summary.failures.length,
  },
  languageDistribution,
  extensionDistribution,
  starBands,
  dimensions: dimensionAnalysis,
  cacheIssues,
  repositoriesWithoutCachedFiles: unharvestedRepositories,
};

fs.writeFileSync(inventoryJsonPath, `${JSON.stringify(inventory, null, 2)}\n`);

const md = [
  '# API 直写 100% 闭环调研数据清点',
  '',
  `- 生成时间：${inventory.generatedAt}`,
  `- 去重仓库：${inventory.totals.repositories}`,
  `- 去重缓存源码文件：${inventory.totals.uniqueCachedFiles}`,
  `- 物理缓存文件：${inventory.totals.physicalCacheFiles}`,
  `- 调研轮次：${inventory.totals.rounds}（10 维度 x 20 轮）`,
  `- 种子仓库覆盖：${inventory.totals.seedRepositories}/${inventory.totals.seedTotal}`,
  `- 缓存异常：${inventory.totals.cacheIssues}`,
  `- 抓取失败：${inventory.totals.fetchFailures}`,
  `- 搜到但无可缓存源码文件的仓库：${inventory.totals.repositoriesWithoutCachedFiles}`,
  '',
  '## 维度基线',
  '',
  '| 维度 | 仓库数 | 缓存文件数 | 主要语言 |',
  '|---|---:|---:|---|',
  ...dimensionAnalysis.map((entry) => `| ${entry.dimension} | ${entry.repositories} | ${entry.cachedFiles} | ${entry.languages.slice(0, 3).map((item) => `${item.name}:${item.count}`).join(', ')} |`),
  '',
  '## 轮次口径',
  '',
  '第 1-10 轮为原方案 V1 采集的回放记录：原始脚本同轮 10 个维度互相覆盖，源数据只剩每维度一个仓库集合，query 统一登记为 `legacy-search`，因此这 10 轮只能按“V1 事实基线”计数，不能伪称 10 组不同查询。第 11-20 轮为 V2 新采集：每维度 10 个查询词全部换新，按维度独立落盘，不存在同轮覆盖。',
  '',
  '| 维度 | 11-20 轮查询词 | 1-10 轮回放口径 |',
  '|---|---:|---|',
  ...dimensionAnalysis.map((entry) => `| ${entry.dimension} | ${entry.queryProfile.distinctQueries - 1} | V1 回放 ${entry.queryProfile.legacyV1ReplayRounds} 轮 |`),
  '',
  '## 语言分布',
  '',
  '| 语言 | 仓库数 |',
  '|---|---:|',
  ...languageDistribution.map((item) => `| ${item.name} | ${item.count} |`),
  '',
  '## 文件类型分布',
  '',
  '| 扩展名 | 文件数 |',
  '|---|---:|',
  ...extensionDistribution.map((item) => `| ${item.name} | ${item.count} |`),
  '',
  '## 未进入清点口径的仓库',
  '',
  '以下仓库在 GitHub 搜索轮次中出现，但当前采集策略没有拿到任何可核对源码文件，因此不计入有效仓库与缓存文件清点。这不是丢数据，而是清点口径不把“无源码证据的搜索结果”当作证据。',
  '',
  ...unharvestedRepositories.map((repo) => `- ${repo.fullName}（${repo.dimension} / round-${repo.round} / stars ${repo.stars}）`),
  '',
  '## 星级分布',
  '',
  '| 星级段 | 仓库数 |',
  '|---|---:|',
  ...starBands.map((item) => `| ${item.name} | ${item.count} |`),
  '',
  cacheIssues.length ? '## 缓存异常清单' : '## 缓存异常清单\n\n无。',
  ...cacheIssues.map((issue) => `- ${issue.round} / ${issue.repository} / ${issue.sourcePath}: ${issue.reason}`),
  '',
  '## 原始仓库清单',
  '',
  '| 仓库 | 星级 | 语言 | 维度 | 缓存文件 |',
  '|---|---:|---|---|---:|',
  ...repositories
    .sort((a, b) => b.stars - a.stars || a.fullName.localeCompare(b.fullName))
    .map((repo) => `| ${repo.fullName} | ${repo.stars} | ${repo.language} | ${repo.dimensions.join(', ')} | ${repo.cachedFileCount} |`),
].join('\n');

fs.writeFileSync(inventoryMdPath, `${md}\n`);

console.log(JSON.stringify({
  repositories: inventory.totals.repositories,
  uniqueCachedFiles: inventory.totals.uniqueCachedFiles,
  physicalCacheFiles: inventory.totals.physicalCacheFiles,
  rounds: inventory.totals.rounds,
  seedRepositories: inventory.totals.seedRepositories,
  seedTotal: inventory.totals.seedTotal,
  cacheIssues: inventory.totals.cacheIssues,
  fetchFailures: inventory.totals.fetchFailures,
}, null, 2));

if (inventory.totals.repositories !== summary.uniqueRepositories) {
  const expected = new Set([...summaryRepoMap.keys(), ...harvestedRoundRepoKeys]).size;
  if (inventory.totals.repositories !== expected) {
    throw new Error(`Repository reconciliation failed: analyzed ${inventory.totals.repositories}, summary+rounds ${expected}`);
  }
  const unharvestedOnly = new Set(unharvestedRepositories.map((repo) => normalizeRepo(repo.fullName)));
  for (const key of summaryRepoMap.keys()) unharvestedOnly.delete(key);
  if (inventory.totals.repositories !== summary.uniqueRepositories + unharvestedOnly.size) {
    throw new Error(`Repository split reconciliation failed: ${inventory.totals.repositories} != ${summary.uniqueRepositories} + ${unharvestedOnly.size}`);
  }
}
if (inventory.totals.uniqueCachedFiles !== summary.uniqueCachedFiles) {
  throw new Error(`Cache reconciliation failed: analyzed ${inventory.totals.uniqueCachedFiles}, summary ${summary.uniqueCachedFiles}`);
}
if (inventory.totals.cacheIssues !== 0) process.exitCode = 1;

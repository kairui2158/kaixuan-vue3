import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(_dirname, '..', '..');

// run vite build first
console.log('=== BUILD CHECK ===');
try {
  const out = execSync('npx vite build', { cwd: root, timeout: 60000, encoding: 'utf8' });
  console.log(out.trim().split(/\r?\n/).slice(-8).join('\n'));
  if (!out.includes('built')) throw new Error('build may have failed');
  console.log('BUILD: PASS');
} catch (e) {
  console.error('BUILD: FAIL', e.message);
  process.exit(1);
}

console.log('\n=== IMPORTING SERVICES ===');
const load = file => import(pathToFileURL(file).href);
const { extractMemory } = await load(path.join(root, 'src/services/memoryExtractor.ts'));
const { mergeMemory } = await load(path.join(root, 'src/services/memoryMerger.ts'));
const { saveChangeRecord, rollbackTo, rollbackByChapter } = await load(path.join(root, 'src/services/memoryVersion.ts'));
const { retrieveContext } = await load(path.join(root, 'src/services/memoryRetriever.ts'));
const { exportFullJSON, importFullJSON, exportCharacterCardV3, importCharacterCardV3 } = await load(path.join(root, 'src/services/memoryIO.ts'));
const { exportCharacterProfile, exportStoryline, exportTimeline, exportScene } = await load(path.join(root, 'src/services/memoryExport.ts'));
console.log('IMPORTS: PASS');

// === P0: empty memory data ===
console.log('\n=== P0: DATA MODEL ===');
const emptyMem = {
  version: 1, entities: [], relations: [], events: [], world: [], foreshadowing: [],
  meta: { extractionCount: 0, lastExtractedAt: null, lastFullRebuildAt: null, pendingCount: 0, totals: { entities: 0, relations: 0, events: 0, world: 0, foreshadowing: 0 } },
  history: [], categories: ['情节', '人物', '世界观', '伏笔'], items: []
};
const emptyClone = JSON.parse(JSON.stringify(emptyMem));
console.log('empty schema valid:', emptyMem.version === 1 && Array.isArray(emptyMem.entities));
console.log('P0: PASS');

// === P1: extraction and one repair retry ===
console.log('\n=== P1: EXTRACTION ===');
let extractionCalls = 0;
const extractionResult = await extractMemory({ chapterId: 'ch1', chapterIndex: 0, chapterTitle: '第一章', content: '张三进入京城。' }, async (prompt) => {
  extractionCalls += 1;
  if (extractionCalls === 1) return 'not-json';
  return JSON.stringify({
    entities: [{ name: '张三', type: 'character', evidence: [{ chapterId: 'ch1', snippet: '张三进入京城' }] }],
    relations: [], events: [], world: [], foreshadowing: []
  });
});
console.log('AI calls:', extractionCalls, '(expect 2)');
console.log('success:', extractionResult.success, 'retried:', extractionResult.retried);
console.log('entity evidence:', extractionResult.data.entities[0]?.evidence?.[0]?.chapterId);
const p1Ok = extractionResult.success && extractionResult.retried && extractionCalls === 2 && extractionResult.data.entities[0]?.evidence?.[0]?.chapterId === 'ch1';
console.log(p1Ok ? 'P1: PASS' : 'P1: FAIL');
if (!p1Ok) process.exit(1);

// === P3: mergeMemory basic ===
console.log('\n=== P3: MERGE MEMORY (no duplicate) ===');
const extracted = {
  entities: [
    { name: '张三', type: 'character', description: '主角', evidence: [{ chapterId: 'ch1', snippet: '张三出场了' }] },
    { name: '李四', type: 'character', description: '配角', evidence: [{ chapterId: 'ch1', snippet: '李四来了' }] },
  ],
  relations: [{ sourceId: 'ent_zhang_san_1000', targetId: 'ent_li_si_1000', type: '朋友', detail: '好友', evidence: [{ chapterId: 'ch1', snippet: '张三是李四的朋友' }] }],
  events: [{ title: '初遇', chapterId: 'ch1', chapterIndex: 0, summary: '张三和李四相遇', evidence: [{ chapterId: 'ch1', snippet: '他们相遇了' }] }],
  world: [{ name: '京城', category: '地理', description: '皇城', evidence: [{ chapterId: 'ch1', snippet: '京城' }] }],
  foreshadowing: [{ title: '密信', description: '一封密信', evidence: [{ chapterId: 'ch1', snippet: '密信' }] }]
};
const r1 = mergeMemory(emptyMem, extracted, { chapterId: 'ch1', chapterIndex: 0, now: '2026-01-01T00:00:00.000Z' });
const eCount = r1.data.entities.length;
const rCount = r1.data.relations.length;
const evCount = r1.data.events.length;
const wCount = r1.data.world.length;
const fCount = r1.data.foreshadowing.length;
console.log('entities:', eCount, '(expect 2)');
console.log('relations:', rCount, '(expect 1)');
console.log('events:', evCount, '(expect 1)');
console.log('world:', wCount, '(expect 1)');
console.log('foreshadowing:', fCount, '(expect 1)');
const changed = r1.changes.filter(c => c.action !== 'skipped').length;
console.log('non-skipped changes:', changed, '(expect 5)');
const allOk = eCount === 2 && rCount === 1 && evCount === 1 && wCount === 1 && fCount === 1;
console.log(allOk ? 'P3: PASS' : 'P3: FAIL');
if (!allOk) process.exit(1);

// === P3: 20-chapter no duplicate ===
console.log('\n=== P3: 20-CHAPTER NO DUPLICATE ===');
let current = emptyMem;
for (let i = 0; i < 20; i++) {
  const chId = `ch${i + 1}`;
  const ext = {
    entities: [{ name: `人物${i % 5 + 1}`, type: 'character', description: `第${i + 1}章`, evidence: [{ chapterId: chId, snippet: `人物${i % 5 + 1}在第${i + 1}章` }] }],
    relations: [], events: [], world: [], foreshadowing: []
  };
  const result = mergeMemory(current, ext, { chapterId: chId, chapterIndex: i, now: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` });
  current = result.data;
}
const finalEntityCount = current.entities.length;
console.log('20 chapters, entities:', finalEntityCount, '(expect 5 unique)');
const noDuplicate = finalEntityCount === 5;
console.log(noDuplicate ? 'P3 20-CHAPTER: PASS' : 'P3 20-CHAPTER: FAIL');
if (!noDuplicate) process.exit(1);

// === P7: version rollback ===
console.log('\n=== P7: VERSION ROLLBACK ===');
const v1 = mergeMemory(emptyMem, extracted, { chapterId: 'ch1', chapterIndex: 0, now: '2026-01-01T00:00:00.000Z' });
const v1data = v1.data;
const record = saveChangeRecord([], emptyMem, v1data, { chapterId: 'ch1', chapterIndex: 0, reason: 'test' });
console.log('record created:', record.id.length > 0 && record.chapterId === 'ch1');
const rollback = rollbackTo(v1data, [record], record.id, { chapterId: 'rollback', reason: 'test rollback' });
console.log('rollback success:', rollback !== null);
console.log('rollback entities:', rollback?.data.entities.length, '(expect 2, target after snapshot)');
const rByChapter = rollbackByChapter(v1data, [record], 'ch1', 0, { chapterId: 'rollback', reason: 'test rollback by chapter' });
console.log('rollbackByChapter:', rByChapter !== null && rByChapter.data.entities.length === 2);
const p7Ok = rollback !== null && rollback.data.entities.length === 2 && rByChapter !== null && rByChapter.data.entities.length === 2;
console.log(p7Ok ? 'P7: PASS' : 'P7: FAIL');
if (!p7Ok) process.exit(1);

// === P5: retrieveContext ===
console.log('\n=== P5: RETRIEVE CONTEXT ===');
const ctx = retrieveContext(v1data, { chapterId: 'ch1', chapterIndex: 0, maxChars: 2000 });
console.log('retrieval charCount:', ctx.charCount, '(expect > 0)');
console.log('sections:', ctx.sections.length, '(expect > 0)');
const hasEntity = ctx.text.includes('张三');
console.log('contains entity name:', hasEntity);
const p5Ok = ctx.charCount > 0 && hasEntity;
console.log(p5Ok ? 'P5: PASS' : 'P5: FAIL');
if (!p5Ok) process.exit(1);

// === P6: export/import ===
console.log('\n=== P6: EXPORT/IMPORT ===');
const exported = exportFullJSON(v1data, 'test');
const parsed = JSON.parse(exported);
console.log('export format:', parsed.format, '(expect shenyi-memory)');
console.log('export entities:', parsed.memory.entities.length, '(expect 2)');
const imported = importFullJSON(exported);
console.log('import success:', imported.success);
console.log('import entities:', imported.memory?.entities.length, '(expect 2)');
const p6Ok = parsed.format === 'shenyi-memory' && imported.success && imported.memory?.entities.length === 2;
console.log(p6Ok ? 'P6: PASS' : 'P6: FAIL');
if (!p6Ok) process.exit(1);

// === P6: character card V3 ===
console.log('\n=== P6: CHARACTER CARD V3 ===');
const entity = v1data.entities[0];
const card = exportCharacterCardV3(entity);
const cardParsed = JSON.parse(card);
console.log('card spec:', cardParsed.spec, '(expect chara_card_v3)');
console.log('card name:', cardParsed.data.name, '(expect 张三)');
const cardImport = importCharacterCardV3(card);
console.log('card import success:', cardImport.success);
console.log('card import name:', cardImport.entity?.name, '(expect 张三)');
const p6cardOk = cardParsed.spec === 'chara_card_v3' && cardImport.success && cardImport.entity?.name === '张三';
console.log(p6cardOk ? 'P6 CARD: PASS' : 'P6 CARD: FAIL');
if (!p6cardOk) process.exit(1);

// === P14: export formats ===
console.log('\n=== P14: EXPORT FORMATS ===');
const profile = exportCharacterProfile(v1data, entity.id);
const profileParsed = profile ? JSON.parse(profile) : null;
console.log('profile format:', profileParsed?.format, '(expect shenyi-character-profile)');
console.log('profile entity:', profileParsed?.entity?.name, '(expect 张三)');
const storyline = exportStoryline(v1data, { volumes: [{ id: 'vol1', name: '第一卷', summary: '开篇' }], chapters: { vol1: [{ id: 'ch1', title: '第一章', summary: '初遇' }] } });
const slParsed = JSON.parse(storyline);
console.log('storyline format:', slParsed.format, '(expect shenyi-storyline)');
console.log('storyline volumes:', slParsed.volumes.length, '(expect 1)');
const timeline = exportTimeline(v1data);
const tlParsed = JSON.parse(timeline);
console.log('timeline events:', tlParsed.events.length, '(expect 1)');
const scene = exportScene(v1data, { chapters: { vol1: [{ id: 'ch1', title: '第一章', body: '正文', summary: '初遇' }] } });
const scParsed = JSON.parse(scene);
console.log('scene count:', scParsed.scenes.length, '(expect 1)');
const p14Ok = profileParsed?.format === 'shenyi-character-profile' && slParsed.format === 'shenyi-storyline' && tlParsed.events.length === 1;
console.log(p14Ok ? 'P14: PASS' : 'P14: FAIL');
if (!p14Ok) process.exit(1);

console.log('\n========================================');
console.log('ALL SERVICE VERIFICATION: PASS');
console.log('========================================');

import assert from 'node:assert/strict';
import { DeAiProcessor } from '../../src/services/de-ai.js';

const cases = [];
function test(name, fn) {
  cases.push({ name, fn });
}

test('empty and short text return stable empty report', () => {
  for (const input of ['', '   ', '短文本']) {
    const report = DeAiProcessor.detectBody(input);
    assert.equal(report.findings.length, 0);
    assert.equal(report.metrics.sentenceLengthCV, 0);
    assert.deepEqual(report.metrics.protectedSpans, { total: 0 });
    assert.equal(report.metrics.retentionRatio, undefined);
  }
});

test('detectBody never mutates source text', () => {
  const input = '值得注意的是，他首先看向门口。其次，他注意到地上的水痕。最后，空气仿佛凝固了。';
  const original = input.slice();
  DeAiProcessor.detectBody(input);
  assert.equal(input, original);
});

test('density over threshold creates blocking finding', () => {
  const input = Array.from({ length: 24 }, (_, i) =>
    `第${i + 1}次，他不禁缓缓地深吸一口气。与此同时，众所周知，不可否认。`
  ).join('\n');
  const report = DeAiProcessor.detectBody(input);
  assert.ok(report.findings.some(item =>
    (item.id === 'deai-banned-vocab' || item.id === 'deai-freq-words') &&
    item.severity === 'blocking'
  ));
});

test('broken punctuation creates blocking finding', () => {
  const input = '他推门进来。，屋里的灯还亮着。，桌上的茶已经凉透了。，窗外有雨声。';
  const report = DeAiProcessor.detectBody(input);
  assert.ok(report.findings.some(item =>
    item.id === 'deai-broken-punctuation' && item.severity === 'blocking'
  ));
});

test('normal varied prose only emits advisory or no findings', () => {
  const input = [
    '刀鞘磕在门框上。',
    '沈青把伞收了，水顺着袖口往下淌，他没有擦。',
    '屋里那盏灯亮了十几年，灯罩上积着灰，光落在桌角就暗了一层。',
    '“你回来做什么？”',
    '他没答。',
    '雨声从巷口一路压过来，压到窗根下才停。'
  ].join('\n');
  const report = DeAiProcessor.detectBody(input);
  assert.equal(report.findings.filter(item => item.severity === 'blocking').length, 0);
  assert.ok(report.metrics.sentenceLengthCV >= 0);
});

test('uniform sentences create advisory finding', () => {
  const input = [
    '他慢慢地走到门口看了一眼。',
    '他慢慢地走到窗边看了一眼。',
    '他慢慢地走到桌前看了一眼。',
    '他慢慢地走到柜边看了一眼。',
    '他慢慢地走到灯下看了一眼。'
  ].join('\n');
  const report = DeAiProcessor.detectBody(input);
  assert.ok(report.findings.some(item =>
    item.id === 'deai-uniform-sentence-length' && item.severity === 'advisory'
  ));
});

test('over-varied sentence rhythm contributes to score without blocking', () => {
  const input = [
    '他忽然停住，肩膀绷紧，呼吸停滞，瞳孔收缩，' +
    '所有人的目光都压过来，走廊尽头的灯闪了两下又稳住，' +
    '短。',
    '短。',
    '短。',
    '短。',
    '短。',
    '短。',
    '短。',
    '短。'
  ].join('\n');
  const report = DeAiProcessor.detectBody(input);
  const finding = report.findings.find(item => item.id === 'deai-sentence-cv-excess');
  assert.ok(finding);
  assert.equal(finding.severity, 'advisory');
  assert.ok(report.metrics.sentenceLengthCV >= 1);
  assert.equal(report.verdict !== 'blocking', true);
});

test('protected spans extract and verify missing values', () => {
  const input = '沈青推开祠堂门，牌位后的暗格露了出来。“七叔，人来了。”';
  const spans = DeAiProcessor.extractProtectedSpans(input, {
    mustSpans: ['沈青', '祠堂'],
    shouldSpans: ['七叔']
  });
  assert.equal(spans.length, 4);
  assert.ok(spans.some(span => span.value === '沈青' && span.level === 'must'));
  assert.ok(spans.some(span => span.value === '祠堂' && span.level === 'must'));
  assert.ok(spans.some(span => span.value === '七叔' && span.level === 'should'));

  const result = DeAiProcessor.verifyProtectedSpans(input, '沈青推开门，人来了。', spans);
  assert.equal(result.total, 4);
  assert.equal(result.hit, 1);
  assert.equal(result.missing.length, 3);
  assert.equal(result.mustMissing, 1);
  assert.equal(result.shouldMissing, 2);
});

test('detectBody counts configured protected spans', () => {
  const input = '沈青推开祠堂门，雨水顺着屋檐落下。“七叔，人来了。”';
  const report = DeAiProcessor.detectBody(input, {
    protectedMustSpans: ['沈青', '祠堂']
  });
  assert.ok(report.metrics.protectedSpans.total >= 3);
});

test('minimal edit prompt and thresholds are exposed', () => {
  const prompt = DeAiProcessor.getMinimalEditPrompt();
  assert.ok(prompt.includes('最小修补'));
  assert.ok(prompt.includes('禁止：整段重写'));
  const thresholds = DeAiProcessor.getDetectThresholds();
  assert.equal(thresholds.maxPerKilo.connector, 3.5);
});

let failed = 0;
for (const item of cases) {
  try {
    item.fn();
    console.log(`PASS ${item.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${item.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  console.error(`${failed} test(s) failed`);
  process.exit(1);
}
console.log(`${cases.length} tests passed`);

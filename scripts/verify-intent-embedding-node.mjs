import assert from 'node:assert/strict';
import { embedTexts, resolveModelPath } from '../electron/ipc/intentEmbedding.js';
import fs from 'node:fs';

const resolvedModelPath = resolveModelPath();
assert.ok(
  fs.existsSync(`${resolvedModelPath}/tokenizer.json`),
  `resolved model path must contain tokenizer.json: ${resolvedModelPath}`,
);
console.log(`modelPath=${resolvedModelPath}`);

const outputs = [];

const cases = [
  { name: 'empty', input: [] },
  { name: 'mainline', input: ['生成一个完整大纲', '分析一下大纲缺失什么'] },
  { name: 'variants', input: ['开篇那个吸引点我不太满意', '第一卷钩子得重新弄一下'] },
];

for (const testCase of cases) {
  const started = Date.now();
  const output = await embedTexts(testCase.input);
  outputs.push({ name: testCase.name, count: output.vectors.length, dims: output.dims, ms: Date.now() - started });
}

assert.equal(outputs[0].count, 0);
assert.equal(outputs[1].count, 2);
assert.equal(outputs[2].count, 2);
assert.ok(outputs.slice(1).every((item) => item.dims === 512));

await assert.rejects(embedTexts([Array(10001).fill('a').join('')]));
await assert.rejects(embedTexts(Array.from({ length: 17 }, () => '生成大纲')));

console.log('===== INTENT EMBEDDING NODE VERIFICATION PASSED =====');
for (const output of outputs) {
  console.log(`${output.name}: vectors=${output.count}, dims=${output.dims}, ms=${output.ms}`);
}

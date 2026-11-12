import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const builder = join(root, 'build-inventory.ps1');
const fixture = mkdtempSync(join(tmpdir(), 'scripts-lifecycle-fixture-'));

function runBuilder(extra = []) {
  return spawnSync('pwsh.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', builder, '-Root', fixture, ...extra,
  ], { encoding: 'utf8', timeout: 30000 });
}

function writeRootFixture() {
  mkdirSync(join(fixture, 'scripts'), { recursive: true });
  mkdirSync(join(fixture, '_audit', 'scripts-lifecycle'), { recursive: true });
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({ scripts: { 'fixture-entry': 'node scripts/silent.mjs' } }));
  writeFileSync(join(fixture, 'scripts', 'silent.mjs'), "async function f(){ return await readFile('x').catch(() => ''); }");
  writeFileSync(join(fixture, 'scripts', 'commented.mjs'), '// destructive example: taskkill /IM node.exe');
  writeFileSync(join(fixture, 'scripts', 'ok.mjs'), "const t = setTimeout(() => {}, 1000); // taskkill mention in comment");
  writeFileSync(join(fixture, 'scripts', 'dup1.mjs'), "console.log('dup');");
  writeFileSync(join(fixture, 'scripts', 'dup2.mjs'), "console.log('dup');");
}

function removeFixture() {
  spawnSync('pwsh.exe', ['-NoProfile', '-Command', `Remove-Item -LiteralPath '${fixture}' -Recurse -Force`], { timeout: 15000 });
}

try {
  writeRootFixture();

  const passed = runBuilder(['-SelfTest']);
  assert.equal(passed.status, 0, `builder self-test failed:\n${passed.stdout}\n${passed.stderr}`);
  assert.match(passed.stdout, /PHASE canary: negative-path check/);
  assert.match(passed.stdout, /=== P0 INVENTORY COMPLETE ===/);

  const runDate = passed.stdout.match(/runDate=(\d{4}-\d{2}-\d{2})/)?.[1];
  assert.ok(runDate, 'builder runDate missing');
  const csvPath = join(fixture, '_audit', 'scripts-lifecycle', `INVENTORY_${runDate}.csv`);
  assert.ok(existsSync(csvPath), 'fixture csv missing');
  const csv = readFileSync(csvPath, 'utf8');
  assert.ok(csv.includes('"scripts\\silent.mjs","'), 'silent fixture row missing');
  assert.ok(csv.includes('catch-silent'), 'catch-silent flag missing');
  assert.ok(!csv.includes('"scripts\\commented.mjs",.*destructive'), 'comment-only destructive falsely flagged');
  assert.ok(!/commented\.mjs,[^,]*,.*destructive/.test(csv), 'comment-only destructive falsely flagged');

  console.log('NEGATIVE-PATH-HARNESS: PASS');
  console.log(`fixture=${fixture}`);
} finally {
  removeFixture();
}

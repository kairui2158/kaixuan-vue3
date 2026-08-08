var DeAi = require('../js/de-ai.js');
var processor = DeAi.DeAiProcessor;
var pass=0, fail=0;
function test(name, cond) {
  if (cond) { pass++; console.log('[PASS] ' + name); }
  else { fail++; console.log('[FAIL] ' + name); }
}
var r1 = processor.process('缓慢地走过来，目的地到了。这是一段足够长的测试文本。', null);
test('rule1: de->di replace - text is string', typeof r1.text === 'string');
test('rule1: de->di replace - slow-de replaced', r1.text.includes('缓慢的'));
test('rule1: de->di exception - destination preserved', r1.text.includes('目的地'));
var r2 = processor.process('苹果、香蕉、橘子和西瓜都是水果，味道各不相同。', null);
test('rule2: dunhao->comma - dunhao removed', r2.text.indexOf(String.fromCharCode(0x3001)) === -1);
test('rule2: dunhao->comma - comma present', r2.text.indexOf(String.fromCharCode(0xFF0C)) !== -1);
var r3 = processor.process('因此我去了商店，另外还有问题需要解决。', null);
test('rule4: connector so-replace', r3.text.includes('所以'));
test('rule4: connector also-replace', r3.text.includes('还有'));
test('rule5: process returns object', typeof r3 === 'object' && r3 !== null);
test('rule5: process has text field', typeof r3.text === 'string');
test('rule5: process has detections field', Array.isArray(r3.detections));
var r4 = processor.process('他猛地从地上爬起来，扫了一眼周围，天地间一片寂静。这是一段测试文本。', null);
test('new: exception - from ground', r4.text.includes('地上'));
test('new: exception - heaven-earth', r4.text.includes('天地'));
test('new: exception - suddenly', r4.text.includes('猛地'));
var r5 = processor.process('惊天动地的声响传来，他脚踏实地的站着。这是一段测试文本。', null);
test('new: exception - idiom1', r5.text.includes('惊天动地'));
test('new: exception - idiom2', r5.text.includes('脚踏实地'));
var r6 = processor.process('他在一席之地中，找到了立足之地。这是一段测试文本。', null);
test('new: exception - idiom3', r6.text.includes('一席之地'));
test('new: exception - idiom4', r6.text.includes('立足之地'));
var r7 = processor.process('掷地有声的承诺，地动山摇的震撼。这是一段测试文本。', null);
test('new: exception - zhi-di-you-sheng', r7.text.includes('掷地有声'));
test('new: exception - di-dong-shan-yao', r7.text.includes('地动山摇'));
var r8 = processor.process('绝地反击的勇气，遍地开花的景象。这是一段测试文本。', null);
test('new: exception - jue-di-fan-ji', r8.text.includes('绝地反击'));
test('new: exception - bian-di-kai-hua', r8.text.includes('遍地开花'));
var r9 = processor.process('昏天黑地的工作，拔地而起的高楼。这是一段测试文本。', null);
test('new: exception - hun-tian-hei-di', r9.text.includes('昏天黑地'));
test('new: exception - ba-di-er-qi', r9.text.includes('拔地而起'));
console.log('========================================');
console.log('Hard Rules Unit Test Results (v3 expanded)');
console.log('========================================');
console.log('Total: ' + (pass+fail) + ' | PASS: ' + pass + ' | FAIL: ' + fail);
console.log('========================================');
if (fail > 0) process.exit(1);

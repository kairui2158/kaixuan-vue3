# 去AI硬规则验证方法论经验

## 验证方法（可复用于其他模块）

### 核心原则
静态读代码只能发现"看起来有问题"的结论，无法确认问题在实际运行中是否真的触发。必须用真实数据跑函数调用，拿到返回值和执行统计作为证据。

### 验证步骤模板

1. **加载模块**：用Node.js的require动态加载被测JS文件，确认导出结构
   - 注意：导出可能不是构造函数而是单例对象（如DeAiProcessor是object不是class）
   - 先console.log(Object.keys(module))和typeof确认类型

2. **枚举方法**：用Object.getOwnPropertyNames获取prototype或对象上的所有方法名
   - 确认要测试的函数确实存在且可调用

3. **准备测试数据**：针对每条结论构造能触发/不触发的测试用例
   - 正向用例：应该触发的输入
   - 反向用例：不应该触发的输入
   - 边界用例：特殊字符、空字符串、超长文本

4. **执行函数拿返回值**：直接调用方法，打印输出文本、改动计数、统计信息
   - 不要只看changed字段，要看实际输出文本对比
   - process()函数要看stats统计字段，确认哪些规则触发了

5. **源码定位**：对函数toString()或fs.readFileSync读源码，定位正则/逻辑分支
   - 正则BUG是最常见的问题类型：字符类[]误用为分组()
   - 检查正则是否匹配预期：用test字符串验证match结果

6. **交叉验证**：一个函数的BUG可能在另一个函数里也有同类问题
   - 发现validateEventCores的正则BUG后，检查validatePerspective是否有相同模式

### 常见陷阱

#### 陷阱1：正则字符类vs分组
```javascript
// BUG：字符类，匹配段/d/+三个字符中的任意一个
/[段d+]/g
// 正确：分组，匹配段+数字
/段\d+/g

// BUG：字符类，匹配括号内每个单字符
/[(换主语|视点转移)]/g
// 正确：分组，匹配完整词
/(换主语|视点转移)/g
```
检测方法：用测试字符串跑两个正则，对比match结果。BUG正则会返回单字符数组，正确正则返回完整词数组。

#### 陷阱2：正则前导条件过严
```javascript
// BUG：要求"因为"前必须是逗号，但句首"因为"前面是句号
new RegExp(comma + '因为...' + comma + '所以...')
// 正确：匹配句首或逗号开头
/(?:^|。|，)因为([^，。]+)，所以([^。]+)/g
```
检测方法：构造句首/句中/句尾三种位置的测试用例，看正则是否都能匹配。

#### 陷阱3：规则触发不均衡
process()可能只有1-2条规则在实际文本上触发，其他19条不触发。只看代码会以为20条规则都在工作，实际效果主要来自合并短句和去掉句首代词。
检测方法：跑长文本（5000+字）通过process()，检查stats.details数组，看哪些规则出现在统计中。

#### 陷阱4：PowerShell写中文文件失败
node -e里嵌入含中文的模板字符串会因PowerShell转义问题报SyntaxError。
解决：用apply_patch工具直接写文件，或用Node.js的fs.writeFileSync写独立.js文件再执行。

### 验证报告格式
每条结论的验证报告应包含：
1. 验证结果：PASS/FAIL/NEED_REVIEW
2. 动态证据：函数调用的实际输入输出
3. 根因分析：为什么有这个问题（定位到具体代码行或正则）
4. 结论修正：如果验证发现原结论描述不准确，明确修正
5. 额外发现：验证过程中发现的新问题

## 11个待修复问题清单

| # | 问题 | 严重度 | 文件位置 |
|---|------|--------|----------|
| 1 | 硬规则太多（20条 vs 降得快2-3条） | 中 | de-ai.js getHardRules() |
| 2 | causalInversion正则前导逗号过严→规则失效 | 高 | de-ai.js causalInversion() |
| 3 | 切分无重叠窗口→上下文断裂 | 高 | de-ai.js process() |
| 4 | 温度不分级（只按intensity不按阶段） | 中 | renderer_v2.js _getDeAiTemperature() |
| 5 | 风格样本全量注入（1813字每次全量追加） | 中 | renderer_v2.js deAiProcess() |
| 6 | validateEventCores正则BUG /[段d+]/g | 高 | renderer_v2.js validateEventCores() |
| 7 | validatePerspective正则BUG /[(...)]/g | 高 | renderer_v2.js validatePerspective() |
| 8 | post硬规则破坏SKILL输出 | 高 | renderer_v2.js deAiProcess() post分支 |
| 9 | 三种模式并存无UI说明 | 低 | renderer_v2.js deAiProcess() |
| 10 | process()规则触发不均衡（19/20条不触发） | 中 | de-ai.js process() |
| 11 | causalInversion正则失效（同问题2的根因） | 高 | de-ai.js causalInversion() |

注：问题2和问题11是同一规则的两个角度，实际独立问题为10个。

## 本次验证使用的命令记录

```bash
# 1. 确认模块导出结构
node -e "const m = require('./js/de-ai.js'); console.log(typeof m.DeAiProcessor);"

# 2. 枚举方法
node -e "const dp = require('./js/de-ai.js').DeAiProcessor; console.log(Object.keys(dp));"

# 3. 跑硬规则列表
node -e "const dp = require('./js/de-ai.js').DeAiProcessor; console.log(dp.getHardRules());"

# 4. 跑causalInversion测试
node -e "const dp = require('./js/de-ai.js').DeAiProcessor; console.log(dp.causalInversion('因为下雨，所以路滑。'));"

# 5. 跑process完整执行
node -e "const dp = require('./js/de-ai.js').DeAiProcessor; console.log(dp.process('测试文本...', {intensity:'medium'}));"

# 6. 读源码定位正则
node -e "const fs=require('fs'); const src=fs.readFileSync('./js/de-ai.js','utf8'); const m=src.match(/function causalInversion[\s\S]{0,1500}/); console.log(m[0]);"

# 7. 验证正则BUG
node -e "console.log('段1段2'.match(/[段d+]/g)); console.log('段1段2'.match(/段\d+/g));"

# 8. 检查renderer_v2温度/模式/注入
node -e "const fs=require('fs'); const r=fs.readFileSync('./renderer_v2.js','utf8'); console.log(r.match(/_getDeAiTemperature[\s\S]{0,800}/));"
```

# 伪SKILL到真SKILL升级总结报告 v2.7.48

## 升级日期
2026-08-06

## 升级目标
将应用从"伪SKILL（prompt投递+for循环串行调用）"升级为"真SKILL（代码控制流+验证+重试）"，使SKILL执行从依赖模型自觉遵守规则变为代码强制执行。

## 改动清单

### 1. 新增 js/skill-engine.js（15062字节）
通用SKILL执行引擎，提供三种执行模式：
- **chain**: 链式顺序执行（默认，向后兼容）
- **splitMerge**: 切分+并行+拼接
- **multiStep**: 多步代码控制流（事件核提取→偏转视角→重组→验证）

核心功能：
- `_splitText(text, targetSize)`: 按语义断点切分文本，支持溢出浮动（0.7x-1.3x），自动合并尾段过短片段，带重叠上下文
- `_parallelMap(items, fn, concurrency)`: 并行执行器，支持并发控制和进度回调
- `_extractFirstSubject(txt)`: 首句主语提取，用于multiStep模式的主语一致性检测
- `getAutoValidators(type, opts)`: 根据生成层级自动返回验证规则

修复记录：修复了 `_splitText` 中 `splitSize` 未定义的 bug（改为 `targetSize`）

### 2. 新增 js/skill-validators.js（7308字节）
验证器工厂，包含9种验证器：

| 验证器 | 用途 |
|--------|------|
| json_array | 验证输出是否为合法JSON数组 |
| exact_count | 验证JSON数组长度是否精确匹配预期值 |
| field_exists | 验证JSON对象是否包含必需字段 |
| min_length | 验证输出最小长度 |
| first_subject_different | 验证首句主语是否与原文不同 |
| event_core_count | 验证事件核数量是否足够 |
| perspective_rotation | 验证偏转方法是否轮换（不连续3次相同） |
| cross_model_check | 跨模型语义验证（使用verify供应商） |
| zhuque_check | 朱雀AI检测验证 |

### 3. 改造 js/provider-manager.js
新增验证供应商支持：
- `getVerifyProviders()`: 获取所有标记为verify用途的供应商
- `getVerifyProvider()`: 获取第一个验证供应商
- `getDetectProvider()`: 获取检测供应商（如朱雀）
- `setProviderPurpose(providerId, purpose)`: 设置供应商用途（generate/verify/detect）

供应商新增 `purpose` 字段，默认为 generate。

### 4. 改造 renderer_v2.js（核心改动）
**删除**：旧的 `for` 循环伪SKILL执行器（6655字节），包含：
- `_executeChain` 内部函数
- `chainMessages` 消息构建
- `chainResult` 手动API调用
- `_chainReports` 手动报告收集
- 手动文本过滤逻辑

**替换为**：调用 `SkillExecutionEngine.chain()` 的简洁代码（约40行），功能：
- 从 `opts.skillIds` 获取SKILL列表
- 调用 `SkillExecutionEngine.getAutoValidators(type, {expectedCount})` 获取自动验证器
- 调用 `ProviderManager.getVerifyProvider()` 获取验证供应商
- 调用 `SkillExecutionEngine.chain(prompt, skills, engineOpts)` 执行
- 支持文本过滤（向后兼容）
- 错误处理和toast提示

### 5. 改造 renderer.html
在 `js/de-ai.js` 之前引入两个新脚本：
```html
<script src="js/skill-engine.js"></script>
<script src="js/skill-validators.js"></script>
```

### 6. 改造 js/pipeline-manager.js
在章节生成的 `batchOpts` 中传入 `expectedCount`，使引擎能自动为章节层挂载 `exact_count` 验证器。

## 向后兼容性
- 现有SKILL不需要修改任何一个字
- 不填新字段时默认走 chain 模式（与旧逻辑行为一致）
- 生成流水线用户无感（不暴露配置）
- 去AI味保持用户自选模式

## 验证结果

### 语法验证（node --check）
| 文件 | 结果 |
|------|------|
| renderer_v2.js | PASS |
| js/skill-engine.js | PASS |
| js/skill-validators.js | PASS |
| js/provider-manager.js | PASS |
| js/pipeline-manager.js | PASS |

### 静态集成验证
| 检查项 | 结果 |
|--------|------|
| SkillExecutionEngine.chain 调用存在 | PASS |
| getAutoValidators 调用存在 | PASS |
| getVerifyProvider 调用存在 | PASS |
| _lastChainReports 赋值存在 | PASS |
| opts.expectedCount 传递存在 | PASS |
| 旧 _executeChain 已删除 | PASS |
| 旧 chainMessages 已删除 | PASS |
| 旧 var _chainReports 已删除 | PASS |

### CDP行为验证（端口9223）
| 检查项 | 结果 |
|--------|------|
| SkillExecutionEngine 已加载 | PASS (type: object) |
| chain() 方法存在 | PASS (type: function) |
| splitMerge() 方法存在 | PASS (type: function) |
| multiStep() 方法存在 | PASS (type: function) |
| getAutoValidators() 方法存在 | PASS (type: function) |
| SkillValidators 已加载 | PASS (type: object) |
| json_array 验证器存在 | PASS (type: function) |
| exact_count 验证器存在 | PASS (type: function) |
| getVerifyProvider 存在 | PASS (type: function) |
| getDetectProvider 存在 | PASS (type: function) |
| chapters层验证器正确 | PASS (返回json_array+field_exists+exact_count) |
| settings层验证器正确 | PASS (返回json_array+field_exists) |
| body层验证器正确 | PASS (返回min_length) |

## 自动验证器映射表

| 生成层级 | 自动验证器 |
|----------|------------|
| settings | json_array + field_exists(name) |
| volumes | json_array + min_length(50) |
| chapters | json_array + field_exists(title,plot) + exact_count(当expectedCount有值时) |
| body | min_length(500) |

## 技术架构变化

### 改造前（伪SKILL）
```
apiGenerate() -> for循环 -> 每步: 构建prompt + 手动调API + 手动收集结果
```
问题：模型可以忽略规则、跳步、不做验证

### 改造后（真SKILL）
```
apiGenerate() -> SkillExecutionEngine.chain() -> 每步: 引擎控制调用 + 自动验证 + 失败重试
```
优势：代码控制每步输入输出，验证器自动触发，失败自动重试一次

## 版本号
2.7.47 -> 2.7.48

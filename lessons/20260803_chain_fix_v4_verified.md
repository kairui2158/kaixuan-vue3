# 20260803 链式SKILL断裂 - 最终修复 V4 (已端到端验证)

## 真正的根因（多个因素叠加）
1. s3Skills数组中存在null值，链式执行静默跳过
2. max_tokens=0导致API用默认4096，输出被截断
3. 链式无容错，某步失败中断整个链
4. 重试999次导致失败步骤卡住太久看起来像"中断"

## 修复内容

### 1. null值清理（pipeline-manager.js + renderer_v2.js）
- _plData()加载时自动过滤s1-s5Skills数组中的null/undefined
- 构建opts时.filter(function(id) { return id; })
- 链式执行前过滤_skillIds
- 被跳过的步骤记录到_chainReports（不再静默跳过）

### 2. 自适应max_tokens（renderer_v2.js _aiRequest）
- 发送max_tokens=用户设置值(保底128000)
- API返回400时自动减半重试
- 减到1024以下才放弃
- 适配DeepSeek(8192)和OpenAI(128000)

### 3. 链式容错（renderer_v2.js）
- for循环内try-catch包裹_aiRequest
- 某步失败：catch住、push带error的报告、continue到下一步
- 不再因为一步失败就throw中断整个链

### 4. 合理重试次数
- maxRetries从999改为8（足够处理临时故障，不会卡太久）
- retryDelays: 20个递增间隔
- timeoutMs: 600000（10分钟每次请求）
- 客户端错误(401/403/404)不重试

## 端到端验证结果（Playwright CDP真实API调用）
- SKILL 1: 80秒完成，输出8826字符
- SKILL 2: 160秒完成，输出8244字符
- SKILL 3: 350秒完成，输出23218字符
- SKILL 4: 290秒完成，输出11283字符
- 总计约15分钟，4步全部成功，无错误
- Chain complete, final output length: 11283
- 成功创建3个卷：云岭归途、天府都陷落、铁壁与回响

## 版本: 2.7.35

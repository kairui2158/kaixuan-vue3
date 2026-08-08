# 20260803 链式SKILL断裂根因 - 最终修复 V3

## 真正的根因
s3Skills 数组中存在 null 值！
- 数组有5个元素，第2个是 null
- 链式执行遍历时 SkillManager.get(null) 返回 null
- if (!chainSk) continue 跳过该步，但不 push 报告
- 用户看到的"只加载了SKILL1和SKILL2"实际是跳过null后的结果

## 修复内容

### 1. 数据清理（pipeline-manager.js _plData）
- _plData() 加载时自动过滤 s1-s5Skills 数组中的 null/undefined
- 每次加载项目数据时执行清理

### 2. 构建opts时过滤（pipeline-manager.js）
- 所有 skillIds: pl.s3Skills || [] 改为 filter(function(id) { return id; })
- 覆盖 s1-s5 所有层级

### 3. 链式执行前过滤（renderer_v2.js）
- _skillIds = opts.skillIds.filter(function(id) { return id; })
- 双重保险

### 4. 自适应 max_tokens（renderer_v2.js _aiRequest）
- 发送 max_tokens=用户设置值(保底128000)
- 如果 API 返回 400，自动减半重试
- 减到 1024 以下还是 400 才放弃
- 适配 DeepSeek(8192) 和 OpenAI(128000) 等不同限制

### 5. 链式容错（之前已修复）
- 某步失败不中断整个链，保留上一步输出继续

### 6. 客户端错误不重试
- 401/403/404 直接抛出，不进入重试循环
- 400 在 try 块内自适应减半重试

## 验证结果（Playwright CDP）
- rawCount: 4 (null已自动清理)
- 4个SKILL全部有效，有template
- hasNullFilter: true
- hasAdaptiveMaxTokens: true
- hasHalving: true
- hasChainMode: true
- hasStepErr: true
- hasContinueInCatch: true

## 版本: 2.7.34

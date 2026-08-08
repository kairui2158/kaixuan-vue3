# 多 Skill 联动机制技术回复

> 本文档回复第三方关于"应用多 Skill 联动是链式顺序执行还是同时注入"的技术询问。

---

## 一、先说结论

我们的应用支持两种模式，**根据用户绑定的 Skill 数量自动切换**：

| 绑定数量 | 执行模式 | API 调用次数 | 说明 |
|----------|----------|-------------|------|
| 1 个 Skill | 追加注入 | 1 次 | Skill 的模板追加到 prompt 里，一次性发给 API |
| 2 个及以上 | **链式顺序执行** | **每个 Skill 1 次** | 前一个 Skill 的输出，作为后一个 Skill 的输入 |

**核心回答**：当用户在流水线某层绑定了多个 Skill（比如卷纲层的"卷纲生成→卷纲校验→卷纲格式化"三个 Skill），应用会**依次调用三次 API**，每次调用时，后一步的 prompt 里都**包含了上一步的完整输出文本**。

---

## 二、用大白话解释两种模式

### 模式一：单 Skill = 追加注入

打个比方：你给工人一张图纸（Skill 模板）和一块原材料（原始 prompt），工人把图纸贴在材料上，一次性加工完成。

```
[原始 prompt + Skill 模板] → 1次API调用 → 输出结果
```

代码位置：renderer_v2.js 第 929-935 行
```
prompt += "--- 技能约束 ---【Skill名称】: " + skill.template
→ 1 次 _aiRequest()
```

### 模式二：多 Skill = 链式顺序执行

打个比方：流水线上三个工人。第一个工人拿到原材料和第一份工艺单，加工出半成品；第二个工人拿到这个半成品和第二份工艺单，继续加工；第三个工人拿到第二个的成品和第三份工艺单，做最终加工。

```
第1次API调用: [原始prompt + Skill1模板]          → 输出A
第2次API调用: [输出A + Skill2模板]                → 输出B
第3次API调用: [输出B + Skill3模板]                → 输出C（最终结果）
```

三个 Skill 的模板**不会**被拼在一起发出去。每个 Skill 独立调一次 API，上一步的输出完整传给下一步。

---

## 三、代码层面的证据

### 3.1 判断分支（renderer_v2.js 第 928-936 行）

```javascript
if (opts.skillIds.length === 1) {
    // 单 Skill：追加模式，1 次 API 调用
    prompt += "--- 技能约束 ---【" + skill.name + "】: " + skill.template;
} else {
    // 多 Skill：链式模式，进入 _executeChain()
}
```

### 3.2 链式执行核心（renderer_v2.js 第 952-991 行）

```javascript
var _executeChain = async function() {
  for (var si = 0; si < skillIds.length; si++) {       // 遍历每个 Skill

    if (si === 0) {
      // 第一个 Skill：原始 prompt + Skill 1 模板
      chainPrompt = originalPrompt + "--- 技能约束 ---" + skill1.template;
    } else {
      // 后续 Skill：上一步输出 + 当前 Skill 模板
      chainPrompt = "以下是上一个技能的输出结果，请根据当前技能进行处理："
                   + "--- 上一步输出 ---"
                   + 上一步的完整输出文本;
    }

    // 每步独立调用一次 API
    var chainResult = await _aiRequest({
      messages: [{role:"system",...}, {role:"user", content: chainPrompt}],
      model: agentModel,
      temperature: agentTemperature,
      // ...
    });

    // 输出传给下一步
    currentText = chainResult.text;

    // 存入链式报告（UI 可查看）
    chainReports.push({step: si+1, skillName: ..., text: currentText});
  }
  return currentText;  // 最后一步输出 = 最终结果
};
```

### 3.3 _aiRequest 是真实的 HTTP 请求（renderer_v2.js 第 1050 行）

```javascript
var resp = await fetch(this.settings.baseUrl + "/chat/completions", {
  method: "POST",
  headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
  body: JSON.stringify(reqBody)   // {model, messages, stream, max_tokens, temperature}
});
```

每次 _aiRequest 就是一次真实的 fetch 到 /chat/completions 接口。

---

## 四、逐条回答第三方三个验证问题

### 问题 1：是调用了一次 API 还是三次 API？

**三次。** 链式模式下 for 循环每迭代一次调一次 _aiRequest，三次迭代 = 三次 fetch 请求。

验证方法：打开浏览器开发者工具（Ctrl+Shift+I）→ Network 标签 → 跑一次 3-Skill 生成 → 会看到三条打到 /chat/completions 的 POST 请求。

### 问题 2：每次调用时 Skill 2 和 Skill 3 的 prompt 中是否包含前一步的输出文本？

**是。** 代码第 968-969 行：

```
"以下是上一个技能的输出结果，请根据当前技能进行处理：
【技能2/3: xxx】{Skill2模板}

--- 上一步输出 ---
{Skill1的完整输出文本}"
```

Skill 2 的 prompt = Skill 2 模板 + Skill 1 的输出
Skill 3 的 prompt = Skill 3 模板 + Skill 2 的输出

### 问题 3：是否是同时注入（三个模板拼在一起）？

**不是。** 三个 Skill 的模板不会被拼在一起。链式模式下，每个 Skill 独立调一次 API，上下文逐步传递。只有单 Skill 模式才是"追加注入"（1 次调用）。

---

## 五、用户如何自行验证

### 方法 1：看控制台日志

打开开发者工具 → Console 标签 → 跑一次 3-Skill 生成，会看到：

```
[SKILL] Chain mode: 3 skills will execute sequentially
[SKILL] Chain step 1/3: 卷纲生成
[SKILL] Chain step 1 prompt length: 5234
[SKILL] Chain step 1 output length: 8901
[SKILL] Chain step 2/3: 卷纲校验
[SKILL] Chain step 2 prompt length: 9456    ← 包含了 step 1 的输出
[SKILL] Chain step 2 output length: 7203
[SKILL] Chain step 3/3: 卷纲格式化
[SKILL] Chain step 3 prompt length: 7820    ← 包含了 step 2 的输出
[SKILL] Chain complete, final output length: 6543
```

三行日志对应三次 API 调用，prompt length 递增说明上下文在传递。

### 方法 2：看网络请求

开发者工具 → Network 标签 → 筛选 chat/completions → 跑一次 3-Skill 生成 → 会看到三条 POST 请求。

点开第二条请求的 Payload，能看到 messages 里 user 的内容包含"以下是上一个技能的输出结果"和第一步的输出文本。

### 方法 3：看 UI 链式报告

生成完成后，卷纲列表里每卷有一个"查看链式报告（3步）"的按钮，点击后可以看到每一步的 Skill 名称和输出文本，直观展示链式传递过程。

---

## 六、补充说明

### 为什么单 Skill 用追加模式？

向后兼容设计。早期版本只支持单 Skill，追加到 prompt 一次调用即可。多 Skill 功能是后来加的，走链式模式。

### Skill 之间传递的上下文是什么？

是**上一步的完整输出文本**（不是结构化数据）。这意味着如果 Skill 1 输出的是格式化文本，Skill 2 拿到的就是这段文本。这符合大多数链式 Skill 的设计——校验类 Skill 拿到生成类 Skill 的文本来做检查，格式化类 Skill 拿到校验后的文本来转 JSON。

### Agent 的参数是否注入？

是。链式执行中每一步都使用相同的 Agent 配置（模型、温度、系统提示词、maxTokens），在代码第 941-944 行保存：
```javascript
var _sysContent = sysContent;         // Agent 系统提示词
var _agentModel = agentModel;         // Agent 指定模型
var _agentTemperature = agentTemperature;  // Agent 温度
var _agentMaxTokens = agentMaxTokens;       // Agent maxTokens
```
每一步的 _aiRequest 都使用这些参数。

---

## 七、总结

| 第三方关注点 | 我们的实现 |
|-------------|-----------|
| 链式 vs 同时注入 | **链式顺序执行**（多 Skill 时） |
| API 调用次数 | 每个 Skill 1 次，N 个 Skill = N 次 |
| 上下文传递方式 | 上一步完整输出文本 → 拼入下一步 prompt |
| 验证方式 | 控制台日志 + Network 面板 + UI 链式报告 |
| Agent 参数 | 链式每步使用同一 Agent 配置 |

**一句话总结**：我们的多 Skill 联动是真正的链式管道——Skill 1 的输出喂给 Skill 2，Skill 2 的输出喂给 Skill 3，每一步都是独立 API 调用，不是把模板拼在一起一次发出去。

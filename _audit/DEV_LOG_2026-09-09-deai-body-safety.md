# 2026-09-09 正文层硬规则后处理安全化

## 问题背景

客户反馈：生成流水线正文层在硬规则后处理后，完整文章会被打碎，出现上下文连接不上、标点丢失、段落结构异常等问题。SKILL 层源码审查进一步指出，问题不止在流水线主链路，主页编辑器“去AI味”仍有一条旧规则路径，会把同一批结构重组规则再次套到正文上。

## 根因

1. 通用 `CLICHES` 替换表来自文章降AI场景，不适合小说叙述，部分规则还会吞掉后续标点。
2. `useDeAi.ts` 中四处仍调用旧 `process()`，主页编辑器正文处理没有切换到正文安全模式。
3. `processBody()` 缺少最终完整性校验门，危险规则一旦进入替换表就可能破坏正文结构。
4. 流水线正文层此前未接入设置页硬规则开关，规则启停与正文层脱节。

## 修复内容

### 1. 新增正文安全替换白名单

- `src/services/de-ai.js` 新增 `CLICHES_BODY_SAFE`。
- 只保留不破坏叙述、不吞标点、不引入议论腔的规则。
- 带标点的规则改为捕获组替换，例如 `值得注意的是([，,。、！？])` 替换为 `有意思的是$1`，标点不再丢失。
- 原 `CLICHES` 与 `process()` 保留给非正文场景，不影响原有通用降AI能力。

### 2. `processBody()` 完整性回滚门

- 新增 `countPatternMatches`、`countSentenceEndings`、`countParagraphs`、`hasBrokenPunctuation`、`passesBodyIntegrityCheck`。
- 返回前检查：段落数不变、句末标点数不变、不产生新的破碎标点、长度比例保持在 0.95-1.05。
- 任一条件不满足即回滚原文，并输出 `[DEAI V56] Body integrity protection triggered`。
- 后续即使有人往替换表里加入危险正则，也无法砸穿正文。

### 3. 统一正文处理入口

- `src/composables/useDeAi.ts` 四处 `DeAiProcessor.process()` 全部切换为 `DeAiProcessor.processBody(..., { hardRules: deAiStore.hardRules })`。
- 封闭主页编辑器“去AI味”这条第二危险路径，避免流水线生成后再被旧规则二次打碎。

### 4. 设置页规则开关联动

- `src/components/pipeline/PipelinePanel.vue` 的 `genBody()` 改为传入 `deAiStore.hardRules`。
- 设置页中硬规则的启停现在对流水线正文层真实生效。

### 5. 附带类型修复

- `src/components/chat/ChatPanel.vue` 补齐 `runHomeCoCreationSkills()` 中的 `provider/model` 变量，并在回调结果类型中补充 `durationMs`。
- 这两处是运行记录/重置对话功能的既有类型错误，本次为让 `vue-tsc` 通过做最小修复，不改变业务行为。

## 验证

- Node 直接导入测试：7 项检查全部通过（标点保留、连接词替换、段落结构不变、替换计数、完整性门未误触发、规则全关后零改动），`ALL_CHECKS_PASS`。
- `npm run type-check` 通过，`vue-tsc --noEmit` 无错误。
- `npm run test:services` 通过，14 个测试文件、149 个用例全部通过。
- `npm run build` 通过。
- 源应用 `npx electron .` 启动无渲染错误。

## 影响与边界

- 流水线正文层与主页编辑器正文处理不再打碎章节结构。
- 正文层完整性异常时优先保护原文，宁可少改也不破坏叙事。
- 设置页硬规则开关对正文层生效，用户可按规则精细控制。
- 本次验证覆盖 DeAI 处理器本体、类型检查、构建与源应用启动；未执行完整 API 生成正文的人工实操闭环，该边界保留给客户实测。

## 后续建议

- `CLICHES_BODY_SAFE` 中存在一条 `极大的→极大的` 恒等规则，功能无害，后续可清理。
- 若后续扩充正文安全规则，必须先通过完整性回滚门测试再合入。

# DEV LOG 2026-09-17 权限问句复合写入修复

> 触发证据：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20260917-200242-deep/`
> 基线：3.53.2 后源码态
> 状态：修复、单测、饱和语料评估、E2E 均完成；未封装

## 根因

1. `resolvePermissionIntent()` 的权限问句优先级过高。句子一旦命中“有没有写入权限”这类状态询问，就直接返回 `discuss`，没有继续检查句内是否包含真正的写入指令。
2. 真实用户语句是复合句：“那你试着把修改一下大纲编辑器里的内容来验证你有没有写入权限”。后半句是权限询问，前半句是明确的试探性写入指令。旧路由把整句按问句处理，工具面随即剥掉 `editor.write`，模型只能回答“没有写入权限”。
3. Trace 侧同步暴露对账缺陷：`appendToolCall()` 只写入 API call 层的 `toolCalls`，turn 层 `toolCalls` 恒为空，M23 三层对账在真实记录中不成立。

## 修复

1. `src/services/chainIntentRouter.ts`
   - 新增 `EXPLORATORY_WRITE_PATTERN`：识别“试着/尝试/测试/验证 + 修改/改/写入/编辑”以及“随意加几个字”。
   - 新增 `hasWriteDirective()`：权限问句命中后做二次判定，只有祈使标记（把/将）+ 写入动作，或试探性写入短语，才允许升级为 `explicit-write`。
   - `hasExplicitWrite` 同步纳入试探性写入分支，解决“在第一行后面随意加几个字”这类无目标词的口语。
   - 收紧规则：纯问句（如“你现在有写入权限么”）保持 `discuss`，不再因为句中出现强写入动词而误判为 `edit`。
2. 语料与回归
   - `chainIntentRouter.spec.ts` 增加复合句升级、纯问句保持 discuss 的双向断言。
   - `chainIntentCorpus.ts` 增加 3 条复合句样本。
   - `_audit/phrase-corpus-saturated.json` 升至 `2026-09-17.4`，修订 conflictPriority order 1 语义：纯问句保持 discuss，含明确写入指令则升级。
3. Turn 层对账
   - `RunTraceTurn` 增加 `toolCalls?: RunTraceToolCall[]`。
   - `appendToolCall()` 在 `call.turnId` 存在且 turn 仍为 running 时，把工具调用同步回填到 turn 层，并维护 `toolCallCount` 与 `apiCallIds`。

## 验证

1. `npx vitest run src/services/chainIntentRouter.spec.ts`：11/11 通过。
2. `npx vitest run src/stores/runTrace.spec.ts`：38/38 通过。
3. `npm run evaluate:chain-intent`：20/20 单源样本 + 249 饱和样本，classification 与 routing 均 100%。
4. `npm run verify:phrase-corpus-sync`：1642/1642 phrases，249/249 samples，0 problems。
5. `npm run type-check`：通过。
6. `npm run build:vue`：成功，`dist-renderer` 为新构建。
7. `node scripts/verify-api-direct-write-v2-e2e.mjs`：14/14 通过。覆盖主页空文档插入、替换回滚、多命中拒绝、版本冲突回滚阻断、大文本直写、流式跟随、讨论定位、讨论态权限拒绝、写入限流、大纲直写、大纲锁定、流水线无写入工具面、兼容供应商直写、trace 导出与诊断覆盖。

## 回头看

1. 生产调用点盘点：`classifyChainIntent` / `routeChainIntent` 只有 workspaceSkillEngine、plainDialogueIntent、评估脚本三个消费面；无第四入口。
2. `appendToolCall` 生产调用点仅 ChatPanel（主页）与 OutlineWorkspace（大纲），两者均通过 `startApiCall` 自动携带 `turnId`。
3. 负向路径已覆盖：纯权限问句保持 discuss；讨论态写入在服务层被 `permission_denied`；锁定态写入被 `locked` 拒绝。

## 遗留

1. 未重新封装安装包；封装前需按 M28/M29 执行构建新鲜度与旧产物清理。

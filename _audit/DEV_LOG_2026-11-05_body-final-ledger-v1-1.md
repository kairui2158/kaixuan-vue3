# 2026-11-05 终步账本格式退役与流水线指纹接线

## 目标

执行 `_audit/PROPOSAL_2026-11-05_BODY_FINAL_LEDGER_TRACE_V1.md` 的 V1.1 最小闭环：终步账本不再生成 SKILL 无法稳定识别的 bullet 旧形态；生成流水线把已加载的 folder SKILL 指纹接入既有运行记录快照，且不引入新状态源。

## 交付

- `chainExecution.ts`：`formatFinalStepLedger` 的 `extractedMeta[index]` 展开行和 `ledger_limit` 截断行去掉行首 `- `，固定为无前缀账本行。
- `chainExecution.spec.ts`：终步账本断言同批迁移，保留新形态正断言，新增行首旧 bullet 负向断言。
- `PipelinePanel.vue`：流水线 `loadRealSkill` 成功且 package 带 fingerprint 时，通过既有 `attachPromptSnapshot` 写入 `folder-fingerprint` 快照，并用 `apiCallId` 挂回当前调用；不新增 `skillRuntimeFingerprints`。
- 挂载自查：快照挂载已修正到 `startApiCall` 之后，复检顺序 `PipelinePanel.vue:3251 -> 3267`，避免 `apiCallId` 为空导致快照与 API 调用失联。
- 导出补全：文本导出在提示词快照段展示 `folderFingerprint` 为 `file:hash` 列表，未声明时显示 `-`；新增契约测试防止回归为 `[object Object]`。
- 封装：`npm run build` 重新产出 3.114.2 安装包；`npm run verify:packaging` 通过，SHA256 `a8769d41447796aa0119bc8b38a4357e934612685f3cd0dcca2a8f7f23ea4b8f`。

## 验证

```text
npx vitest run src/services/chainExecution.spec.ts src/services/finalStepMetadataReplay.spec.ts
Test Files 2 passed (2)
Tests      29 passed (29)

npm run test:services
Test Files 247 passed (247)
Tests      2661 passed (2661)

npm run type-check
vue-tsc --noEmit
exit 0

rg -n -- "- extractedMeta\[|- ledger_limit:" src electron scripts
CLEAN: legacy bullet forms=0
```

## 边界

本轮不改 SKILL 文件、候选保留策略、导出器和历史 trace。真实供应商正文链没有重复 live 调用，按已批准方案边界沿用既有运行证据；folder 指纹当前补的是应用生成流水线到 trace 的数据接线，真实导出 UI 的展示行为保持既有状态未重测。

# 2026-09-10 Folder 协议成熟化第一阶段

## 开发功能

依据 `_audit/FOLDER_PROTOCOL_MATURITY_RESEARCH_2026-09-10.md` 执行第一阶段“兼容与观测”。

1. `electron/ipc/skill-loader.js`：新增递归资源扫描，读取子目录资源为 `{path, content}`；`template.md` 缺失回退 `SKILL.md` 正文；坏 `meta.json/schema.json` 降级为 warning。
2. `src/services/realSkillTypes.ts`、`realSkillLoader.ts`：新增 `RealSkillResource` / `RealSkillLoadWarning`，包结构与加载结果透传资源与警告。
3. `src/services/folderSkillBatchImport.ts`：单个与批量导入预览显示资源数量和警告数量，错误文案只要求 `SKILL.md`。
4. `src/services/realSkillExecutor.ts`：loader warning 进入诊断；`postProcess.issues` 支持 blocking / non-blocking；folder 资源包优先执行自身模板；捕获 usage/finishReason；新增 `folderPackageCache` 明确包缓存语义。
5. `src/components/pipeline/PipelinePanel.vue`：chain 模式下 folder 技能不再传流水线解析模板；folder API 记录回填 usage 与 finishReason。

## 用途

第三方 folder SKILL 包中的 `references/`、`assets/` 等资源不再被静默丢弃；SKILL 作者能通过导入预览、运行记录和诊断看到真实包结构；chain 中每个技能的 API 记录具备完整观测数据；folder 模板与流水线模板的执行权不再混淆。

## 验证

```text
npx vitest run src/services/realSkillExecutor.spec.ts electron/ipc/skill-loader.spec.js
Test Files  2 passed (2)
Tests  20 passed (20)

npm run test:services
Test Files  15 passed (15)
Tests  163 passed (163)

npm run type-check
vue-tsc --noEmit
exit 0

npm run build:vue
vite build && vite build --config vite.protocols.config.mts
✓ built in 2.65s
✓ built in 47ms
```

## 遗留

方案第二至四阶段未在本轮执行：技能目录渐进披露 UI、技能包 manifest、社区脚本约定兼容、with/baseline 评测闭环。下一轮应先做目录/激活两级观测，再进入评测闭环。

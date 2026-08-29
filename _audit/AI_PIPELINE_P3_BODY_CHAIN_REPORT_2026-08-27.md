# AI Pipeline P3：正文层 chain 语义报告

日期：2026-08-27

## 目标

让凯旋正文层的新配置默认使用串行（chain），并确认已保存的用户模式仍可恢复；chain 每轮以当前 Skill 的模板和前一轮完整输出组成一次调用输入，最终结果取最后一步。

## 根因

`PipelinePanel.vue` 的 `stepSkillModes[4]` 初始值和恢复默认值均为 `compose`。正文层选择多个 Skill 时，未显式切换模式会把多个模板合并到一次 API 调用，凯旋 S1/S2/S3 不会自然形成三道串行工序。

## 本阶段修改

- `src/components/pipeline/PipelinePanel.vue`
  - 正文层默认模式由 `compose` 改为 `chain`。
  - 恢复配置的基准默认值由 `compose` 改为 `chain`；存在已保存值时仍按已保存值恢复，因此不覆盖既有用户选择。
  - chain 用户消息组装抽到 `src/services/chainExecution.ts`，首步使用原始执行包，后续步骤完整传入上一轮输出和记忆上下文。
- `src/services/chainExecution.ts`
  - 新增纯函数 `buildChainSkillPrompt` 和 `buildChainSkillSequence`。
- `src/services/chainExecution.spec.ts`
  - 覆盖 Skill 顺序、首步原始输入、后续步完整输出传递。

## 验证证据

- focused：`npx vitest run src/services/chainExecution.spec.ts src/services/chapterExecutionPackage.spec.ts src/services/generationResult.spec.ts`，3 个文件、10 个测试通过。
- 服务回归：`npm run test:services`，2 个文件、44 个测试通过。
- 类型：`npm run type-check`，无错误输出。
- 构建：`npm run build:vue`，179 modules transformed，built in 3.06s。
- Electron：杀进程后通过 `start-electron.bat` 启动，CDP 页面为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。
- CDP 模式保存：正文层下拉框 `compose → chain` 后，DOM=`chain`、storage=`chain`。
- CDP 模式恢复：重载并重新打开流水线后，DOM=`chain`；验证结束已恢复客户原配置，DOM=`compose`、storage=`compose`。

## 未覆盖边界

当前没有客户 API 配置和可用项目，未执行真实三次网络请求，因此未把“真实供应商请求次数/请求体”写成已通过。该边界应在有 API 的客户验收环境用三 Skill 项目实测。

## 结论

P3 的应用模式语义与持久化恢复闭环已完成；真实 API 三步请求属于待客户环境验证项。P4 继续处理稳定 `skillId` 的 Agent 绑定，不回滚 P0-P3。

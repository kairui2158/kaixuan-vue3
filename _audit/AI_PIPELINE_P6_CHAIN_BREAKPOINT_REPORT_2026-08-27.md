# AI Pipeline P6：chain 断点续跑与状态边界报告

日期：2026-08-27
阶段：P6
结论：代码与隔离 Electron 持久化闭环通过；真实供应商断网恢复待客户 API 配置后补验。

## 目标

为 chain 的每个 Skill 保存可恢复的中间状态。成功后从下一个 Skill 继续；当前 Skill 失败后重试当前 Skill；Skill 顺序变化时废弃旧断点并从头开始。失败不能把旧输出伪装成正常结果继续传给后续 Skill。

## 实现

| 项目 | 实现位置 | 结果 |
| --- | --- | --- |
| 断点数据模型 | `src/services/chainBreakpoint.ts` | 增加状态、Skill ID、顺序、输入、输出、Agent、重试次数、错误和时间 |
| 成功断点 | `createChainSuccessBreakpoint` | 每个 Skill 成功后立即保存 |
| 失败断点 | `createChainFailureBreakpoint` | 当前 Skill 失败后保存 `failed`，保留上一成功输出 |
| 恢复索引 | `getChainResumePoint` | 成功从 `lastSuccessChainIndex + 1`；失败从 `skillIndex`；顺序不匹配从 0 |
| 运行时接入 | `src/components/pipeline/PipelinePanel.vue` 的 `_runStepSkillsInner` | chain 循环按稳定 Skill ID 读取、保存和恢复 |

## 验证勾选

- [x] focused 测试：6 个文件、20 个测试通过。
- [x] 服务测试：2 个文件、44 个测试通过。
- [x] `vue-tsc --noEmit` 通过。
- [x] `npm run build:vue` 通过；仅有既有动态导入和 bundle 大小警告。
- [x] 源文件启动器：`cmd.exe /c start-electron.bat` 成功启动。
- [x] CDP 页面：标题为 `神意助手`，`window.electronAPI === true`。
- [x] 隔离 storage 写入并读取完整失败断点。
- [x] `taskkill /f /im electron.exe` 后再次使用 `start-electron.bat` 启动。
- [x] 重启后读取到同一断点的全部关键字段。
- [x] 验证完成后删除隔离键，读取结果为 `null`。

## 原始证据摘要

```text
RUN  v4.1.11 D:/codex/novel-workshop-vue3
Test Files  6 passed (6)
Tests  20 passed (20)

> vue-tsc --noEmit

vite v8.2.1 building client environment for production...
182 modules transformed.
✓ built in 1.41s

post-restart title 神意助手
post-restart electronAPI true
post-restart storage { kind: 'chain', status: 'failed', skillIndex: 2,
  skillId: 'skill-check', lastSuccessChainIndex: 1,
  inputPrompt: 'checkpoint input', agentId: 'agent-check', retryCount: 1,
  error: 'probe failure' }
cleanup storage null
```

## 边界与未覆盖项

- [ ] 当前环境没有客户供应商 API 配置，因此没有伪造真实网络失败、重试请求和供应商恢复。
- [ ] 真实 chain 生成中的“网络断开 → 用户重试 → 从失败 Skill 重连”需要配置客户 API 后做一次真实操作验收。
- [x] 纯函数已证明成功断点、失败当前步重试、Skill 顺序变化重置三种索引行为。

## 变更范围

本阶段只处理 chain 断点模型、恢复算法、PipelinePanel 接入和对应测试；不把 P7 的内容完整性校验混入本阶段。

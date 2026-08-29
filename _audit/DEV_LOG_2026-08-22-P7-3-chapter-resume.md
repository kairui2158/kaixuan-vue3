# P7-3 章节层断点续跑开发日志

日期：2026-08-22
状态：部分完成，真实重启续跑未核销

## 本轮目标

验证章节生成在 API 失败后保存断点，杀 Electron 并通过 `start-electron.bat` 重启后，从正确章节继续生成；同时验证补充生成、项目/卷隔离、手动章节保护、UI 恢复提示和持久化清理。

## 已完成的实现

- `PipelinePanel.vue` 使用 `kind/projectId/volumeId/total` 匹配章节断点。
- 章节生成改为按已收集数量循环，批次成功后保存断点、项目和章节树。
- API 失败最多重试 5 次，并保存 `retry-wait`/`failed` 阶段。
- 成功完成后清除断点；取消生成使用统一 `AbortSignal`。
- 保存生成章节时保留同卷未标记 `pipelineGenerated` 的手动章节。
- 断点不匹配时不清空已有章节。
- UI 有章节断点恢复提示。

## 本轮证据

- `npm run build:vue`：Vite 转换 175 个模块，生成 `dist-renderer/index.html` 和 bundle，构建成功。
- `npm run type-check`：未通过，存在项目既有类型债务；不能作为本轮通过证据。
- Electron 页面通过 `start-electron.bat` 启动，CDP URL 为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。
- 项目管理 UI 删除隔离项目 `P7-3隔离验证` 成功；删除后 `wa_project_p1787397902513=null`、`wa_lastProjectId=null`，列表中不再出现该项目。
- 上一轮受控 API 测试确认了 chain 断点会保存，但由于设定层已有 chain Skill 配置未清空，未进入章节直接 API 测试，不能替代章节重启续跑证据。

## 未核销与阻塞

- 未取得“章节第一批成功、第二批失败、杀 Electron、重启、从第三章继续到第四章”的完整真实证据。
- 本轮新建隔离项目的 UI 前置没有稳定产生新项目 ID，不能用直接写入存储的方式绕过。
- 项目管理的原生 `confirm()` 自动化必须每次只注册一次 dialog handler；重复点击会被遮罩拦截。

## 结论

P7-3 不标记 PASS。代码实现和构建属于已完成，项目隔离清理属于已验证；章节重启续跑、补充生成联合场景、重复/覆盖保护的真实 Electron 闭环属于未核销。

## 续验收增补（2026-08-22）

- 源文件 Electron 已通过 `start-electron.bat` 启动，CDP 页面为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。
- 生成供应商存在且启用；受控请求实际命中 `https://openapi.cloud-ai.cn/v1/chat/completions`，但隐藏设定层 chain Skill 先于章节层执行。
- 本轮隔离项目通过 UI 清理，最终 `removed: 1`、`lastProjectId: null`、`breakpoint: null`。
- 章节失败保存、杀 Electron 后重启续跑、补充生成联合断点和最终 done 清除仍未取得完整证据，不标记通过。

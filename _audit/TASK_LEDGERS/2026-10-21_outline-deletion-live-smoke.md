# 2026-10-21 大纲删除外部 live smoke 台账

## 1. 目标与原话

用户批准的决策：

1. 外部 live smoke 只测一个供应商，使用应用默认 API key，不新建 key。
2. 复核 `callApiWithAgentTimeout` 是否仍为死代码。
3. 全部通过后升版 `3.102.0` 并封装，只保留最新安装产物。

本轮交付物：真实 Electron + 默认供应商的轻量删除 smoke 验证器、401 现场证据、本地完整回放回归证据、死代码复核结论。
用户随后纠正：应用内已有可用供应商 KEY，不得再向用户索取；本轮按该裁决完成 live smoke 与收尾。

## 2. 门禁读证

- G0.3：完成声明必须区分已验证、未验证、无法验证；外部 live 因凭据失效登记为 blocked，不冒充通过。
- G0.8：任务收尾必须分层清理临时运行态，保留本轮证据。
- G0.12：非平凡任务必须建七节台账。
- G1.4：验证分层：真实 Electron UI 已验证，外部供应商 live 被 401 阻塞。
- G1.5：验证器自身必须暴露 API error；本轮已补 `apiErrors` 采集并完整重跑。
- G2.10：客户 trace 回放不得降级为摘要；本轮完整重放 21 请求 / 41 工具调用。
- G2.11：供应商 401 是业务终态，禁止把错误文本当正文或工具结果继续消费；本轮应用停在失败终态，无二次请求。

## 3. 路由判定

- 加入：大纲工作台删除授权、真实 Electron UI、默认外部供应商、run trace 导出、旧死代码复核。
- 排除：SKILL 内容修改；本轮无 SKILL，且 SKILL 不改变执行协议。
- 排除：生成流水线卷纲/章节/正文；本轮只覆盖大纲工作台删除链路。

## 4. 影响圈与作者反证

实际修改：

- `scripts/verify-outline-deletion-live-smoke-electron.mjs`：新增轻量 live smoke；读取应用默认 `wa_providers.json` 第一个供应商；真实文件导入；真实 API 回合；等待授权门；断言授权前不变、授权后删除、trace 事件与 `editor.write` 成功。

作者反证：

- 反证一：脚本是否只是低成本的假 live？结论：不冒充。它发起真实物理请求；401 时脚本红灯并保留失败详情。
- 反证二：401 是否可能是脚本传错 key？结论：不是。`verify-boundary-live-provider.mjs` 在应用内 Electron 解密链路上复测，两个应用默认 provider 均 401。
- 反证三：应用是否因 401 卡死？结论：没有。turn 进入 `failed` 终态，无第二次物理请求，错误进入 run trace。
- 反证四：默认 provider 401 是否等于无可用 KEY？结论：不等于。继续复核发现历史验证 profile 内 provider 可用，验证脚本已参数化，直接复用应用内 KEY，全程脱敏。
- 反证五：授权回放是否可能只是 UI 假成功？结论：不是。consumed 事件补 `execution: "authorized-replay"`、commandCount 与原文/删除后长度，且断言要求真实文档变化。

## 5. 停止条件

- live smoke 通过：可见 Electron、真实默认供应商、授权门出现、授权后 `editor.write` 成功、目标标题删除、trace 事件齐备。
- live smoke 阻塞：供应商认证失败时登记 blocked_external_credentials，保留证据，不升版、不封装。
- live smoke 通过：使用应用内可用 provider profile，可见 Electron、真实 API、授权门、授权回放、真实删除、deep trace 完整。
- 本地回归通过：完整 21 请求回放、类型检查、全量测试通过。

## 6. 执行证据

- 构建：`npm run build:vue` exit 0，renderer 产物重建。
- live smoke：`node scripts/verify-outline-deletion-live-smoke-electron.mjs` exit 1。
  - 真实文件导入 197 字。
  - 真实请求 1 次，309ms 返回 HTTP 401 `Invalid token`。
  - turn 终态 `failed`，`apiStatuses=["failed"]`，`apiErrors=["Invalid token (...)"]`。
  - 授权门未触发，原因明确为外部凭据失效。
- 供应商复核：`node scripts/verify-boundary-live-provider.mjs` exit 1。
  - `prov-1788185503573` / `新供应商`：401 `Invalid token`。
  - `prov-1788240547075` / `deepseek官网`：401 `Authentication Fails`。
  - 证据：`_audit/verification-boundary-live-provider/report.json`。
- 本地完整回放：`node scripts/verify-outline-deletion-confirmation-electron.mjs` exit 0。
  - 21 物理请求 / 41 工具调用。
  - 授权前 74,841 字不变；授权后目标删除；拒绝后原文保留。
  - 证据：`_audit/verification-outline-deletion-gate/electron/result.json` 与三张截图。
- 死代码复核：`rg "callApiWithAgentTimeout" src scripts electron` 0 命中，确认不存在，无需清理。
- 类型检查：`npm run type-check` exit 0。
- 全量测试：`npx vitest run` exit 0，187 files / 2103 tests passed。
- 回放脚本收尾：`verify-outline-deletion-confirmation-electron.mjs` 在 finally 阶段删除自身 profile，`node --check` 通过；当前残留 profile 已清理。
- KEY 复核：
  - 默认 config：两个 provider 401。
  - backup：401。
  - `_data/outline-deletion-live-replay-profile/.../wa_providers.json`：200 可用。
  - `_data/api-direct-write-live-v3-profile/.../wa_providers.json`：200 可用。
  - 证据目录：`_audit/verification-boundary-live-provider/replay-profile-key/`、`live-v3-profile-key/`，均脱敏。
- live smoke run 2：`node scripts/verify-outline-deletion-live-smoke-electron.mjs` exit 0。
  - 授权门截图 01、授权写入截图 02。
  - `outline-deletion-confirmation-consumed.execution = "authorized-replay"`。
  - 大纲目标标题真实删除，deep trace 导出完整。
  - 证据：`_audit/verification-outline-deletion-live-smoke/`。
- 定向测试：3 files / 34 tests 通过。
- 升版：`npm version 3.102.0 --no-git-tag-version`，`package.json` 与 `package-lock.json` 已更新。
- 封装：`npm run build` exit 0，生成 `dist/神意助手-Setup-3.102.0.exe`。
- 打包核验：`node scripts/verify-packaging-3-102-0.mjs` exit 0；rendererFiles=81、electronAPI methods=77、真实启动与可见渲染通过；SHA256 `d6601aa52e169607860ae37886d9dbe986ff86801989c7d4f76a04a76f0a441a`；证据 `_audit/verification-packaging-3-102-0/packaging-evidence.json`。
- dist 清理：`node scripts/cleanup-dist-3-102-0.mjs`，删除 3.100.0 / 3.101.0 安装包与 blockmap，仅保留 3.102.0 交付产物与当前解包目录。

## 7. 缺口清单

- 默认供应商配置中的两个 KEY 失效（401），已如实登记；本轮 live 使用应用内历史验证 profile 的可用 KEY，不再构成阻塞。
- 模型行为观测项：一次空内容 `replace_match` 被完整性拦截后改走 `delete`；一次 `outline.get_summary` `node_not_found: root` 后自行恢复；授权后模型仍尝试写入，授权回放路径正确完成。这些登记为后续提示词/协议层优化素材，不影响本轮通过判定。
- 临时 profile 清理：删除 `_data/outline-deletion-confirmation-electron-profile`；保留 `_data/outline-deletion-live-replay-profile`，因为多条历史验证脚本仍消费该共享基座。

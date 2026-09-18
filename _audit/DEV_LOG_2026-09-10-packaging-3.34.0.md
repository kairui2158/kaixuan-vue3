# 2026-09-10 意图路由 V3 封装与打包版实操验证（3.34.0）

## 开发功能

将意图路由 V3 修复封装为 `3.34.0` 安装包，并用打包版应用完成真实 UI 实操闭环。

1. `dist/神意助手-Setup-3.34.0.exe`：134,911,780 字节，SHA256 `6A94B521858E0BF09863E5D7B7CEEDD63E4E5B544A5999D89002920CD585A954`。
2. 打包前验证：`npm run type-check` exit 0；服务测试 157 项通过；`deai-v2` 9 tests passed。
3. asar 校验：版本 `3.34.0`，关键代码关键词全部存在。
4. 打包版实操：后台启动 `dist/win-unpacked/神意助手.exe --remote-debugging-port=9228`，通过 CDP 驱动真实 UI 验证。

## 交付目的

验证客户实际安装的 `3.34.0` 不再出现文本技能被误判为 folder 技能、fallback 按钮失效或路由死循环的问题；低置信请求会在气泡中给出推荐技能，并允许本次跳过意图路由全链执行，且不会实际调用供应商 API。

## 打包版真实 UI 验证

验证方式：打包版 Electron + CDP 操作真实 UI；临时注入 3 个文本技能后 `page.reload()` 让 store 重新加载；测试输入 `今天天气不错呀`。

```text
[PASS] packaged storage contains three temporary text skills
[PASS] outline workspace renders temporary skills (codex-e2e-analyze,codex-e2e-generate,codex-e2e-discuss)
[PASS] outline workspace: three text skills selected (3/3)
[PASS] low-confidence input shows fallback bubble
[PASS] fallback records no-match routing ({"kind":"no_match","confidence":0,"reason":"no-keyword-overlap"})
[PASS] fallback routing reason is no-keyword-overlap (no-keyword-overlap)
[PASS] low-confidence fallback recommends discussion skill only (["codex-e2e-discuss"])
[PASS] full-chain bypass is available under advanced options
[PASS] fallback run does not call provider (2 rendered messages)
[PASS] temporary test skills are removed from packaged storage
[PASS] skill storage is byte-identical to the pre-test snapshot
[PASS] low-confidence test messages are removed from the user project
[PASS] project storage is byte-identical to the pre-test snapshot
[DONE] packaged 3.34.0 intent routing UI verification completed
```

## 验证脚本收尾修复

首次打包版验证的清理断言失败，根因不是应用缺陷，而是验证脚本生命周期错误：

1. 清理断言在 `try` 内，恢复动作在 `finally` 内，断言时数据尚未恢复。
2. 项目对象没有 `id` 字段，按 `payload.id` 恢复时误写 `wa_project_undefined.json`。

修复后脚本先恢复技能库与项目数据，再 reload 并从磁盘读取终态；项目 ID 统一来自 `wa_lastProjectId`。最终 13 项断言全部通过，exit 0。

## 数据与临时文件清理

1. 清理 `wa_project_undefined.json` 与 `wa_project_proj-1788270094359.json` 中的全部测试消息，真实对话记录恢复为一致的 10 条。
2. 清理 `wa_skills.json.codex-e2e-bak` 备份，`wa_skills.json` 保持 11 个技能且与备份逐字节一致。
3. 删除临时脚本：`verify-packaging-3-34-0.cjs`、`inspect-packaged-data-dir.cjs`、`verify-packaged-3-34-0-ui.cjs`、`debug-packaged-outline-state.cjs`。

## 客户验证重点

1. 安装包关于页 / 文件属性显示 `3.34.0`。
2. 大纲工作台选择 3 个未声明复杂 intents 的文本技能并串行执行。
3. 发送低置信闲聊文本：出现 fallback 气泡，无 API 请求。
4. 展开高级选项：可见“本次直接全链执行”按钮。
5. 技能库设置页无 `codex-e2e-*` 残留，项目对话无测试消息。

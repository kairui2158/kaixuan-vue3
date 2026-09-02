# 上下文记忆最终交付报告（2026-09-01）

## 结论

P0-P6 已按方案完成并闭环。上下文记忆不再只停留在服务层：主页对话、大纲工作台普通对话、大纲工作台 SKILL、chain 执行、流水线记忆形状、SKILL 上下文策略配置均已接入统一协议。版本号升级为 `3.11.0`。

## 交付内容

1. `src/types/context.ts`：上下文协议类型。
2. `src/services/conversationContextService.ts`：上下文读取、裁剪、组装、写回和清理服务。
3. `src/components/chat/ChatPanel.vue`：主页对话接入上下文，成功后写回，失败不伪造 assistant 轮次。
4. `src/components/common/OutlineWorkspace.vue`：工作台普通对话和 SKILL 调用接入上下文，chain 语义按第一步/后续步骤区分。
5. `public/skill-engine.js`：支持上下文消息注入，并明确 failed/skipped，不再把失败步骤伪装成上一步成功输出。
6. `src/components/pipeline/PipelinePanel.vue`：记忆上下文经统一消息形状组装，不改变原有一次生成请求语义。
7. `src/components/settings/SkillSettings.vue` 与 `src/stores/skill.ts`：SKILL 上下文策略配置与持久化。
8. `src/services/aiService.ts`：诊断日志新增 `ctxTurns` 字段。

## 真实源应用验证

启动方式：`node_modules\electron\dist\electron.exe . --remote-debugging-port=9227`。本轮未使用网页模式、开发者模式和安装版。

P6 原始台账：`_audit/tmp/context_memory_p6_result.json`（收尾删除临时探针后，本报告保留以下关键结果）。

| 验证项 | 结果 |
|---|---|
| 主页第二轮携带第一轮上下文 | 通过 |
| 大纲工作台第二轮携带第一轮上下文 | 通过 |
| 主页与大纲工作台上下文隔离 | 通过 |
| 主页/大纲历史限制为 10 轮 | 通过 |
| chain 第一步带原始请求与历史 | 通过 |
| chain 第二步带完整上一步输出且不注入全量聊天历史 | 通过 |
| 主页/大纲上下文持久化 | 通过 |
| 失败请求未写入伪造 assistant 轮次 | 通过 |
| 页面 runtimeErrors | `[]` |
| 断言总数 | 12/12 通过 |

## 最终验证门

以下命令在最终收尾时重新执行，结果见本文件“最终验证输出”章节。

1. `npm run type-check`
2. `npx vitest run src/services/conversationContextService.spec.ts src/services/skillEngineFailure.spec.ts --reporter=verbose`
3. `npm run build`

## 边界与客户实操入口

- 本轮未验证安装版客户路径；按用户要求，验证只使用源应用启动。
- 安装包为未签名状态。
- 客户实操入口：主页连续两轮提问、大纲工作台连续两轮 SKILL 对话、重启后继续提问、设置页修改 SKILL 上下文策略并保存。
- 旧 `wa_chat_<projectId>` 只读兼容，新上下文写入 `wa_ctx_<projectId>`；导入项目不预建上下文状态。

## 最终验证输出

| 验证门 | 命令 | 本轮原始输出关键行 | 结果 |
|---|---|---|---|
| 类型检查 | `npm run type-check` | `shenyi-assistant@3.11.0 type-check` / `vue-tsc --noEmit`，无错误输出 | 通过 |
| 专项测试 | `npx vitest run src/services/conversationContextService.spec.ts src/services/skillEngineFailure.spec.ts --reporter=verbose` | `Test Files  2 passed (2)` / `Tests  14 passed (14)` | 通过 |
| 完整构建 | `npm run build` | `✓ 288 modules transformed.` / `✓ built in 948ms` / NSIS 生成完成 | 通过 |
| 安装包 | `dist/神意助手-Setup-3.11.0.exe` | 大小 `103486704` 字节 | 已生成 |
| SHA256 | `Get-FileHash -Algorithm SHA256` | `CF8F488E57F642C160BF51C52E5E64D1DF8E18D5EA79D0B40A4F82F9EECAE7ED` | 已记录 |

构建输出中的动态导入与 chunk 大小提示为既有非阻断 warning；本轮未做无关重构。安装包构建日志显示 `no signing info identified, signing is skipped`，因此安装包为未签名状态。

## 本轮续验校准（16:25-16:27）

### 已新增的精准证据

- `src/services/aiService.spec.ts` 新增断网错误路径：`fetch` 抛出 `TypeError('网络不可用')`，使用 `retry:false`，断言 `kind: network`、`providerId: runtime`、请求次数为 1。
- 新增用途供应商缺失路径：验证用途无 provider 时断言中文错误“未配置验证用途供应商”，且网络请求次数为 0，证明没有静默回退到生成供应商。
- 当前命令输出：`Test Files 3 passed (3)`、`Tests 58 passed (58)`；其中 `aiService.spec.ts` 为 `44 passed (44)`。
- 源应用 CDP 连通性：`127.0.0.1:9227 TcpTestSucceeded=True`；页面为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。
- 真实项目 `default` 读取到 38 条记忆，首条真实记忆键为“菌膜的试探”，没有写入探针数据。

### 仍未核销的事项

- 取消路径本轮只有源码已有单测与此前源应用清空回归证据，尚未新增一次独立的真实 UI 取消操作证据。
- 断网和无供应商本轮为真实服务入口的精准测试，不等同于真实界面操作；因此不把它们标为客户 UI 已验收。
- 当前真实上下文会话消息未包含“菌膜的试探”键名，不能证明真实记忆已经进入某次 outgoing API 消息；只证明真实记忆来源存在。
- 设置页上下文策略本轮已完成源码链路核对，但未完成完整的“修改 → 等待异步落盘 → 杀源应用 → 源应用重启 → 读回”新鲜操作台账。
- 安装包客户路径按本方案边界未执行，不得标记安装包门通过。

### 结论修正

代码层 P0-P5 和服务层错误分类回归有新鲜证据；P6 真实闭环仍为部分完成，不能写成全部 12/12 已覆盖本轮剩余目标。客户交付时应按“已完成 / 部分完成 / 未核销”区分。

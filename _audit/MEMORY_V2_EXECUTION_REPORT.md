# 记忆 V2 执行总报告

**执行日期**：2026-09-07  
**结论**：V1-V16 与 G1-G12 共 28 项验收门禁全部通过，Memory V2 目标关闭。  
**基线验证**：`npm run type-check` exit 0；`npm run build:vue` exit 0（1593 modules transformed，主包 6.19s，协议包 78ms）；`npx vitest run` exit 0（33 files / 224 tests passed）。

## 一、执行范围

- 依据：`_audit/MEMORY_HANDOFF_COMPLETE_V2.md`
- 顺序：P0（缺口3/1/2） -> P1（缺口4/7/6/5） -> P2（缺口8/10/9） -> P3（缺口11/12）
- 代码：12 项缺口全部落地，未 reset、未 revert、未引入新增 npm 依赖
- 运行时：真实 Electron + CDP 驱动，非纯代码阅读验收
- 请求级：本地 OpenAI-compatible mock 捕获真实出站请求体，验证主进程网络链路

## 二、V1-V16 主体验收

| 门禁 | 项目 | 结果 | 关键证据 |
|---|---|---:|---|
| V1 | 记忆面板五视图切换 | ✅ | `memory-v2-final-acceptance.json`：5 个 tab 全部可见 |
| V2 | 列表视图 CRUD | ✅ | 编辑后列表更新，删除后 `exists:false` |
| V3 | 合并导入 | ✅ | 原实体保留、导入实体出现，提示“新增 2 项，跳过 0 项” |
| V4 | 记忆导出 | ✅ | 导出调用覆盖 JSON 全量格式 |
| V5 | 角色卡导出 | ✅ | `shenyi-character-profile`，含关联关系与共同出场事件 |
| V6 | 角色卡导入 | ✅ | 卡片实体写入并在 UI 可见 |
| V7 | 正文确认后抽取 | ✅ | 主体验收链路完成正文确认与抽取验证 |
| V8 | 编辑器抽取 | ✅ | 抽取入口与写入链路通过主体验收 |
| V9 | 持久化 | ✅ | 重启后实体仍在 UI 中可见 |
| V10 | 项目隔离 | ✅ | 主项目与另一项目实体列表互不污染，`isolated:true` |
| V11 | 正文生成请求注入记忆 | ✅ | 真实请求体包含 `[相关记忆]` 与“请求验收角色” |
| V12 | 聊天请求注入记忆 | ✅ | 真实请求体包含 `相关记忆：` 与“请结合请求验收角色继续” |
| V13 | 回滚历史版本 | ✅ | `historyCount:2`，回滚后实体恢复 |
| V14 | 覆盖导入可恢复 | ✅ | 覆盖前备份存在且包含原数据 |
| V15 | 断网失败不崩 | ✅ | 网络错误被捕获，正文保存，提示失败，不崩溃 |
| V16 | 坏 JSON 导入 | ✅ | JSON 解析错误提示，原实体保留 |

## 三、G1-G12 缺口验收

| 门禁 | 项目 | 结果 | 关键证据 |
|---|---|---:|---|
| G1 | 四个专用导出 | ✅ | `memory-v2-p0-evidence.json`：4 个菜单项存在，4 种导出格式全部调用 |
| G2 | 版本历史与回滚 UI | ✅ | 历史模态可见，预览 `实体2 → 3+1`，回滚后实体/事件计数恢复 |
| G3 | 抽取超时可配置 | ✅ | 设置项 300 秒显示正常，修改后持久化为数字 180 |
| G4 | factStatus 徽章 | ✅ | 已确认/待确认/有冲突/已过时全部渲染 |
| G5 | 冲突解决面板 | ✅ | 冲突面板展开，保留旧值/采用新值可用，解决后 `confirmed` |
| G6 | 黑名单管理 | ✅ | 实体变灰，管理模态可见，移除后恢复 |
| G7 | 统计仪表盘 | ✅ | 实体/关系/事件/世界观/伏笔/待确认/抽取次数统计正确，状态筛选生效 |
| G8 | 列表搜索 | ✅ | 关键词搜索与别名搜索均可筛选 |
| G9 | 关系图交互编辑 | ✅ | 编辑按钮可见，编辑模式可激活 |
| G10 | 伏笔追踪字段 | ✅ | 埋设/回收章节 ID 与序号字段显示，保存后 `planted` 状态保留 |
| G11 | 自动抽取开关 | ✅ | 设置读取为布尔值，关闭状态持久化 |
| G12 | 实体手动合并 | ✅ | 建议对出现，合并后关系 source/target 正确迁移 |

## 四、运行时证据链

| 证据文件 | 内容 |
|---|---|
| `_audit/tmp/memory-v2-p0-evidence.json` | P0 三缺口：超时设置、四导出、历史/回滚 |
| `_audit/tmp/memory-v2-gaps-evidence.json` | G4-G12 运行时行为 |
| `_audit/tmp/memory-v2-final-acceptance.json` | V1-V16 主体验收，`allStepsOk:true` |
| `_audit/tmp/memory-v2-request-evidence.json` | V11/V12 真实请求体，`allStepsOk:true` |
| `_audit/tmp/g6-views-evidence.json` | 四画布视图渲染 |
| `_audit/tmp/g6-behavior-evidence.json` | 点击、悬停、拖拽、框选、折叠、空态与重开 |
| `_audit/tmp/memory_v2_request_mock_server.cjs` | 本地 mock 服务 |
| `_audit/tmp/run_memory_v2_request_acceptance.cjs` | 请求级验收探针 |

## 五、G6 集成回归

- 四视图渲染：关系图、图谱分析、思维导图、时间线全部可见且画布非空。
- 交互回归：节点点击、悬停、拖拽、框选、思维导图折叠/展开、时间线范围筛选通过。
- 打开源跳转：关系图与时间线均可跳转编辑器并保持正文层模式。
- 空态与重开：空项目不渲染画布，面板关闭后画布销毁，重开后 5 个 tab 正常。
- 数据安全：视图操作不回写数据，前后 JSON 字节数一致。

## 六、修复与收尾

### 6.1 V11/V12 并发读取修复

**根因**：mock 服务每次收到请求都同步重写 `memory-v2-request-log.json`，探针轮询读取该文件时会读到半写状态，导致 `SyntaxError: Unterminated string in JSON`。

**修复**：

- `_audit/tmp/memory_v2_request_mock_server.cjs` 新增 `GET /requests`，直接返回内存中的请求快照。
- `_audit/tmp/run_memory_v2_request_acceptance.cjs` 改为通过 `/requests` 读取，不再解析正在写入的日志文件。

**修复后验收**：`node _audit/tmp/run_memory_v2_request_acceptance.cjs` exit 0，`allStepsOk:true`。正文请求 4 次中 3 次含记忆上下文，聊天请求含记忆上下文；主进程传输与 Authorization 脱敏检查通过。

### 6.2 测试环境清理

- mock 服务已停止：端口 `18080` 连接数为 0。
- 测试项目与测试聊天文件已清理：`requestProjects=0`、`requestChats=0`。
- 真实供应商配置已恢复：`_data/wa_providers.json` 还原为验收前的 5 个供应商，默认生成供应商 `prov-1788350418677`，模型 `deepseek-v4-pro`；加密 key 未在任何输出中明文化。
- 验收过程中的临时 mock 供应商已移除。

## 七、遗留与建议

1. **构建警告非阻塞**：Vite 提示 `configLoader:native` 兼容警告、若干无效动态导入和大 chunk 警告；本轮评估为非阻塞，未做侵入性架构重构。建议后续单开“包体积与依赖关系优化”。
2. **历史探针残留**：`_audit/tmp` 中保留了 G6 与 Memory V2 证据、脚本和截图，用于审计追溯；若需要瘦身，可在归档后删除。
3. **供应商配置仍在 `_data` 本地数据目录**：未纳入 git 追踪，当前已恢复真实配置。

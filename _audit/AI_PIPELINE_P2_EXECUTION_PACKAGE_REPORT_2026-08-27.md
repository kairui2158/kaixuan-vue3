# AI Pipeline P2：章节执行包闭环报告

日期：2026-08-27  
目标：建立玄武 L4 到凯旋正文层的稳定章节执行包，不改变本阶段的 API 调用次数、chain 模式或 Agent 选择。

## 对账

| 项目 | 根因/修改 | 实际结果 | 证据 |
|---|---|---|---|
| 执行包模型 | 新增 `src/services/chapterExecutionPackage.ts`，集中保存卷、章、大纲、设定、绑定设定、风格、节奏、记忆和来源引用 | 纯数据模型可构造、可 JSON 序列化 | `chapterExecutionPackage.ts:1-27,58-92`；focused 测试 3/3 |
| 正文 prompt 来源 | `genBody` 不再直接散落拼接，改由 `buildChapterExecutionPrompt` 从执行包渲染 | 正文请求使用同一份执行包输入 | `PipelinePanel.vue:2250-2275` |
| 正文与执行包边界 | 执行包不读取 `body`，正文仍由 `parseGenerationResult(...).body` 写入 | 执行包不包含正文，正文不包含执行包字段 | focused 测试；P1 `generationResult` 回归 |
| 项目持久化 | 章节对象挂载 `chapterExecutionPackage`，沿用 `projectStore.saveProject()` 的章节序列化 | 隔离项目写入后读取存在，重启后读取仍存在 | CDP 原始结果见下方 |
| 客户 API 真实生成 | 当前环境没有配置真实客户 API | 本项未宣称通过，留待 P8 配置真实供应商后验证 | 本报告“未覆盖边界” |

## 实际用户链路证据

1. 构建后使用 `start-electron.bat` 启动，CDP 页面：
   `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`
2. 页面挂载结果：

```text
{"title":"神意助手","appMounted":true,"pipelineText":false,"rendererUrl":"file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html"}
```

`pipelineText:false` 只表示启动后的当前页面未打开流水线面板，不表示 bundle 未加载；P2 入口已由构建产物和源码行号核对。

3. 隔离项目首次写入并读取：

```text
{"key":"wa_project-p2-verification-20260827","packagePresent":true,"bodySeparate":true,"sourceRefs":["outline:locked","volume:v1","chapter:c1"],"serialized":true}
```

4. 杀进程、重新启动、再次读取并清理隔离键：

```text
{"restored":true,"packagePresent":true,"bodySeparate":true,"projectId":"p2-verification-20260827","cleaned":true}
```

## 自动化验证

```text
P2 focused：Test Files 2 passed (2), Tests 8 passed (8)
既有服务：Test Files 2 passed (2), Tests 44 passed (44)
type-check：退出码 0，无错误输出
build:vue：178 modules transformed，built in 5.47s
```

构建仍有既有的动态导入和大 chunk 警告，本阶段没有扩大范围处理。

## 未覆盖边界

- 没有客户 API 配置，未实测一次真实正文请求、模型响应和执行包进入请求体的网络证据。
- P2 不处理凯旋 S1/S2/S3 的多次 chain 调用，那是 P3。
- P2 不处理 per-skill Agent 稳定 ID、schema、断点状态机或叙事完整性校验。

## 判定

P2：**通过本阶段代码、测试、构建和持久化恢复门，可进入 P3**。真实供应商生成验证明确留在 P8，不提前标记。

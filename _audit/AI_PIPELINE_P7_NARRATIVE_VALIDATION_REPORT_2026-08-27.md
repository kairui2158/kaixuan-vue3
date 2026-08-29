# AI Pipeline P7：内容/叙事完整性校验与定向补充报告

日期：2026-08-27
阶段：P7
结论：确定性结构校验、重复过滤和章节定向补充逻辑通过；模型语义质量仍需客户 API 实测。

## 本阶段范围

P7 只处理应用能够确定判断的完整性边界：卷纲/章节的数量、必填字段、重复标题、空内容和补充生成批次。事件是否被模型正确覆盖、伏笔是否回收、人物状态是否合理，属于需要领域规则或模型评审的语义验收，不伪装成字符串校验已经解决。

## 修改与闭环

| 闭环 | 位置 | 结果 |
| --- | --- | --- |
| 卷纲结构校验 | `src/services/narrativeValidation.ts` / `validateVolumeNarrative` | 校验目标卷数、卷名、卷纲内容、负字数和重复卷名 |
| 章节结构校验 | `validateChapterNarrative` | 校验目标章数、标题、剧情点概要和重复标题 |
| 补充批次筛选 | `selectCompleteChapters` + `genChapters` | 只接收标题和剧情点均非空且不重复的章节，再写入项目 |
| 现有兼容 | `PipelinePanel.vue` | 保留原入口和项目字段，不改变旧数据读取方式 |

## 验证勾选

- [x] focused 测试：7 个文件、23 个测试通过。
- [x] `npm run test:services`：2 个文件、44 个测试通过。
- [x] `npm run type-check`：通过。
- [x] `npm run build:vue`：通过，183 个模块转换完成。
- [x] 源文件 `start-electron.bat` 启动成功，9227 调试端口监听。
- [x] CDP 实测页面标题为 `神意助手`，URL 为 `dist-renderer/index.html`，`window.electronAPI` 为 `true`。
- [x] 隔离 storage 写入/读取叙事探针成功。
- [x] 清理隔离键后读取结果为 `null`。
- [x] 本阶段没有写入客户项目、没有调用伪造供应商 API。

## 原始证据摘要

```text
RUN v4.1.11 D:/codex/novel-workshop-vue3
Test Files  7 passed (7)
Tests  23 passed (23)

> npm run test:services
Test Files  2 passed (2)
Tests  44 passed (44)

vite v8.2.1 building client environment for production...
183 modules transformed.
✓ built in 2.08s

title 神意助手
url file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html
electronAPI true
storage-write-read { kind: 'narrative-validation', ... }
storage-cleanup null
```

## 明确边界

- [ ] 尚未验证真实供应商返回的关键事件、伏笔、角色状态和场景是否覆盖，因为当前没有客户 API 配置。
- [ ] 尚未把语义模型评审自动化；当前实现只负责应用可确定的结构性缺口。
- [x] 章节不足时已有循环会继续请求到目标数量；空条目和重复标题不会被写入收集结果。

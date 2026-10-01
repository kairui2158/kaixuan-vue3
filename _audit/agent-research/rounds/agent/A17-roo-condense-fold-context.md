# A17 Roo 折叠上下文与压缩

- 仓库：RooCodeInc/Roo-Code
- 源码：src/core/condense/index.ts、src/core/condense/foldedFileContext.ts
- 原始地址：https://github.com/RooCodeInc/Roo-Code/blob/main/src/core/condense/index.ts
- 机制：大文件上下文先折叠再压缩，避免把未读长文件整段送进模型。
- 应用对账：编辑器长文档已有虚拟化与 outline，但 Agent 读上下文时缺少折叠视图。
- 采纳：采纳。Agent 读工具默认返回结构化摘要 + 可展开原文引用。


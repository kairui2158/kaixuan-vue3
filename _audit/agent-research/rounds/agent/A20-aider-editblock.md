# A20 Aider EditBlock 编辑协议

- 仓库：Aider-AI/aider
- 源码：aider/coders/editblock_coder.py、aider/coders/editblock_prompts.py
- 原始地址：https://github.com/Aider-AI/aider/blob/main/aider/coders/editblock_coder.py
- 机制：编辑输出用固定块格式，解析失败要返回纠错提示，模型可以重试。
- 应用对账：API 直写已有 JSON/原生工具协议，但长文档重排需要 EditTask 分批。
- 采纳：采纳纠错机制，不照搬文本块格式。


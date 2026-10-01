# R08 Aider/LiteLLM 能力表与 reasoning 计入输出

- 仓库：Aider-AI/aider、BerriAI/litellm
- 源码：aider/models.py、litellm/llms/openai/openai.py
- 原始地址：https://github.com/Aider-AI/aider/blob/main/aider/models.py；https://github.com/BerriAI/litellm/blob/main/litellm/llms/openai/openai.py
- 关键证据：Aider 能力来自 LiteLLM，本地缓存 24 小时（aider/models.py:164-219）；`max_completion_tokens` 包含 reasoning tokens（litellm/openai.py:126-160）。
- 机制结论：模型能力不靠手填，靠能力目录 + 缓存；reasoning 是输出预算的一部分。
- 应用对账：`realSkillExecutor.ts:691-723` 的 1.5x 假提升与 reasoning 检测过晚。
- 采纳结论：采纳。模型能力目录进应用，reasoning 早于请求前进入输出上限计算。


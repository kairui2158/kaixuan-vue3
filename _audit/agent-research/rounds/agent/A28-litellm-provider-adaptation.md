# A28 LiteLLM 供应商适配层

- 仓库：BerriAI/litellm
- 源码：litellm/llms/openai/openai.py
- 原始地址：https://github.com/BerriAI/litellm/blob/main/litellm/llms/openai/openai.py
- 机制：不同供应商参数差异在适配层收敛，不散落在业务层。
- 应用对账：应用已有 providerProtocols/providerAdapter，但 max tokens 语义仍混在业务层。
- 采纳：采纳。Agent 只消费统一请求接口，供应商差异收敛到 adapter。


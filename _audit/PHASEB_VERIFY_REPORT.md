# Phase B 验证报告（真实行为 / CDP）

## 结论

**全部 32 项通过，Phase B 分层执行模式接入与引擎统一消费验证完成**

## 验证摘要

| 指标 | 值 |
|------|-----|
| 通过 | 32 |
| 失败 | 0 |
| 运行应用 | file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html |
| 验证方式 | CDP 连接源 Electron，真实点击 5 层、逐层切换模式、读写持久化与 Pinia |

## 逐项结果

| 步骤 | 结果 | 详情 |
|------|------|------|
| B1.0 页面+引擎挂载 | PASS | {"title":"神意助手","hasEngine":true,"engineMethods":["chain","splitMerge","multiStep","getAutoValidators","_splitText","_parallelMap","_extractFirstSubject"]} |
| B2.1.0 层级1 模式下拉可见 | PASS | #pl-s1-mode |
| B2.1.1 选项包含 split-merge/multi-step | PASS | options=compose / chain / split-merge / multi-step step=0 |
| B2.1.2 split-merge DOM+持久化 | PASS | dom=split-merge stored={"0":"split-merge","1":"compose","2":"chain","3":"chain","4":"compose"} |
| B2.1.2 multi-step DOM+持久化 | PASS | dom=multi-step stored={"0":"multi-step","1":"compose","2":"chain","3":"chain","4":"compose"} |
| B2.1.3 恢复原模式 | PASS | dom=compose stored={"0":"compose","1":"compose","2":"chain","3":"chain","4":"compose"} |
| B2.2.0 层级2 模式下拉可见 | PASS | #pl-s2-mode |
| B2.2.1 选项包含 split-merge/multi-step | PASS | options=compose / chain / split-merge / multi-step step=1 |
| B2.2.2 split-merge DOM+持久化 | PASS | dom=split-merge stored={"0":"compose","1":"split-merge","2":"chain","3":"chain","4":"compose"} |
| B2.2.2 multi-step DOM+持久化 | PASS | dom=multi-step stored={"0":"compose","1":"multi-step","2":"chain","3":"chain","4":"compose"} |
| B2.2.3 恢复原模式 | PASS | dom=compose stored={"0":"compose","1":"compose","2":"chain","3":"chain","4":"compose"} |
| B2.3.0 层级3 模式下拉可见 | PASS | #pl-s3-mode |
| B2.3.1 选项包含 split-merge/multi-step | PASS | options=chain / split-merge / multi-step / compose step=2 |
| B2.3.2 split-merge DOM+持久化 | PASS | dom=split-merge stored={"0":"compose","1":"compose","2":"split-merge","3":"chain","4":"compose"} |
| B2.3.2 multi-step DOM+持久化 | PASS | dom=multi-step stored={"0":"compose","1":"compose","2":"multi-step","3":"chain","4":"compose"} |
| B2.3.3 恢复原模式 | PASS | dom=chain stored={"0":"compose","1":"compose","2":"chain","3":"chain","4":"compose"} |
| B2.4.0 层级4 模式下拉可见 | PASS | #pl-s4-mode |
| B2.4.1 选项包含 split-merge/multi-step | PASS | options=chain / split-merge / multi-step / compose step=3 |
| B2.4.2 split-merge DOM+持久化 | PASS | dom=split-merge stored={"0":"compose","1":"compose","2":"chain","3":"split-merge","4":"compose"} |
| B2.4.2 multi-step DOM+持久化 | PASS | dom=multi-step stored={"0":"compose","1":"compose","2":"chain","3":"multi-step","4":"compose"} |
| B2.4.3 恢复原模式 | PASS | dom=chain stored={"0":"compose","1":"compose","2":"chain","3":"chain","4":"compose"} |
| B2.5.0 层级5 模式下拉可见 | PASS | #pl-s5-mode |
| B2.5.1 选项包含 split-merge/multi-step | PASS | options=compose / chain / split-merge / multi-step step=4 |
| B2.5.2 split-merge DOM+持久化 | PASS | dom=split-merge stored={"0":"compose","1":"compose","2":"chain","3":"chain","4":"split-merge"} |
| B2.5.2 multi-step DOM+持久化 | PASS | dom=multi-step stored={"0":"compose","1":"compose","2":"chain","3":"chain","4":"multi-step"} |
| B2.5.3 恢复原模式 | PASS | dom=compose stored={"0":"compose","1":"compose","2":"chain","3":"chain","4":"compose"} |
| B3.1 Pinia 状态读取 | PASS | {"currentStep":4,"providerCount":2,"preferredProvider":{"id":"prv_msjcwbhl_2i62p4","name":"全局","baseUrl":"https://openapi.cloud-ai.cn/v1","apiKey":"REDACTED","models":["deepseek-v4-flash","deepseek-v4-flash-free","deepseek-v4-flash-test","deepseek-v4-flash-xf","deepseek-v4-pro","deepseek-v4-pro-test","deepseek-v4-pro-tg","doubao-seed-2.1-pro","doubao-seed-2.1-pro-test","doubao-seed-2.1-turbo","doubao-seed-2.1-turbo-test","glm-5","glm-5.1","glm-5.1-test","glm-5.2","glm-5.2-test","hy3","kimi-k2.6","kimi-k2.6-test","kimi-k2.7-code","kimi-k2.7-code-test","kimi-k3","kimi-k3-sp","kimi-k3-test","minimax-m3","minimax-m3-test","qwen-3.7-plus","qwen-3.7-plus-test","qwen-3.8-max-sp"],"purpose":"generate","streamMode":true,"temperature":0.7,"maxTokens":128000,"systemPrompt":"","createdAt":1786132036137,"updatedAt":1786137038668,"selectedModel":"deepseek-v4-pro"},"skillCount":18} |
| B3.2 真实 API 可用配置 | PASS | providerStore.callApi + selectedModel |
| B3.3 真实 API split-merge 执行 | PASS | outputLen=187 head=暮色如一方缓缓研开的陈墨，从旧城墙根风蚀的缝隙里沁出，淹过青石巷口那些被光阴磨圆的棱角。路灯撑起一圈困倦的晕黄，将她的影子抽成一道瘦长的淡墨，在粗粝的石板上颤颤地游移。她忽然顿住脚，听见远处有琴声浮起，泠泠地，像一条浸透了夜露的河，每一个音 reports=1 |
| B3.4 真实 API multi-step 执行 | PASS | calls=3 outputLen=812 head=他缓缓直起身，膝盖在船板上磕得生疼，却顾不上揉。海面平静得像块墨色的玻璃，连浪花都不曾翻起一朵。这不对劲——这片水域从来不会这样静，静得让人心里发毛。  梭子还躺在网绳堆里，他却没去捡。四十年的经验告诉他，有些东西，不该碰的就别碰。可那股子 reports=3 |
| B3.5 引擎 mock 分块编排 | PASS | splitCalls=5 multiCalls=9 multiReports=3 |
| B4.0 验证后状态恢复 | PASS | restoreFailures=0 |

## 层记录

| 层 | 原模式 | 测试点 | 结果 |
|----|--------|--------|------|
| 1 | compose | split-merge | PASS |
| 1 | compose | multi-step | PASS |
| 2 | compose | split-merge | PASS |
| 2 | compose | multi-step | PASS |
| 3 | chain | split-merge | PASS |
| 3 | chain | multi-step | PASS |
| 4 | chain | split-merge | PASS |
| 4 | chain | multi-step | PASS |
| 5 | compose | split-merge | PASS |
| 5 | compose | multi-step | PASS |

## CDP 操作日志

1. `connectOverCDP http://127.0.0.1:9227`
2. `Page ready: file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`
3. `Page.screenshot -> _audit/screenshots/phaseB_r01_initial.png`
4. `evaluate panel visible=true`
5. `Page.screenshot -> _audit/screenshots/phaseB_r02_panel_open.png`
6. `click .pl-steps .pl-step[0] (pipelineStore.setStep)`
7. `selectOption #pl-s1-mode -> split-merge`
8. `Page.screenshot -> _audit/screenshots/phaseB_r01_split-merge.png`
9. `selectOption #pl-s1-mode -> multi-step`
10. `Page.screenshot -> _audit/screenshots/phaseB_r01_multi-step.png`
11. `selectOption #pl-s1-mode -> compose`
12. `click .pl-steps .pl-step[1] (pipelineStore.setStep)`
13. `selectOption #pl-s2-mode -> split-merge`
14. `Page.screenshot -> _audit/screenshots/phaseB_r02_split-merge.png`
15. `selectOption #pl-s2-mode -> multi-step`
16. `Page.screenshot -> _audit/screenshots/phaseB_r02_multi-step.png`
17. `selectOption #pl-s2-mode -> compose`
18. `click .pl-steps .pl-step[2] (pipelineStore.setStep)`
19. `selectOption #pl-s3-mode -> split-merge`
20. `Page.screenshot -> _audit/screenshots/phaseB_r03_split-merge.png`
21. `selectOption #pl-s3-mode -> multi-step`
22. `Page.screenshot -> _audit/screenshots/phaseB_r03_multi-step.png`
23. `selectOption #pl-s3-mode -> chain`
24. `click .pl-steps .pl-step[3] (pipelineStore.setStep)`
25. `selectOption #pl-s4-mode -> split-merge`
26. `Page.screenshot -> _audit/screenshots/phaseB_r04_split-merge.png`
27. `selectOption #pl-s4-mode -> multi-step`
28. `Page.screenshot -> _audit/screenshots/phaseB_r04_multi-step.png`
29. `selectOption #pl-s4-mode -> chain`
30. `click .pl-steps .pl-step[4] (pipelineStore.setStep)`
31. `selectOption #pl-s5-mode -> split-merge`
32. `Page.screenshot -> _audit/screenshots/phaseB_r05_split-merge.png`
33. `selectOption #pl-s5-mode -> multi-step`
34. `Page.screenshot -> _audit/screenshots/phaseB_r05_multi-step.png`
35. `selectOption #pl-s5-mode -> compose`
36. `evaluate Pinia pipeline/provider/skill stores`
37. `evaluate engine.splitMerge(live aiRequest provider=prv_msjcwbhl_2i62p4 model=deepseek-v4-pro)`
38. `Page.screenshot -> _audit/screenshots/phaseB_r_live_splitmerge_result.png`
39. `evaluate engine.multiStep(live aiRequest, calls=3)`
40. `Page.screenshot -> _audit/screenshots/phaseB_r_live_multistep_result.png`
41. `evaluate engine.splitMerge/multiStep with mock aiRequest`
42. `Page.screenshot -> _audit/screenshots/phaseB_r_final_restored.png`
43. `Browser.close`

## 截图

- _audit/screenshots/phaseB_01_initial.png
- _audit/screenshots/phaseB_02_pipeline_open.png
- _audit/screenshots/phaseB_r01_initial.png
- _audit/screenshots/phaseB_r01_multi-step.png
- _audit/screenshots/phaseB_r01_split-merge.png
- _audit/screenshots/phaseB_r02_multi-step.png
- _audit/screenshots/phaseB_r02_panel_open.png
- _audit/screenshots/phaseB_r02_split-merge.png
- _audit/screenshots/phaseB_r03_multi-step.png
- _audit/screenshots/phaseB_r03_split-merge.png
- _audit/screenshots/phaseB_r04_multi-step.png
- _audit/screenshots/phaseB_r04_split-merge.png
- _audit/screenshots/phaseB_r05_multi-step.png
- _audit/screenshots/phaseB_r05_split-merge.png
- _audit/screenshots/phaseB_r_final_restored.png
- _audit/screenshots/phaseB_r_live_multistep_result.png
- _audit/screenshots/phaseB_r_live_splitmerge_result.png

## 代码证据

- `src/components/pipeline/PipelinePanel.vue` 5 层模式下拉：`#pl-s1-mode` ~ `#pl-s5-mode`，含 `compose/chain/split-merge/multi-step`
- `runStepSkills` 对 split-merge/multi-step 调用 `window.SkillExecutionEngine`（同文件约 773-802 行）
- `getStepSkillTemplates` 返回该层全部 Skill 模板并 join；compose 模式一次性注入全部模板
- `src/components/chat/ChatPanel.vue` 按 `skill.executionMode` 消费 `engine.splitMerge / multiStep / chain`（约 338-375 行）
- `dist-renderer/skill-engine.js` 导出 `chain/splitMerge/multiStep` 并暴露 `window.SkillExecutionEngine`
- 模式持久化键：`wa_pipeline_step_config.modes`，由 `saveStepConfig()` 写入

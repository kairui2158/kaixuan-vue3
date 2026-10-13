# 任务台账：P1-E 卷契约语义扩充

## 1. 目标与原话

- 用户指令：“确认执行下一个阶段”“完成后自动进入下一个阶段”；方案阶段为 `PROPOSAL_2026-10-13_OH_STORY_ADOPTED_UPGRADE_PLAN.md` 的 P1-E。
- 目标行为：卷契约增加读者期待、主推线、解锁里程碑、禁碰终局底牌、契约风险五类语义；生成、闭包、正文执行、审查四侧消费同一契约对象；提前揭示禁区必须被报告，正常推进不得误报。
- 明确禁止：引入 ask_author、预览、阻塞确认状态；契约审查不得拦截写入或追加请求。
- 交付物：契约语义类型与提取/校验、卷生成协议、闭包禁区合并、正文执行包禁区块、确定性审查器、`contract_review` trace 事件、专项单测、Electron 双 Case 验证器与证据、DEV_LOG、本台账、3.86.0 封装。

## 2. 门禁读证

- G0.1 目标对齐：实现覆盖方案 7.1-7.3 的字段扩充、闭包禁区、正文 prompt、三态审查与验收样本。
- G0.3 诚实闭环：登记 wiring 首断言 `indexOf` 假绿风险、揭示词表首版采样、本地 provider 边界、质量收益未验证。
- G0.6 成熟度：字段链路、审查链路、观测与 Electron 验证为“成熟”；真实长期项目暗示式剧透分布未采样，登记为后续校准项。
- G0.8 任务收尾清理：3.85.0 旧产物与一次性 profile 已删除，dist 只留 3.86.0。
- G0.10 新旧并存清零：新增字段向后兼容；卷写入两处均接入同一提取函数；无旧审查或旧禁区提示词并存路径。
- G0.11 真实交互冒充禁令：可见 Electron、真实 UI 点击、本地 HTTP provider；不注入 DOM，不注入“SKILL 已加载”。
- G0.12 门禁执行台账：本文件。
- G1.11 测试契约：wiring 断言从 `indexOf` 修正为全局计数，防止第二处接线缺失假绿。
- G2.9 终稿与流水线：契约审查只报告不阻塞，终态仍由原文持久化与硬信号网决定。

## 3. 路由判定

- 加入：G0.1、G0.3、G0.6、G0.8、G0.10、G0.11、G0.12；实现与验证阶段使用 G1.4、G1.5、G1.7、G1.8、G1.11、G1.13。
- 排除 G0.2：用户为无预算模式，未创建 goal，未设置 token 预算。
- 排除 G1.19：本阶段无性能优化声明；两 Case requestCount 均为 1，仅作为“审查不额外发请求”的功能证据。
- 经验文件未新增门禁：本轮失败类型（断言工具误用、词表采样边界）已被 G1.11 与 G1.5 覆盖，P1-D 同样未新增经验条目；避免为同款教训重复立规。

## 4. 影响圈与作者反证

- 已改面：卷契约类型与校验、卷批次 prompt、上下文闭包、章节执行包、PipelinePanel 卷写入与正文生成链路、runTrace 事件。
- 可能被误伤面：旧项目无语义字段、模型输出非法 `contractRisk`、正文正常提到禁区相关概念但未揭示、闭包内已有禁止行。反证方式分别是 `[待补充]` 占位与校验错误、非法枚举报错、显式揭示词 + 80 字窗口、`mergeForbiddenCards` 去重合并。
- 最容易错的假设：“wiring 测试包含目标字符串即证明两处都接线”。反证证据是 `indexOf` 只证明首个匹配；改为全局计数后才能同时约束 `PipelinePanel.vue:3820` 与 `:3849`。
- 第二个高危假设：“审查发现 broken 就应拦截”。本阶段按用户禁令反证：只写 `contract_review` 事件与 level，不改运行状态，两个 Electron Case requestCount 均为 1。

## 5. 停止条件

- 完成：专项 6 files / 65 tests、全量 159 files / 1882 tests、type-check、完整 build、3.86.0 打包验证、Electron 双 Case、文档与方案状态收口、旧产物清理。
- 失败：正常推进被误报 broken；提前揭示未被报告；审查引发额外物理请求或阻塞状态；非法 `contractRisk` 被静默接受；两处卷写入任一未提取语义字段；任一命令 exit 非 0。

## 6. 执行证据

- 语义字段与提取：`src/services/volumeGenerationContract.ts:16`、`src/services/volumeGenerationContract.ts:55`、`src/services/volumeGenerationContract.ts:80`。
- 生成协议：`src/services/volumeBatchOrchestrator.ts:50`-`54`，三处 prompt 消费 `VOLUME_OUTPUT_PROTOCOL`。
- 闭包禁区合并：`src/services/outlineContextScope.ts:69`、`src/services/outlineContextScope.ts:429`。
- 正文执行禁区块：`src/services/chapterExecutionPackage.ts:157`-`158`。
- 确定性审查：`src/services/contractReview.ts:29`，`contract_broken` 判定在 `src/services/contractReview.ts:62`。
- Pipeline 接线：`src/components/pipeline/PipelinePanel.vue:3820`、`:3849`、`:4175`、`:4197`、`:4300`-`:4311`。
- wiring 反假绿断言：`src/services/contractSemanticsWiring.spec.ts:8`。
- 专项命令：`npm run test:services -- contractSemanticsWiring contractReview volumeGenerationContract outlineContextScope chapterExecutionPackage volumeBatchOrchestrator` → 6 files / 65 tests passed。
- 全量命令：`npm run test:services` → 159 files / 1882 tests all passed。
- Electron 证据：`_audit/verification-contract-semantics-electron/report.json:1`；normal 为 success / `contract_safe` / 1 request，early reveal 为 success / `contract_broken` / 1 request。

## 7. 缺口清单

- 暗示式剧透（不使用显式揭示词）仍可能漏报；揭示词表与窗口需要真实项目持续采样后再扩展。
- 本轮 provider 为本地 OpenAI-compatible 服务；外部 live 供应商下生成侧字段完整度未重新采样。
- 生成质量提升未做人工评分或对比阅读对账，方案对账表中标注“未验证”。
- 方案第 2 节剩余阶段均已按当前状态标注完成；若用户开启后续阶段，应先基于新运行记录立项，不在本阶段夹带新改动。

## 8. 封装证据

- 版本：`package.json:3`、`package-lock.json:3`、`package-lock.json:9` 均为 3.86.0；`npm install --package-lock-only` 本轮执行并同步 lock。
- `npm run build`：exit 0；产物 `dist/神意助手-Setup-3.86.0.exe`，231,529,296 bytes，SHA256 `aa4427b9c78ebbebea0afc2ebc662565ac5140efdc3f4844470604ed4acf7519`。
- asar：`version=3.86.0`，`name=shenyi-assistant`，`main=electron/main.js`，renderer 74 files，`electronAPI` 77 methods，真实启动渲染通过。
- 旧 3.85.0 安装包与 blockmap 已删除；`_data/contract-semantics-profile` 已删除。

## 9. 最终工作区口径

- 源码、测试、验证脚本、`_audit` 证据与文档全部属于 P1-E。
- 一次性 Electron profile 已清理；保留验证脚本与证据目录供复跑和审计。

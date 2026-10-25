# TASK_LEDGER 2026-10-26 Experience File V9.4 Update

## 1. 目标与原话

- 用户原话：`经验文件进行总结教训和更新门禁`。
- 最终可感知行为：经验文件升级 v9.4.0，3.108.0 两处用户实测回归被提炼为可执行门禁，并完成引入点追账、DEV_LOG、台账、索引与项目记忆指针更新。
- 本轮交付物：v9.4.0 经验文件、本轮 DEV_LOG、G0.12 台账、总索引登记、STACK 规则源指针更新、工作区干净收口。

## 2. 门禁读证

- G0.1：`每轮任务先复述原始目标与最终可感知行为；执行中偏离目标必须显式登记原因。`
- G0.3：`完成声明必须区分已验证、未验证、无法验证、历史证据保留。`
- G0.4：`动手前复读最新 DEV_LOG 与本文件相关层级；修复后回写 DEV_LOG 与经验。`
- G0.5：`每次任务收尾前必须执行回头看：对账原始目标、逐行审 diff、盘点生产入口与旁路、双向扫描生产与验证器、核对日志与测试证据、核对本轮证据真实属于本轮。`
- G0.8：`任务完成声明前必须分层清理：可再生成旧产物、临时探针、解包残留、旧安装产物、blockmap。`
- G0.9：`动手前先列“打算改的”和“可能碰到的”；未列入影响圈的不碰。`
- G0.12：`所有非平凡任务必须产出任务台账，写入 _audit/TASK_LEDGERS/ 并由当轮 DEV_LOG 链接。`
- G1.5：`用户报告的 UI 失效必须先定位到真实失效区域再设计验证`，本轮将其升级为发布回归与引入点追账契约。
- G1.12：`先核验新安装包再删旧产物`，本轮新增发布前用户可见回归面最小矩阵。
- G1.16：经验回写需回放事实因果，本轮回放 3.108.0 事故、3.108.1 修复与 Git 引入点。

## 3. 路由判定

- 加入：G0.1、G0.3、G0.4、G0.5、G0.8、G0.9、G0.12、G1.5、G1.12、G1.16。
- 排除：
  - G0.11 真实交互冒充禁令：本轮无 UI 行为验证目标，不执行 Electron 操作。
  - G1.4 验证真实性与分层：本轮无产品行为分层验证；只验证文档内容、版本、唯一性与 Git 收口。
  - G1.10 权限与安全门：本轮不改执行协议、权限或工具面。
  - G1.13 Electron 验证执行标准：本轮不启动 Electron。
  - G2 领域门禁：本轮不触碰直写、流水线、供应商、存储等领域实现。

## 4. 影响圈与作者反证

- 打算改：经验文件、STACK 规则源指针、本轮 DEV_LOG、本轮台账、总索引。
- 可能碰到：
  - 旧版经验文件并存导致规则源漂移。
  - 总索引或 STACK 指针仍指向 v9.3.0/v9.0.0。
  - 引入点被误写成事实。
- 最可能错假设与证伪：
  - “导出缺陷由 3.108.0 引入”：`git show e3abea2c` 显示 Worker 导出与静默失败路径在 3.106.0 已存在，证伪该假设。
  - “滚动缺陷由单次 V6.3 提交引入”：`64760cf3` 与 `b9d36d4c` 的 `OutlineWorkspace.vue` 均已有 `.ow-messages overflow: hidden` 与自动拉底，证伪单点引入；登记为引入点未定位。

## 5. 停止条件

1. 经验文件头部为 `v9.4.0`，更新日期为 `2026-10-26`。
2. G1.5 含发布前回归、历史可用入口、引入点追账与“引入点未定位”登记要求。
3. G1.12 含用户可见回归面最小矩阵与再发布追加原事故路径。
4. `_audit` 中 `神意开发经验总结*.md` 只有一份。
5. 本轮 DEV_LOG、七节台账、总索引登记齐全，STACK 指向 v9.4.0。
6. `git diff --check` 通过。
7. 提交后 `git status --short` 为空。

## 6. 执行证据

- [神意开发经验总结_v9.md](/d:/codex/novel-workshop-vue3/_audit/神意开发经验总结_v9.md:3) 头部为 v9.4.0。
- G1.5 新增发布前回归与引入点追账段落；G1.12 新增用户可见回归面最小矩阵段落。
- [STACK.md](/d:/codex/novel-workshop-vue3/STACK.md:27) 唯一规则文件指针为 v9.4.0。
- [DEV_LOG_2026-10-26_EXPERIENCE_FILE_V9_4_UPDATE.md](/d:/codex/novel-workshop-vue3/_audit/DEV_LOG_2026-10-26_EXPERIENCE_FILE_V9_4_UPDATE.md:1) 与本台账齐备。
- 总索引新增本轮条目并链接本 DEV_LOG。
- `git show e3abea2c:src/services/runTraceExportWorkerService.ts` 证明 Worker `postMessage` 未处理 reactive proxy；`git show e3abea2c:src/components/common/RunTracePanel.vue` 证明静默 `console.warn` 路径。
- `git show 64760cf3:src/components/common/OutlineWorkspace.vue` 与 `git show b9d36d4c:src/components/common/OutlineWorkspace.vue` 均存在 `.ow-messages overflow: hidden`，滚动缺陷登记为引入点未定位。

## 7. 缺口清单

- 已闭环：门禁语义、版本号、索引、台账、DEV_LOG、STACK 指针、Git 提交与工作区收口。
- 未验证面：本轮不运行生产测试、构建与打包；产品修复证据沿用 3.108.1 既有 DEV_LOG。
- 遗留项：滚动缺陷首次引入提交未定位；已按 G1.5 显式登记，不作为未收口项隐藏。

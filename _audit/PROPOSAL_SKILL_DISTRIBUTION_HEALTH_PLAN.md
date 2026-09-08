# 技能分发与质量层升级方案（审核稿）

版本：v1.0  
日期：2026-09-07  
状态：待审核，未执行任何源码修改  
目标版本：实现后建议从 3.27.0 升级为 3.28.0（新功能 minor）  

## 1. 背景与定位

真 SKILL 底座已经完成：应用可以加载文件夹技能、执行脚本钩子、组合父子技能、走 schema 校验和重试。现在最大的缺口不在“执行能力”，而在“分发与质量”：

1. 第三方作者打包后，用户只能收到一个文件夹，用户需要手动放到本机某个位置再到应用里选择导入。
2. 没有压缩包导入，也没有统一的技能安装目录。
3. 没有版本比较、依赖声明、包完整性校验和技能健康报告。
4. 插件市场页只是一个 GitHub 搜索壳，点击“安装”后没有实际安装链路。

用户侧事实是：大多数用户会从第三方下载现成技能，不会自己制作。因此本方案优先做“可靠导入、可诊断、可升级、可回滚”，不做完整表单制作器，不做账号和付费市场。

## 2. 当前源码对账

### 2.1 已有能力

- 文件夹技能入口：`SKILL.md`、`template.md`、`meta.json`、`script.js`、`samples.txt`、`schema.json`。见 `electron/ipc/skill-loader.js:6-7`。
- 文件夹读取与 IPC：`skill:loadFolder`、`skill:listFolders`、`skill:executeScript`。见 `electron/ipc/skill-loader.js:198-206`。
- 前端导入入口：`SkillSettings.vue` 的“导入配置”和“导入文件夹技能”。见 `src/components/settings/SkillSettings.vue:7-9`、`src/components/settings/SkillSettings.vue:333-343`。
- JSON/Markdown 导入导出：`importSkillsFromFile()`、`applySkillImport()`、`exportAllSkillsJSON()`。见 `src/composables/useConfigExchange.ts:186-287`。
- 技能持久化字段：`format`、`folderPath` 已入 store。见 `src/stores/skill.ts:11-12`。
- 脚本沙箱：无 require、无 process、5 秒超时。见 `electron/ipc/skill-loader.js:100-186`。

### 2.2 缺口

1. **无压缩包导入**：全仓库没有面向技能包的 zip 解包 IPC。`src/services/file-import.ts` 的 docx/epub 读取是文档导入专用，不适合复用。
2. **无统一技能安装目录**：`folderPath` 记录的是用户导入时的任意本机路径，用户移动或删除文件夹后只能“重新选择文件夹”。
3. **无版本语义**：`SkillRecord` 没有 `version`、`minAppVersion`、`dependencies` 字段，导入只有 `skip/overwrite`，无法判断升级、降级或兼容性。
4. **无包完整性**：没有 manifest、hash、文件清单校验，第三方包缺文件或被改动时只能等运行时失败。
5. **健康检查不完整**：设置页只做“路径有效/失效”探测。见 `src/components/settings/SkillSettings.vue:531-544`。没有模板变量、脚本钩子、schema、执行预算的完整诊断。
6. **市场不可安装**：`PluginMarket.vue` 点击安装只派发 `plugin-install` 事件。见 `src/components/common/PluginMarket.vue:163-164`。全仓库无监听者。
7. **不能直接依赖锁文件里的包**：`package-lock.json` 中存在 `archiver`、`zip-stream`、`yauzl`、`semver`，但它们是 Electron 打包链路的传递依赖，不是应用直接依赖，不能在源码中直接引用。

## 3. 社区机制映射

| 社区机制 | 对我们的启发 | 采纳方式 |
|---|---|---|
| Agent Skills 的 `SKILL.md` + YAML frontmatter | 以入口文件声明 `name/description/version/compatibility`，渐进加载 | 保留现有 `SKILL.md`，升级为可校验 manifest |
| VS Code 插件 manifest | `name/version/publisher/engines/dependencies/capabilities` 明确兼容与依赖 | 引入 `skill-package.json`，先做最小字段 |
| Obsidian 社区插件目录 | 目录只存轻量元数据，安装时再拉 manifest | 第一版做本地目录，联网市场后置 |
| npm semver | 版本比较、范围匹配、升级/降级提示 | 实现内部 semver 子集，不先加依赖 |
| `skills-ref validate` | 作者发布前可自查 | 提供本地“技能体检”入口和第三方校验规范 |

## 4. 目标架构

### 4.1 技能包格式

第一版 `.zip` 包结构：

```text
skill-name/
  SKILL.md
  template.md
  meta.json
  schema.json
  samples.txt
  script.js
  skill-package.json
```

`skill-package.json` 最小字段：

```json
{
  "schema": "shenyi.skill-package/1",
  "id": "xuanwu-volume",
  "name": "玄武卷纲解析",
  "version": "1.0.0",
  "minAppVersion": "3.28.0",
  "author": "第三方作者名",
  "description": "技能用途",
  "entry": "SKILL.md",
  "files": ["SKILL.md", "template.md"],
  "capabilities": ["script", "schema", "samples"],
  "dependencies": []
}
```

规则：

1. 缺 `skill-package.json` 时仍可导入，但标记为“兼容包”，提示无法做版本管理和完整性校验。
2. `files` 声明的文件必须存在；未声明但存在的文件列出为附加文件。
3. `minAppVersion` 高于当前版本时阻止导入，给出明确原因。
4. `dependencies` 第一版只提示缺失，不自动联网安装。

### 4.2 统一安装目录

新增用户级技能库目录，例如：

```text
userData/skills/<skillId>/<version>/
```

导入 zip 后：

1. 解包到临时目录。
2. 校验 manifest、入口文件、必备文件。
3. 通过后复制到技能库。
4. 写入 `SkillRecord.folderPath` 指向安装目录。
5. 原来的“任意本机文件夹导入”继续保留，标记为外部技能。

这样第三方包不再依赖用户桌面的某个文件夹，迁移和重装项目时技能也可恢复。

### 4.3 分层边界

| 层 | 职责 |
|---|---|
| Electron 层 | zip 解包、安全路径约束、复制、删除、计算 hash |
| 服务层 | manifest 校验、semver 子集、导入计划、健康检查 |
| Store 层 | 技能记录、版本、安装来源、升级状态 |
| UI 层 | 导入预览、体检报告、版本冲突提示、市场入口 |

不在渲染进程直接访问文件系统，所有文件操作走 IPC，沿用现有安全边界。

## 5. 执行计划

### P0 冻结基线与影响圈

任务：

1. 记录当前版本 `3.27.0`、测试命令和工作区状态。
2. 明确本轮只新增分发与质量层，不修改执行器语义。
3. 列出禁改文件：`realSkillExecutor.ts`、`skillOrchestrator.ts`、`skillRouter.ts` 的现有行为只读。

验收：

- 方案、测试命令、禁改清单齐备。
- 不碰无关历史改动。

### P1 manifest 与 semver 子集

任务：

1. 新增 `SkillPackageManifest` 类型与校验器。
2. 实现 semver 子集：解析、比较、`minAppVersion` 判断。
3. 增加 `skill-package.json` 单元测试：合法、缺字段、非法版本、版本过高。

验收：

- `npm run test:services` 新增用例全过。
- 不引入新依赖。

### P2 压缩包导入底座

任务：

1. 新增 Electron IPC：选择 zip、安全解包到临时目录、返回文件清单。
2. 解包限制：单文件上限、总大小上限、路径穿越拒绝、条目数上限。
3. 不直接使用锁文件里的传递依赖；如需依赖，先在方案中单独立项审核。
4. 服务层根据 manifest 生成导入计划。

验收：

4. 正常包可解析。
5. 路径穿越包、超大包、无 `SKILL.md` 包全部被拒绝并给出中文错误。

### P3 统一技能库与安装流程

任务：

1. 新增技能库目录管理。
2. 解包通过后复制到 `skills/<id>/<version>`。
3. `SkillRecord` 增加 `version`、`installedPath`、`source`、`packageHash`。
4. 旧数据无版本时按 `0.0.0` 或“未标注”处理，不迁移用户文件。

验收：

1. 导入后重启，技能仍可用。
2. 同 id 不同版本可提示“升级/保留/覆盖”。
3. 旧 folder 技能不受影响。

### P4 技能健康检查

任务：

1. 新增体检服务，输出分级诊断：error、warning、info。
2. 检查项：
   - `SKILL.md` 是否有 `id/name/description`
   - `template.md` 是否存在且非空
   - 模板变量是否超出应用可提供上下文
   - `meta.json`、`schema.json` 是否有效
   - `script.js` 是否导出合法钩子
   - `samples.txt` 是否为空
   - manifest 与实际文件是否一致
3. 设置页技能卡片增加“体检”按钮和报告弹窗。

验收：

1. 健康技能显示全部通过。
2. 缺 schema、脚本无导出、模板空、路径失效均能定位到具体文件。

### P5 本地市场与目录

任务：

1. 把现有插件市场改造为两层：
   - 本地已安装目录：默认视图，可升级、删除、体检。
   - GitHub 搜索视图：保留搜索，但“安装”第一版降级为“打开仓库”。
2. 删除无消费方的 `plugin-install` 假安装事件。
3. 为后续联网市场预留 manifest URL，不在本轮实现自动下载。

验收：

1. 用户不再遇到“点击安装无结果”的假功能。
2. 本地目录能完整展示已安装技能和版本。

### P6 导出、回滚与验证

任务：

1. 技能导出支持生成 zip。
2. 导入前生成导入预览：新增、升级、降级、冲突、兼容包。
3. 升级前保留旧版本目录，提供“回退此版本”。
4. 回归验证：
   - `npm run type-check`
   - `npm run test:services`
   - `npm run build:vue`
   - 源应用启动后真实导入合法包、坏包、兼容包
   - 重启后技能库仍存在
5. 更新开发经验 V2 与开发日志。

验收：

1. 全部命令有原始输出证据。
2. 真实 UI 操作有截图或操作记录。
3. 坏包不污染技能库。
4. 旧技能导入、流水线执行、主页共创、大纲工作台无回归。

## 6. 不做的事情

1. 不做账号、登录、云同步、付费市场。
2. 不做完整表单式技能制作器。
3. 不做自动联网下载第三方依赖。
4. 不重构现有真 SKILL 执行器。
5. 不在第一版引入签名体系；先用 manifest + hash + 健康检查建立基础质量层。

## 7. 风险与回滚

| 风险 | 缓解 |
|---|---|
| zip 解包引入安全漏洞 | 只在主进程解包，路径白名单、大小上限、拒绝绝对路径和 `..` |
| 旧技能数据兼容问题 | 新字段全部可选，旧记录不迁移 |
| 技能库目录被用户误删 | 健康检查提示路径失效，保留外部文件夹导入 |
| 版本比较实现错误 | 只实现 semver 子集并全部单测覆盖 |
| 市场改造影响设置页 | P5 独立提交，可整体回滚 |

回滚策略：每个 P 阶段独立改动；P2/P3 失败时保留现有 JSON/Markdown/文件夹导入不动，用户仍可回退到旧导入方式。

## 8. 交付物

1. zip 技能包导入导出。
2. `skill-package.json` 协议与校验器。
3. 统一技能库与版本记录。
4. 技能健康检查报告。
5. 本地技能目录与诚实化后的市场页。
6. 更新后的经验文件和开发日志。


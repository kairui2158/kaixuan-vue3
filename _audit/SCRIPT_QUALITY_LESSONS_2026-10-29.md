# 脚本质量全量复盘（2026-10-29）

> 结论：这不是“某几个脚本写得不好”的问题，而是脚本长期被当成一次性手段而不是交付物管理的问题。仓库内现存 704 个脚本、204,305 行；历史会话中可疑脚本事件 16,526 条；10-29 junction 事故证明，一个没有哈希对账、没有回滚、没有异常恢复的脚本，足以让 Codex 会话整体不可恢复。

## 全量范围与口径

用户要求“不要抽样，要全量分析”。本轮没有从若干失败案例外推结论，而是先建立三层数据源，再对每层做全量统计。

| 数据面 | 全量口径 | 证据 |
|---|---:|---|
| 会话物理文件 | 479 个：`C:\Users\凯瑞\.codex\archived_sessions` 121、`C:\Users\凯瑞\.codex\sessions` 127、`D:\codex\_codex_history_backup` 231 | `_audit/script-quality-audit-20261029/session-inventory-full.json` |
| 唯一会话 | 231 个唯一文件名。D 盘备份与 C 盘存在同名重复，同一会话禁止重复计数 | 同上，`name` 字段去重 |
| 已统计会话文件 | 235 个：230 个常规会话 + 5 个巨型会话 | `session-stats.json` + `large-session-stats.json` |
| 工具调用 | 449,106 次（常规 139,916 + 巨型 309,190） | 两份 stats 的 `functionCalls` 求和 |
| exec 调用 | 143,235 次（全部来自 5 个巨型会话；常规 stats 无该字段，禁止与巨型口径相加后宣称“全量 exec”） | `large-session-stats.json` 的 `execCalls` 求和 |
| 脚本命令 | 46,679 条（常规 13,261 + 巨型 33,418） | 两份 stats 的 `scriptCommands` 求和 |
| 错误/非零输出 | 116,577 条（常规 34,284 + 巨型 82,293） | 两份 stats 的 `toolErrors` 求和 |
| JSONL 解析失败 | 11 条（全部在 5 个巨型会话：6 + 1 + 3 + 1 + 0） | `large-session-stats.json` 的 `parseErrors` |
| 可疑脚本事件 | 16,526 条 | `pattern-summary.json` 的 `eventCount` |
| 仓库脚本 | 704 个 / 8,117,974 bytes / 204,305 行 | `repo-scripts.json` |
| 仓库脚本分类 | production 481、verification 147、audit-legacy 29、operational 20、research-diagnostic 16、benchmark-probe 6、cleanup 5 | `repo-scripts.json` 按 `category` 分组 |
| 版本化脚本 | 54 个文件名含版本号、阶段号或日期版本。其中 `verify-packaging-3-*` 31 个、`verify-installer-3-*` 3 个 | `repo-scripts.json` 文件名实测；旧口径 31/32 只覆盖部分模式，不得引用 |

巨型会话必须单列，因为旧审计脚本自己就有坏模式：`_audit/tmp-full-script-audit.mjs:70`、`:110` 用 `readFile(file, 'utf8').catch(() => '')` 读文件。超过 2GB 的会话读取失败后变成空字符串，于是被旧 `summary.json` 误报成 1 行 / 0 调用。这不是数据缺失，是审计仪器把失败吞掉了。本轮改用 `tmp-full-script-audit-large.mjs` 单独统计巨型会话。

5 个巨型会话实测：

| 日期 | bytes | 行数 | 调用 | exec | 脚本命令 | 错误 |
|---|---:|---:|---:|---:|---:|---:|
| 2026-09-18 | 3,217,293,095 | 436,008 | 79,990 | 67,770 | 14,301 | 31,914 |
| 2026-10-14 | 1,500,783,384 | 191,801 | 34,348 | 31,102 | 7,278 | 15,751 |
| 2026-08-19 | 902,670,755 | 309,609 | 59,645 | 43,159 | 11,542 | 18,239 |
| 2026-08-10 | 811,274,816 | 355,484 | 70,417 | 1,204 | 297 | 8,936 |
| 2026-07-06 | 669,284,662 | 309,319 | 64,790 | 0 | 0 | 7,453 |

## 失败模式全量计数

以下计数来自 `pattern-summary.json`，事件源为 `session-script-events.jsonl` + `large-session-script-events.jsonl` 的全量合并。

| 模式 | 次数 | 为什么危险 |
|---|---:|---|
| `node-inline-eval` | 5,182 | 大段 JS/JSON/正则被压进命令行，引号与转义脆弱，失败后只能靠肉眼重建 |
| `set-content` | 1,306 | 常被用来绕过 `apply_patch`，临时落盘后无人负责生命周期 |
| `powershell-here-string` | 1,173 | 嵌套引号和换行成为主力失败源 |
| `remove-item` | 1,155 | 删除动作高频出现，路径守卫却不是每条都有 |
| `fixed-sleep` | 939 | 固定等待被当成同步机制，掩盖真实事件与竞态 |
| `kill-process` | 643 | 强杀进程会切断 Electron、API 流、Codex 自身 |
| `tmp-script` | 499 | 临时脚本被当成正式验证器反复新建 |
| `cmd-shell-bridge` | 460 | 跨 shell 桥接削弱路径与删除边界 |
| `recursive-delete` | 364 | 一旦路径计算错误就是批量破坏 |
| `python-inline-code` | 286 | 与 node inline 同族，问题集中在引号与编码 |
| `copy-item` | 69 | 复制缺少哈希对账时只能证明数量，不能证明内容 |
| `line-index-source-edit` | 51 | 用硬编码行号改源码，源文件一变就写错位置 |
| `robocopy` | 16 | 迁移主力，需要明确成功码语义与哈希账本 |
| `file-hash` | 14 | 哈希用得太少，尤其在复制/迁移前后 |
| `junction` | 10 | 本轮事故的最终触发点 |

重复执行最重的命令也证明问题不是偶发：`py -X utf8 D:/codex/玄武规划SKILL/SKILL调试器/static_check.py --layer all --root D:/codex/玄武规划SKILL` 执行 514 次；`rg -n "function latestRun|const latestRun|latestRun =" scripts/verify-api-direct-write-v2-e2e.mjs` 执行 406 次；`node scripts/verify-api-direct-write-v2-e2e.mjs` 执行 69 次。这说明大量验证工作没有沉淀成稳定入口，而是在会话里反复手工拼命令。

## 10-29 junction 事故

事故原始证据在 `D:/codex/_codex_history_backup/sessions/2026/10/29/rollout-2026-10-29T02-01-14-01a183ac-5ef5-7c41-8699-3f726c01af84.jsonl:76`，内容是 `switch-to-root-junction.ps1` 的原始执行回显。现行修正版脚本不得冒充事故原始证据。

该脚本的危险点不是单点语法错误，而是一条完整的脆弱链：

1. 发现 Codex 进程后 `Stop-Process -Force` 强制关闭。
2. `Start-Sleep -Seconds 3` 用固定等待假设进程和文件句柄已经释放。
3. 复制会话后只做数量比较，没有文件级哈希对账。
4. `Rename-Item` 把 C 盘原目录改名。
5. 新建 junction 指向 D 盘。
6. 没有 `try/finally` 清理，没有回滚步骤，没有异常恢复路径。

于是一次中途失败留下的是半迁移状态：部分入口已指向新位置，原目录已改名，Codex 会话无法恢复。事后修复之所以困难，是因为脚本既没有失败前的完整状态账本，也没有失败后的可恢复路径。

## 为什么历史经验没有发现

这不是经验文件完全空白，而是经验文件的覆盖面漏掉了“脚本本身”。

1. **脚本被当作手段，不当交付物。** 704 个脚本、204,305 行，其中 54 个带版本号/阶段号/日期版本，`verify-packaging-3-*` 31 个。这是“每次任务新建、从不收敛”的直接证据。
2. **验证门只验证目标行为，不验证仪器。** G1.5 管验证器事故，但审计脚本、迁移脚本、临时探针经常在“任务工具”的名义下逃逸验证门。审计仪器自己吞错、整读大文件、用固定 sleep，就是系统性盲区的证明。
3. **脚本失败被归因成“手段问题”。** 历史复盘聚焦产品事故、状态机、流水线、API 直写；脚本失败通常只作为过程记录，没有提炼成脚本生命周期规则。
4. **危险动作没有统一门禁。** `Stop-Process`、`Remove-Item -Recurse`、`Rename-Item`、junction、跨盘复制都分散在各任务里各自判断。没有统一要求“先证明可恢复，再执行破坏性动作”。
5. **临时脚本没有命名、落位与清理契约。** `_tmp_` 事件 499 条，说明临时脚本天然容易散落、重复、长期残留。

## 写前三段门禁

### 写前

- 多行脚本、嵌套引号、JSON、正则、PowerShell 变量：禁止 inline 执行，先落成 `.ps1/.py/.mjs` 文件再执行。
- 文件编辑必须优先 `apply_patch`；只有格式化、批量机械改写才允许脚本改文件，且必须先备份或可从 git 恢复。
- 临时脚本命名必须带 `tmp-` 或 `_tmp_`，落位到本轮任务目录；禁止散在仓库根部或生产目录。
- 写脚本前先找同类既有脚本；重复语义超过 3 次时必须收敛为一个稳定入口，禁止继续新增版本化副本。
- 估算数据规模：超过 100MB 的输入必须用流式/分块读取，禁止 `readFile()` 全量整读。

### 执行前

- 每个破坏性动作先列出绝对路径并验证解析结果；递归删除、强杀进程、改名、junction、跨盘复制必须在脚本内做路径守卫。
- 破坏性动作必须有可回滚路径或完整备份；复制/迁移必须以 SHA-256 哈希对账为完成条件，数量比较只能做辅助。
- 固定 sleep 只能用于明确文档化的等待；同步语义必须由事件、退出码、文件状态、进程状态或测试断言承担。
- 脚本必须有显式超时与退出码。失败时输出完整错误和当前阶段，禁止 `catch {}`、`.catch(() => '')`、`ErrorActionPreference SilentlyContinue` 吞掉关键失败。
- 涉及 Codex/Electron/API 流的脚本不得假设“进程退出”等价于“资源已释放”或“任务已结束”。

### 执行后

- `try/finally` 必须负责清理临时文件、子进程、junction、端口与后台服务；清理失败本身要显式报告。
- 验证脚本要验证仪器自身：断言输入文件数、解析失败数、统计字段存在；发现异常缩水时先怀疑审计器，再怀疑数据。
- 执行后输出 before/after：关键文件 hash、目录结构、进程状态、退出码。没有这些证据不得声称迁移、清理或修复完成。
- 临时脚本完成即删除或归档；证据 JSON 可以保留，脚本本体不得以 tmp 名义长期留存。

## 脚本生命周期规范

1. **分类落位**：production / verification / operational / research-diagnostic / benchmark-probe / cleanup / audit-legacy。新脚本必须在创建时确定分类。
2. **复用优先**：同一语义第 3 次出现时，禁止新建第 3 个脚本，必须收敛到稳定入口，用参数承载差异。
3. **版本禁止堆积**：`verify-packaging-3-100-0.mjs` 这类版本化副本应合并为 `verify-packaging.mjs --version 3.100.0`。新增版本化文件名属于新缺陷。
4. **临时脚本三限期**：创建时写清任务、删除时间、是否归档；收尾时必须处理，不允许“先留着以后再删”。
5. **验证器本身要被验证**：任何验证器必须有一条负向测试证明它能在失败数据上失败；吞错、空输入、字段缺失不得产生 PASS。
6. **危险动作白名单化**：强杀进程、递归删除、junction、跨盘迁移、批量重命名属于高危操作，必须先写恢复计划再执行。

## 验证脚本模板骨架

```js
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(process.argv[2] ?? '.');
const START = Date.now();
const log = (phase, data = {}) => {
  console.log(JSON.stringify({ phase, elapsedMs: Date.now() - START, ...data }));
};

const temporary = [];
const childProcesses = [];
let failed = false;

try {
  log('start', { root: ROOT });
  // 1. 输入体检：文件数、关键字段、解析失败数。异常缩水先判仪器。
  // 2. 分阶段执行，每阶段输出计数、hash、耗时、退出码。
  // 3. 断言失败立即 throw，禁止用 warning 吞掉。
} catch (error) {
  failed = true;
  console.error('[script-failed]', error);
  process.exitCode = 1;
} finally {
  for (const proc of childProcesses.reverse()) {
    if (!proc.killed) proc.kill();
  }
  for (const target of temporary.reverse()) {
    fs.rmSync(target, { force: true });
  }
  log(failed ? 'failed' : 'finished');
}
```

骨架本身不复杂，重要的是三件事必须固定下来：阶段日志、`finally` 清理、失败时完整错误加非零退出码。大文件场景把 `readFile` 换成 `createReadStream`/逐行读取；PowerShell 同理用 `Get-Content -ReadCount` 或 .NET 流式 API。

## 覆盖边界

- 本轮只产出复盘文档、经验门禁 G1.21、开发日志、任务台账和索引登记；不改产品源码、不做 git 提交、不封装、不做 live API 验证。
- `D:/codex/_codex_history_backup` 里的历史 JSONL 是证据源，不修改、不清理。
- 11 条 JSONL 解析失败如实登记，不做修复，也不得从总口径中静默剔除。
- `_audit/tmp_verify_restore_ui.cjs` 与 `scripts/verify-outline-legacy-restore-electron.mjs` 是其他任务遗留，本轮不判断、不删除。
- 仓库中 12 个用户改动文件保持原样；本轮只新增 `_audit` 文档并删除 3 个本轮临时审计脚本。

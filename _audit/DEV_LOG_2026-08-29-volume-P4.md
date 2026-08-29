# 卷纲层 P4 开发日志：逐卷绑定章节层

## 任务
卷纲层补"逐卷绑定"闭环：卷对象新增 `isBound`/`boundTo`，卷卡片提供「绑定到章节层/解除绑定」按钮；章节层卷下拉只显示已绑定卷；上游失效时绑定随锁定一起重置；旧格式项目迁移保持行为等价。

## 修改文件
- `src/stores/project.ts`：`loadProject` 归一化卷对象——旧数据无 `isBound` 时按 `confirmed` 派生（已锁卷自动视为已绑定，升级前行为不变）；`boundTo` 默认 `['chapter-layer']`。
- `src/components/pipeline/PipelinePanel.vue`：
  - 卷列表项状态追加"已绑定/未绑定"；
  - 卷卡片操作行新增绑定按钮（未锁卷禁用，title 提示先锁卷）；
  - `toggleVolumeBinding()`：切换绑定并写 `boundTo`、即时存盘；
  - `confirmedVolumes` → `boundVolumes`（filter `isBound`），章节层下拉/空态/`currentVolumeChapters` 全部改按 `isBound` 门槛；
  - `invalidateDownstream` 三处重置同步清空 `isBound/boundTo`，防止草稿卷残留绑定；
  - 章节层卷下拉补稳定 id `#pl-ch-volume-select`。

## 真实验证（CDP + 源文件启动器）
脚本 `_audit/tmp/cdp-p4-verify.js`，首跑 12/15，终跑 **15/15**：
- 生成两卷 → 初始未绑定、未锁卷绑定按钮禁用 → 锁卷后可绑定 → 列表"已锁定·已绑定"；
- 章节层空态消失，卷选项=两卷；存储核对 `isBound:true, boundTo:['chapter-layer']`；
- 解绑卷2 → 章节层选项只剩卷1；
- 旧格式迁移：存储注入无 `isBound` 的 `confirmed:true` 卷 → 重启后 UI 显示"已绑定"。

## 过程教训（重要）
1. **脚本 Promise 陷阱**：`window.electronAPI.storageRead` 返回 Promise，脚本内未 `await` 导致键名拼成 `[object Promise]`——持久化读取为空，且迁移测试写进垃圾键造成**假阳性通过**（UI 仍显示旧卷"35 字"暴露了这一点）。修复：evaluate 内全部 async/await，并给迁移断言加卷名校验（"旧格式卷"）防假阳性。
2. **选择器歧义**：`#pl-step-4-content select` 抓到智能体下拉；为关键下拉补业务 id 是根治方式。
3. **启动器会话不可 Ctrl+C**：杀启动器 PTY 会话会把整个 electron 进程树带走，导致 CDP ECONNREFUSED；正确做法是让 `start-electron.bat` 以管道 stdin 跑完自动退出，electron 独立存活。

## 证据
- `_audit/tmp/p4-evidence/01~04*.png`、`p4-results.json`（15 项全 ok）

## 提交
- `d810ffd` feat(volume): P4 per-volume binding gates chapter layer, verified 15/15 in Electron（已推送）

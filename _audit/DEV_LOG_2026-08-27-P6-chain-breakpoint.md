# DEV LOG 2026-08-27：P6 chain 断点续跑

## 根因

旧断点只有 step、项目、最后成功索引和文本，无法区分当前失败 Skill，也无法核对 Skill 顺序、输入、Agent 或重试次数。失败路径还可能继续使用旧输出。

## 修改

- 新增 `src/services/chainBreakpoint.ts` 及 focused tests。
- 在 `PipelinePanel.vue` 的 chain 循环中，每个 Skill 成功后立即保存完整断点。
- 失败时保存 `status: failed` 并抛错，后续 Skill 不再接收旧输出继续执行。
- 断点项目 ID 和 Agent ID 在存储边界归一化为字符串，解决未选项目或未绑定 Agent 时的类型错误。

## 验证

- chain breakpoint focused：20/20。
- service tests：44/44。
- type-check：通过。
- build:vue：通过。
- 源文件 Electron/CDP：页面、Electron API、断点写入、杀进程、启动、重启读取、隔离键清理均完成。

## 留痕边界

本轮没有客户 API 配置，未声称真实供应商断线恢复已验证；该项保留到客户配置后的验收。

# AI Pipeline P4：稳定 Skill ID 的 Agent 绑定报告

日期：2026-08-27

## 目标

让 chain 中每个 Skill 的 Agent 绑定跟随稳定 `skillId`，而不是跟随数组下标。绑定优先使用 `step-skillId`，旧配置读取时兼容 `step-index`。

## 根因

`PipelinePanel.vue` 的五层 Skill 芯片和 chain 调用都使用 `step + '-' + si`。用户调整同一层 Skill 顺序后，Agent 会跟随槽位移动，可能把解析 Agent 错配给填充 Skill。

## 修改范围

| 文件 | 函数/位置 | 修改 |
|---|---|---|
| `src/services/skillAgentBinding.ts` | `getSkillAgentKey` | 生成稳定键 `${step}-${skillId}` |
| `src/services/skillAgentBinding.ts` | `getSkillAgentId` | 按稳定 Skill ID 查询绑定 |
| `src/services/skillAgentBinding.ts` | `migrateSkillAgentBindings` | 读取旧索引键并映射到稳定键；稳定键优先；空槽忽略 |
| `src/components/pipeline/PipelinePanel.vue` | 五层 Skill 芯片 | 下拉框改为 `stepSkillAgents[getSkillAgentKey(step, sid)]`；渲染 key 改为 step + skillId |
| `src/components/pipeline/PipelinePanel.vue` | `getStepSkillAgentId` | 参数改为 `skillId` |
| `src/components/pipeline/PipelinePanel.vue` | `_runStepSkillsInner` | chain 每轮按 `t.id` 查找 Agent |
| `src/components/pipeline/PipelinePanel.vue` | `onMounted` | 加载旧 `skillAgents` 时执行迁移 |

## 验证清单

- [x] 稳定键生成和查询：`3-volume-fill` 能取回对应 Agent。
- [x] 旧键迁移：`3-0`、`3-1` 根据保存的 Skill 数组映射到 `3-skillId`。
- [x] 稳定键优先：同一 Skill 同时存在新旧绑定时保留稳定键。
- [x] 空 Skill 槽位不产生 `step-` 绑定。
- [x] 五层模板均使用稳定键；源码扫描得到 5 个稳定模板绑定、0 个旧模板绑定。
- [x] chain 运行时使用模板对象的稳定 `t.id`。
- [x] 类型检查：`npm run type-check` 无错误输出。
- [x] focused 回归：4 个测试文件、13 个测试通过。
- [x] 服务回归：2 个测试文件、44 个测试通过。
- [x] 构建：`npm run build:vue` 完成，180 modules transformed；仅有既有动态导入和 chunk 体积警告。
- [x] Electron 源文件启动：CDP 页面为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。
- [x] Electron storage 隔离读写：隔离 fixture 写入后可读回，验证后已清理。
- [ ] 真实流水线下拉框操作：当前启动环境没有项目，页面没有流水线入口，未伪造该项通过；需客户有项目时补做。

## 证据

- `src/services/skillAgentBinding.spec.ts`：3 个稳定绑定/迁移测试。
- `src/components/pipeline/PipelinePanel.vue:81,188,334,478,590`：五层稳定 UI 绑定。
- `src/components/pipeline/PipelinePanel.vue:1200`：稳定键查询。
- `src/components/pipeline/PipelinePanel.vue:1854`：chain 使用 `t.id`。
- `src/components/pipeline/PipelinePanel.vue:2539`：加载迁移。
- CDP 输出：`[P4] before ... "hasPipeline":false`、`[P4] isolated-storage ... "supported":true`；UI 面板入口边界已如实记录。

## 判定

P4 代码、单元测试、类型、构建和 Electron storage 验证通过。稳定绑定功能可进入 P5；客户项目环境下的真实下拉操作属于待补验边界，不应写成已完成的 UI 证据。

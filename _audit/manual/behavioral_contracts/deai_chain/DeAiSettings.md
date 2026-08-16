# DeAiSettings.vue 行为契约

> 源文件: `src/components/settings/DeAiSettings.vue`
> 职责: 去AI味设置面板——通用参数、3模式卡片配置、硬规则细项、验证供应商状态、保存/取消
> 函数总数: 8（5方法 + 3 computed/ref）

---

## F01: verifyProvider (computed)

| 层 | 内容 |
|---|---|
| L1 结构 | computed。从 providerStore 获取验证供应商 |
| L2 输入来源 | providerStore.activeVerifyProvider |
| L3 输出目的地 | 模板渲染验证供应商状态区域 |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | providerStore 读取 |
| L6 验证用例 | Playwright: 配置验证供应商 → 状态区域显示供应商名称+模型；未配置 → 显示'未配置' |
| L7 跨组件依赖 | providerStore.activeVerifyProvider |

## F02: selectMode(mode)

| 层 | 内容 |
|---|---|
| L1 结构 | 事件处理函数。模式卡片 click 绑定。切换处理模式 |
| L2 输入来源 | 参数 mode: 'chain'|'split-merge'|'multi-step' |
| L3 输出目的地 | deAiStore.setMode(mode) |
| L4 副作用 | 触发 setMode（更新 mode + flowPreview + saveConfig）。风险等级: 低 |
| L5 通信范式 | store 写入（deAiStore.setMode） |
| L6 验证用例 | Playwright: 点击卡片2 → deAiStore.mode === 'split-merge'；卡片2添加 active class；流程预览更新 |
| L7 跨组件依赖 | deAiStore.setMode |

## F03: addDeAiSkill(mode)

| 层 | 内容 |
|---|---|
| L1 结构 | 事件处理函数。技能下拉 @change / 添加按钮 @click 绑定。添加技能到链 |
| L2 输入来源 | 3个独立 ref（selectedChainSkill/selectedSplitSkill/selectedMultiSkill）根据 mode 选取；deAiStore.skillIds |
| L3 输出目的地 | deAiStore.skillIds.push(sel.value)；deAiStore.saveConfig()；清空对应 ref |
| L4 副作用 | store 写入（skillIds + saveConfig）。风险等级: 低 |
| L5 通信范式 | 本地 ref + store 写入 |
| L6 验证用例 | Playwright: chain模式选择技能 → skillIds 添加；重复技能 → 不添加（includes 检查）；添加后下拉清空 |
| L7 跨组件依赖 | deAiStore.skillIds/saveConfig |

## F04: removeDeAiSkill(index)

| 层 | 内容 |
|---|---|
| L1 结构 | 事件处理函数。技能 chip 移除按钮 @click 绑定。从链中移除技能 |
| L2 输入来源 | 参数 index；deAiStore.skillIds |
| L3 输出目的地 | deAiStore.skillIds.splice(index, 1)；deAiStore.saveConfig() |
| L4 副作用 | store 写入。风险等级: 低 |
| L5 通信范式 | store 写入 |
| L6 验证用例 | Playwright: 添加3个技能 → 删除第2个 → skillIds.length === 2，第2个变为原第3个 |
| L7 跨组件依赖 | deAiStore.skillIds/saveConfig |

## F05: toggleHardRule(id)

| 层 | 内容 |
|---|---|
| L1 结构 | 事件处理函数。硬规则细项 checkbox @change 绑定。切换单条硬规则开关 |
| L2 输入来源 | 参数 id（硬规则ID）；deAiStore.hardRules[id] 当前值 |
| L3 输出目的地 | deAiStore.hardRules[id] 赋值（false→true, 其他→false）；deAiStore.saveConfig() |
| L4 副作用 | store 写入。风险等级: 低 |
| L5 通信范式 | store 写入 |
| L6 验证用例 | Playwright: 硬规则 'cliches' 当前 true → 点击 → 变为 false；再点 → 变为 true |
| L7 跨组件依赖 | deAiStore.hardRules/saveConfig |

## F06: resetConfig()

| 层 | 内容 |
|---|---|
| L1 结构 | 事件处理函数。取消按钮 @click 绑定。重新加载配置（放弃未保存修改） |
| L2 输入来源 | 无参数 |
| L3 输出目的地 | deAiStore.loadConfig() |
| L4 副作用 | 全量覆盖 store 状态为存储值。风险等级: 中 |
| L5 通信范式 | store 读取（loadConfig） |
| L6 验证用例 | Playwright: 修改 mode → 点取消 → mode 恢复为存储值 |
| L7 跨组件依赖 | deAiStore.loadConfig |

## F07: saveAllConfig()

| 层 | 内容 |
|---|---|
| L1 结构 | 事件处理函数。保存按钮 @click 绑定。持久化当前配置 |
| L2 输入来源 | 无参数 |
| L3 输出目的地 | deAiStore.saveConfig() |
| L4 副作用 | electron storage 写入。风险等级: 中 |
| L5 通信范式 | store 写入（saveConfig → electronAPI） |
| L6 验证用例 | Playwright: 修改参数 → 点保存 → 重新打开设置 → 参数保持修改后值 |
| L7 跨组件依赖 | deAiStore.saveConfig |

## F08: getSkillName(id)

| 层 | 内容 |
|---|---|
| L1 结构 | 普通函数。通过技能ID查找技能名称 |
| L2 输入来源 | 参数 id；skillStore.skills 数组 |
| L3 输出目的地 | 返回 string（技能名称或原ID） |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | skillStore 读取 |
| L6 验证用例 | Playwright: 传入有效 ID → 返回名称；传入无效 ID → 返回原 ID |
| L7 跨组件依赖 | 无 |

---

## 副作用风险表

| 风险等级 | 函数 | 说明 |
|---|---|---|
| 中 | F06 resetConfig | 全量覆盖 store 状态 |
| 中 | F07 saveAllConfig | electron storage 覆盖写入 |
| 低 | F02 selectMode | 触发 setMode 链式更新 |
| 低 | F03 addDeAiSkill | skillIds push + saveConfig |
| 低 | F04 removeDeAiSkill | skillIds splice + saveConfig |
| 低 | F05 toggleHardRule | hardRules 赋值 + saveConfig |
| 无 | F01 verifyProvider | 纯 computed |
| 无 | F08 getSkillName | 纯读取 |

---

## 通信范式汇总

| 范式 | 函数 | 说明 |
|---|---|---|
| deAiStore 写入 | F02, F03, F04, F05, F06, F07 | setMode/skillIds/hardRules/saveConfig/loadConfig |
| providerStore 读取 | F01 | activeVerifyProvider |
| skillStore 读取 | F08 | skills 数组 |
| 本地 ref | F03 | 3个独立的 selectedSkill ref |

---

## L6 Playwright 验证用例映射

| 用例编号 | 对应函数 | 测试脚本 | 状态 |
|---|---|---|---|
| T-deai-settings-01 | F02 selectMode 3卡片切换 | test_p8_deai.js | 已有（23/23 PASS） |
| T-deai-settings-02 | F03/F04 技能添加/移除 | test_p8_deai.js | 已有 |
| T-deai-settings-03 | F05 硬规则细项开关 | test_p8_deai.js | 已有 |
| T-deai-settings-04 | F01 验证供应商状态 | test_p8_deai.js | 已有 |
| T-deai-settings-05 | F06/F07 取消/保存 | test_p8_deai.js | 已有 |
| T-deai-settings-06 | 通用参数(强度/版本/类型) | test_p8_deai.js | 已有 |
| T-deai-settings-07 | 各模式卡片body展开 | 需补全 | 非active卡片body隐藏验证 |

---

## 关键行为契约备注

1. **3个独立 selectedSkill ref**: chain/split-merge/multi-step 各有一个独立的下拉选择 ref，切换模式时不会互相干扰。
2. **split-merge 只允许1个技能**: UI label 提示'输出技能（1个，所有段共用）'，但代码不强制限制数量——split-merge 模式 processSplitMerge 只取 skills[0]。
3. **multi-step 需3个技能**: UI label 提示'需3个：S1A+S1B+S1C或S1+S2'，但代码不强制限制——processMultiStep 取 skills[0] 做 S1，skills[1] 做 verify。
4. **硬规则细项默认值**: hardRules[id] !== false 意味着未设置的规则默认为 true（开启）。toggleHardRule 在 false→true 之间切换。
5. **模式卡片 body 条件渲染**: 只有 deAiStore.mode === m.id 的卡片显示 body（配置区域），其他卡片只显示 header + desc + flow。
6. **硬规则总开关联动**: hardruleEnabled 为 false 时硬规则细项区域不渲染（v-if='deAiStore.hardruleEnabled'）。

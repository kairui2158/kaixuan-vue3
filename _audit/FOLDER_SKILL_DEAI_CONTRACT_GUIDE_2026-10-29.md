# Folder SKILL 降AI契约指导手册

版本：v1（对应 `contractVersion: 1`）  
适用层：生成流水线正文层（step 4）  
适用对象：folder SKILL 作者、SKILL 迭代测试者、应用层维护者

## 1. 契约位置与语义

降AI契约挂在 folder SKILL 包的 `meta.deai`，与 `chainHandoff` 同级：

```json
{
  "deai": {
    "contractVersion": 1,
    "generation": "on",
    "finalStepDetection": "on",
    "conflictPolicy": "report"
  }
}
```

合法值：

| 字段 | 合法值 | 默认值 | 语义 |
|---|---|---|---|
| `contractVersion` | `1` | `1` | 契约版本；非法或未知版本不阻断运行，回退默认并写 warning |
| `generation` | `on` / `off` / `suffix-only` | `on` | 控制应用注入的生成期降AI提示；契约 v1 中 `suffix-only` 与 `on` 行为等价，因为应用唯一的生成期注入通道就是 `systemPromptSuffix`，trace 会保留你声明的原值 |
| `finalStepDetection` | `on` / `off` | `on` | 只控制应用侧终步 schema/回显重试时的 findings 注入，消费点在 `realSkillExecutor`，不影响用户后处理 |
| `conflictPolicy` | `report` / `skill-wins` / `app-wins` | `report` | 处理 SKILL 模板与应用降AI投影的重叠规则 |

冲突检测说明：当前 `conflictPolicy` 使用固定中文关键词字面匹配，能报告共享主题（如“短句”“对白”“过渡”）的重叠，不能做同义改写级语义判断。换词后的同义规则不会被识别，这是契约 v1 的明确边界。

禁止事项：

1. 不得通过 `meta.deai` 覆盖用户的 `hardRuleMode`、深度修复门禁、变更率阈值。
2. 不得在 `meta.deai` 外另建一套降AI声明字段。
3. 不得依赖旧字符串版本 `"1.0"`；当前契约只接受数字 `1`。

## 2. 权限边界

1. **应用注入**：由 `meta.deai` 控制，只影响正文层生成期提示。
2. **终步反馈**：由 `finalStepDetection` 控制，只影响终步重试时的 findings 注入。
3. **用户后处理**：`detect-report` / `deep-fix` / `legacy-auto` 始终保留用户权威，SKILL 不可关闭。

## 3. contractVersion 策略

1. 兼容扩展使用 minor 递增，语义变化使用 major 递增。
2. 未知版本不阻断运行，但必须回退默认并记录原值。
3. 未知字段宽容留痕：运行时忽略，技能包预检报告错误。

预检入口说明：导入技能压缩包时，应用会解析 `skill-package.json` 并把 `meta.deai` 交给同一份 `validateSkillDeaiMeta` 校验；错误进入包预检 issue，警告进入包预检 warning。安装后的运行时校验继续保留 trace 事件。

## 4. trace 阅读指导

| 事件 | 含义 |
|---|---|
| `deai-injection-policy` | 本次注入的 variant、source、policy、warnings |
| `deai-contract-warning` | SKILL 契约声明非法，已回退默认策略 |
| `deai-conflict-policy` | SKILL 模板与应用投影存在重叠规则及处理动作 |
| `deai-quality-gate-degraded` | 检测内核或观测链路降级 |

这些事件全部进入 `RETAINED_AUDIT_EVENT_TYPES` 白名单，standard/deep 导出均保留。

## 5. 冲突升级路径

1. 默认 `report`：观察 `deai-conflict-policy` 事件中的重叠主题。
2. 若 SKILL 模板规则更成熟，改为 `skill-wins`：应用移除重叠投影，trace 记录动作。
3. 若应用投影必须保留，改为 `app-wins`：应用投影保留，SKILL 声明留痕。
4. 不允许跳过 `report` 直接盲切，先看至少一轮真实 trace。

## 6. 示例

### 旧 SKILL 零迁移

不写 `meta.deai` 即可。应用按 `app-default-no-skill-meta` 注入默认投影，行为与旧版一致。

### 显式声明

```json
{
  "deai": {
    "contractVersion": 1,
    "generation": "off",
    "finalStepDetection": "on",
    "conflictPolicy": "skill-wins"
  }
}
```

### 非法值回退

```json
{
  "deai": {
    "contractVersion": "1.0",
    "generation": "maybe"
  }
}
```

运行结果：不阻断，回退 `generation: on`，写 `deai-contract-warning`，trace 保留原值。

## 7. SKILL 迭代自检流程

1. 修改 `meta.deai` 后先跑：

```powershell
npx vitest run src/services/skillDeaiContract.spec.ts
```

2. 再跑集成门禁：

```powershell
npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts
npx vitest run src/services/deaiChainVariantIntegration.spec.ts
```

3. 用真实 folder SKILL 跑一次正文层生成，导出 deep trace，确认：
   - `deai-injection-policy.source` 符合预期；
   - `deai-prompt-variant` 与链位一致；
   - 非法声明时出现 `deai-contract-warning`；
   - 冲突场景出现 `deai-conflict-policy`。

## 8. 测试与 fixture 位置

| 内容 | 位置 |
|---|---|
| 契约纯函数 | `src/services/skillDeaiContract.spec.ts` |
| 事件白名单与双路径一致性 | `src/components/pipeline/__tests__/deai-injection-policy.spec.ts` |
| 三变体真实请求消息 | `src/services/deaiChainVariantIntegration.spec.ts` |
| 诊断投影去重 | `src/stores/runTrace.spec.ts` |

## 9. 变更登记规则

以下任何变更必须同步本手册版本：

1. 检测内核或阈值。
2. 降AI提示词内容。
3. 契约字段、合法值、默认值。
4. trace 事件名或语义。
5. folder/agent 双路径接线方式。

跳过手册更新等同发布未完成。

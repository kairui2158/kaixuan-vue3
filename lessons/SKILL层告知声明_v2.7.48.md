# SKILL层告知声明 v2.7.48

## 致：所有层级SKILL（大纲层/设定层/卷纲层/章节层/正文层/去AI味层）

## 应用SKILL架构变更通知

应用已从 v2.7.47 升级至 v2.7.48，SKILL执行架构发生重大变化。请各层级SKILL知悉以下变更。

### 一、架构变更概述

**旧架构（伪SKILL）**：应用将SKILL的template作为prompt的一部分投递给API，通过for循环串行调用。模型可以忽略规则、跳步、不做验证。

**新架构（真SKILL）**：应用引入了 `SkillExecutionEngine` 引擎，代码控制每一步的输入输出，自动挂载验证器，失败自动重试。模型无法跳步。

### 二、对现有SKILL的影响

#### 不需要改动的部分
- SKILL的 template 内容不需要改一个字
- SKILL的 name、description、category 不需要改
- SKILL的 injectMode 不需要改
- 现有SKILL默认走 chain 模式，行为与之前一致

#### 新增能力（可选使用）
应用现在支持三种执行模式，SKILL可以在应用中被配置为以下模式之一：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| chain | 链式顺序执行（默认） | 大纲→设定→卷纲→章节→正文的流水线 |
| splitMerge | 切分+并行+拼接 | 去AI味的快速重述 |
| multiStep | 多步代码控制流 | 去AI味的深度重写（事件核→偏转→重组→验证） |

### 三、自动验证器说明

应用现在会根据生成层级自动挂载验证器，SKILL不需要自己做格式验证：

| 层级 | 自动验证器 | 说明 |
|------|------------|------|
| settings | json_array + field_exists(name) | 设定层输出必须是JSON数组，每项含name字段 |
| volumes | json_array + min_length(50) | 卷纲层输出必须是JSON数组，最小50字 |
| chapters | json_array + field_exists(title,plot) + exact_count | 章节层输出必须是JSON数组，含title和plot字段，数量精确匹配expectedCount |
| body | min_length(500) | 正文层输出最小500字 |

验证失败时引擎会自动重试一次，重试时会将验证失败的原因作为反馈附加到prompt中。

### 四、expectedCount 传递机制

章节层生成时，应用会自动计算本卷应生成的章节数（卷纲字数 / 单章字数），并作为 `expectedCount` 传入引擎。引擎会自动挂载 `exact_count` 验证器，确保生成的章节数精确匹配。

SKILL在template中写的"章节数硬性指标"仍然有效，但现在有了代码层的双重保障：
1. SKILL的template约束模型行为（软约束）
2. 引擎的exact_count验证器约束输出格式（硬约束）

### 五、多供应商验证支持

应用现在支持为供应商设置用途标签：
- **generate**: 用于SKILL执行（默认）
- **verify**: 用于跨模型语义验证
- **detect**: 用于AI检测（如朱雀）

在去AI味的 multiStep 模式中，引擎会自动调用 verify 供应商对输出做跨模型验证。

### 六、去AI味层的特殊说明

去AI味层支持三种模式，用户在设置界面选择：

1. **串行链式（chain）**: 现有行为，SKILL1输出→SKILL2输入→SKILL3输入
2. **Agent调度（splitMerge）**: 切分文章→并行重述→拼接
3. **Multi-step（multiStep）**: 事件核提取→偏转视角选择→从零重组→验证

multiStep 模式需要至少3个SKILL（S1A/S1B/S1C），可选第4个SKILL（S2验证）。

### 七、向后兼容保证

- 不填新字段时默认走 chain 模式
- 现有SKILL不需要任何修改
- 生成流水线用户无感（不暴露配置）
- 去AI味保持用户自选模式

## 总结

SKILL从"依赖模型自觉遵守规则的提示词"升级为"代码控制流+自动验证的工程化执行"。现有SKILL完全兼容，新增能力可选使用。

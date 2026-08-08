# 写作助手 v2.7.1 完整架构链路图

> 基于 v2.7.1 源代码逐行扫描生成，重点体现 Skill 链式执行 + Agent 全程参与
> 生成时间：2026-07-25
> 核心改动：Skill 从"并行追加"改为"链式执行"，多 Skill 自动按顺序调用

---

## 一、核心架构三角

应用的核心设计哲学：API 是大脑，Agent 是身体，Skill 是四肢。

```mermaid
flowchart LR
    subgraph 三角关系
        API["API 大脑<br/>提供逻辑推理<br/>Deepseek/OpenAI<br/>reasoning_content解析"]
        AGENT["Agent 身体<br/>定义谁来做<br/>模型/温度/系统提示词<br/>全程参与每一步"]
        SKILL["Skill 四肢<br/>定义做什么<br/>链式顺序执行<br/>输出层层传递"]
    end

    USER["用户"] --> AGENT
    AGENT --> API
    SKILL --> AGENT
    API -->|"返回结果"| AGENT
    AGENT -->|"执行动作"| SKILL
```

**职责划分：**
- API（大脑）：每次 `_aiRequest` 调用，处理流式响应 + reasoning_content
- Agent（身体）：提供 model/temperature/systemPrompt/maxTokens，链式每步都携带
- Skill（四肢）：提供 template（执行指令），多个 Skill 按顺序链式执行

---

## 二、完整调用链路图

从用户操作到正文输出的完整调用链路。

```mermaid
flowchart TB
    subgraph 入口层
        UE["用户操作<br/>按钮点击/输入"]
    end

    subgraph 大纲工作台
        OW["大纲编辑器<br/>outline-editor"]
        OW -->|"导入文件 txt/md"| importOutlineFile
        OW -->|"AI共创"| toggleAICoCreate
        OW -->|"保存"| saveOutline
        OW -->|"锁定|锁定后不可编辑"| lockOutline
        OW -->|"拆解到设定合集"| decomposeOutline
        OW -->|"同步到流水线"| _plLoadOutline
    end

    subgraph 设定合集
        SC["设定合集面板<br/>settingsCollection"]
        SC -->|"AI生成"| _aiGenSettingsItem
        SC -->|"手动添加"| _addSettingsItem
        SC -->|"编辑卡片"| _editSettingsItem
        SC -->|"绑定 toggle"| _toggleScBind
        SC -->|"同步到流水线"| boundSettings同步
    end

    subgraph 生成流水线 5步
        direction TB
        PL1["Step1 大纲<br/>pl-outline"]
        PL2["Step2 设定<br/>pl-settings"]
        PL3["Step3 卷纲<br/>pl-volumes"]
        PL4["Step4 章节<br/>pl-chapters"]
        PL5["Step5 正文<br/>pl-body"]

        PL1 -->|"确认后内联"| PL2
        PL2 -->|"确认后内联"| PL3
        PL3 -->|"确认后内联"| PL4
        PL4 -->|"确认后内联"| PL5
    end

    subgraph 左侧章节树
        TREE["章节树面板<br/>chapter-tree<br/>快捷操作面板"]
        TREE -->|"添加卷"| addVolume
        TREE -->|"生成章节"| _treeGenChapters
        TREE -->|"生成正文"| _treeGenBody
        TREE <-->|"双向同步"| PL3
        TREE <-->|"双向同步"| PL4
    end

    subgraph 中间编辑区
        EDITOR["编辑器<br/>editor-content<br/>正文生成和修改"]
        EDITOR <-->|"联动"| TREE
        EDITOR <-->|"联动"| PL5
    end

    UE --> OW
    OW --> SC
    OW --> PL1
    SC -->|"绑定数据"| PL2
    PL5 --> EDITOR
```

---

## 三、Skill 链式执行流程（核心改动）

这是 v2.7.1 最重要的架构改动。多个 Skill 不再拼在一起，而是按顺序链式执行。

```mermaid
flowchart TB
    START["apiGenerate type params onChunk opts"]

    START --> CHECK{"opts.skillIds<br/>有值?"}

    CHECK -->|"无"| SINGLE_API["单次API调用<br/>无Skill约束"]
    SINGLE_API --> RETURN1["返回结果"]

    CHECK -->|"1个"| APPEND["追加模式<br/>prompt += Skill.template<br/>向后兼容"]
    APPEND --> SINGLE_API2["单次API调用"]
    SINGLE_API2 --> RETURN2["返回结果"]

    CHECK -->|"多个"| CHAIN["链式执行模式"]

    CHAIN --> AGENT_EXTRACT["提取Agent配置<br/>sysContent = agent.systemPrompt<br/>model = agent.model<br/>temperature = agent.temperature<br/>maxTokens = agent.maxTokens"]

    AGENT_EXTRACT --> STEP1

    subgraph 链式执行循环
        STEP1["Step1: Skill1<br/>prompt + Skill1.template<br/>Agent配置注入"]
        STEP1 --> API1["_aiRequest<br/>model=Agent.model<br/>temp=Agent.temperature<br/>system=Agent.systemPrompt"]
        API1 --> OUT1["输出A = 初稿"]

        OUT1 --> STEP2["Step2: Skill2<br/>输出A + Skill2.template<br/>Agent配置注入"]
        STEP2 --> API2["_aiRequest<br/>同上Agent配置"]
        API2 --> OUT2["输出B = 修复稿"]

        OUT2 --> STEP3["Step3: Skill3<br/>输出B + Skill3.template<br/>Agent配置注入"]
        STEP3 --> API3["_aiRequest<br/>同上Agent配置"]
        API3 --> OUT3["输出C = 终稿"]
    end

    OUT3 --> RETURN_CHAIN["返回最终输出C"]

    API1 -.->|"流式chunk"| STREAM1["onChunk 实时回调<br/>用户看到中间过程"]
    API2 -.->|"流式chunk"| STREAM2["onChunk 实时回调"]
    API3 -.->|"流式chunk"| STREAM3["onChunk 实时回调"]
```

**关键规则：**
- 第1步：原始prompt + Skill1.template → API调用1 → 输出A
- 第2步：输出A + Skill2.template → API调用2 → 输出B
- 第3步：输出B + Skill3.template → API调用3 → 输出C
- Agent的model/temperature/systemPrompt/maxTokens 在每一步都注入
- 每步的流式chunk都通过onChunk回调，用户可看到中间过程
- 中间步骤返回空则停止链
- 每步显示toast提示进度（"正在执行技能 2/3: 润色专家"）

---

## 四、Agent 参与全链路图

Agent 在生成流水线的每一步都全程参与。

```mermaid
flowchart LR
    subgraph Agent配置
        AID["agentId<br/>用户在流水线选择"]
        ACFG["systemPrompt<br/>model<br/>temperature<br/>maxTokens"]
    end

    subgraph 流水线5步
        S2["Step2 设定<br/>apiGenerate settings<br/>opts.agentId"]
        S3["Step3 卷纲<br/>apiGenerate volumes<br/>opts.agentId"]
        S4["Step4 章节<br/>apiGenerate chapters<br/>opts.agentId"]
        S5["Step5 正文<br/>apiGenerate body<br/>opts.agentId"]
    end

    AID --> ACFG
    ACFG -->|"opts.agentId"| S2
    ACFG -->|"opts.agentId"| S3
    ACFG -->|"opts.agentId"| S4
    ACFG -->|"opts.agentId"| S5

    S2 -->|"agentId不为空时<br/>提取agent配置"| INJECT2["sysContent=agent.systemPrompt<br/>model=agent.model<br/>temperature=agent.temperature"]
    S3 -->|"同上"| INJECT3["同上"]
    S4 -->|"同上"| INJECT4["同上"]
    S5 -->|"同上"| INJECT5["同上"]

    INJECT2 --> API2["_aiRequest"]
    INJECT3 --> API3["_aiRequest"]
    INJECT4 --> API4["_aiRequest"]
    INJECT5 --> API5["_aiRequest"]
```

**代码位置：**
- Agent配置提取：renderer_v2.js 第885-897行
- 链式每步注入：renderer_v2.js 第917-924行（_sysContent/_agentModel/_agentTemperature）
- 流水线调用点：pipeline-manager.js 的 _plGenSettings/_plGenVolumes/_plGenChaptersDirect/_plGenBodyForChapter

---

## 五、数据内联递归关系图

每一步的输出都是下一步的输入，形成内联递归。

```mermaid
flowchart TB
    OUTLINE["大纲编辑器<br/>用户输入/AI共创/导入"]

    OUTLINE -->|"确认保存 outlineConfirmed=true"| PL_OUTLINE["流水线Step1<br/>pl.outlineText = outline"]

    PL_OUTLINE -->|"AI生成 pl.agentId + s2Skills"| PL_SETTINGS["流水线Step2<br/>pl.settingsText = AI输出<br/>+设定合集绑定数据"]

    PL_SETTINGS -->|"AI生成 pl.agentId + s3Skills<br/>params含 outlineText + settingsText"| PL_VOLUMES["流水线Step3<br/>pl.volumes = JSON解析<br/>每卷含 name + outline"]

    PL_VOLUMES -->|"AI生成 pl.agentId + s4Skills<br/>params含 outlineText + settingsText + volOutline"| PL_CHAPTERS["流水线Step4<br/>vol.chapters = JSON解析<br/>每章含 title + plot"]

    PL_CHAPTERS -->|"AI生成 pl.agentId + s5Skills<br/>params含 全书大纲 + 设定 + 卷概要 + 章节剧情点 + 字数"| PL_BODY["流水线Step5<br/>ch.body = AI输出<br/>同步到编辑器 + ChapterManager"]

    subgraph 正文记忆链
        MEM1["全书大纲<br/>pl.outlineText"]
        MEM2["设定摘要<br/>pl.settingsText + 绑定设定"]
        MEM3["当前卷概要<br/>vol.name + vol.outline"]
        MEM4["当前章节剧情点<br/>ch.title + ch.plot"]
        MEM5["用户设定字数<br/>ch.wordCount"]
    end

    MEM1 --> PL_BODY
    MEM2 --> PL_BODY
    MEM3 --> PL_BODY
    MEM4 --> PL_BODY
    MEM5 --> PL_BODY
```

**正文生成的完整上下文（pipeline-manager.js _plGenBodyForChapter）：**
```
params = "[全书大纲]\n" + outline
       + "\n\n[设定摘要]\n" + settingsText + boundText
       + "\n\n[当前卷概要]\n" + vol.name + ": " + vol.outline
       + "\n\n[当前章节剧情点]\n" + ch.title + ": " + ch.plot
       + "\n\n请为本章节生成约" + wordCount + "字的正文内容。"
       + "记住这一章节讲的是什么，这一章节在这一卷纲中的位置，"
       + "这一卷纲的主题和概要，以及这一卷纲在大纲里要记住的设定。"
```

---

## 六、设定合集绑定约束链路

设定合集的绑定数据如何影响正文输出。

```mermaid
flowchart LR
    SC_PANEL["设定合集面板"]

    SC_PANEL -->|"点击绑定按钮"| TOGGLE["_toggleScBind<br/>切换 isBound"]
    TOGGLE -->|"保存"| PERSIST["_saveProjectData<br/>bindTargets写入IndexedDB"]
    PERSIST --> SYNC["_getBoundSettingsText<br/>收集所有已绑定的设定"]

    SYNC --> INJECT2["→ Step2 设定生成<br/>params += [约束设定]"]
    SYNC --> INJECT3["→ Step3 卷纲生成<br/>params += [约束设定]"]
    SYNC --> INJECT4["→ Step4 章节生成<br/>params += [约束设定]"]
    SYNC --> INJECT5["→ Step5 正文生成<br/>params += [约束设定]"]

    subgraph 约束效果
        C1["角色 陈暮<br/>约束正文不乱换主角"]
        C2["世界观 末日<br/>约束正文不乱换世界观"]
        C3["物种 菌膜装甲<br/>约束正文不乱造物种"]
    end

    INJECT5 --> C1
    INJECT5 --> C2
    INJECT5 --> C3
```

---

## 七、完整数据结构图

```mermaid
flowchart TB
    PROJECT["Project 对象<br/>IndexedDB存储"]

    PROJECT --> P_OUTLINE["outline: string<br/>大纲全文"]
    PROJECT --> P_SC["settingsCollection: object<br/>设定合集"]
    PROJECT --> P_PL["_pipeline: object<br/>流水线状态"]
    PROJECT --> P_VOLUMES["volumes: array<br/>ChapterManager卷列表"]

    P_SC --> SC_ITEMS["items: {characters/worldview/species/items}<br/>每个分类下是卡片数组"]
    SC_ITEMS --> SC_ITEM["卡片: {name, attrs, bindTargets, isBound}"]

    P_PL --> PL_STEP["step: 1-5<br/>当前流水线步骤"]
    P_PL --> PL_AGENT["agentId: string<br/>流水线绑定的Agent"]
    P_PL --> PL_SKILLS["s1Skills/s2Skills/s3Skills/s4Skills/s5Skills<br/>每步绑定的Skill数组"]
    P_PL --> PL_TEXT["outlineText/settingsText/volumesText/chaptersText/bodyText<br/>每步AI输出文本"]
    P_PL --> PL_VOLS["volumes: array<br/>流水线卷数据"]
    P_PL --> PL_VOLCOUNT["volumeCount: number<br/>目标卷数"]
    P_PL --> PL_WC["chapterWordCount: number<br/>目标章节字数"]

    PL_VOLS --> PL_VOL["vol: {id, name, outline, confirmed, chapters, cmId}"]
    PL_VOL --> PL_CH["ch: {id, title, plot, confirmed, wordCount, body, bodyGenerated}"]

    P_VOLUMES --> CM_VOL["ChapterManager卷: {id, name, outline, chapters}"]
    CM_VOL --> CM_CH["ChapterManager章: {id, title, content}"]
```

---

## 八、双面板联动关系

章节树（左侧快捷面板）与生成流水线（完整面板）的双向同步。

```mermaid
flowchart LR
    subgraph 章节树左侧
        TREE_ADD_VOL["+添加卷"]
        TREE_GEN_CH["生成章节"]
        TREE_GEN_BODY["生成正文"]
        TREE_OPEN_CH["打开章节编辑"]
    end

    subgraph 生成流水线
        PL_VOL_CARDS["卷纲卡片<br/>可编辑/确认/删除"]
        PL_CH_CARDS["章节卡片<br/>可编辑/确认/删除"]
        PL_BODY_GEN["正文生成<br/>+编辑器同步"]
    end

    subgraph 中间编辑区
        EDITOR["editor-content<br/>正文编辑"]
    end

    TREE_ADD_VOL -->|"同步卷到流水线"| PL_VOL_CARDS
    TREE_GEN_CH -->|"调用_plGenChaptersDirect"| PL_CH_CARDS
    TREE_GEN_BODY -->|"调用_plGenBodyForChapter"| PL_BODY_GEN

    PL_VOL_CARDS -->|"同步卷到树"| TREE_ADD_VOL
    PL_CH_CARDS -->|"同步章节到树"| TREE_GEN_CH

    PL_BODY_GEN -->|"text写入editor-content"| EDITOR
    EDITOR -->|"修改同步回ChapterManager"| PL_BODY_GEN
```

---

## 九、_aiRequest 内部流程

每次 API 调用的完整内部流程（含重试 + reasoning_content 解析）。

```mermaid
flowchart TB
    INPUT["_aiRequest cfg<br/>messages/model/temperature/maxTokens/stream/onChunk"]

    INPUT --> RETRY{"attempt < maxRetries?"}

    RETRY -->|"是"| FETCH["fetch API_ENDPOINT<br/>headers: Authorization Bearer<br/>body: messages + model + temp + stream"]

    FETCH --> STATUS{"resp.status"}
    STATUS -->|"200 OK"| PARSE["解析流式SSE"]
    STATUS -->|"429/503"| WAIT["等待 retryDelays[attempt]<br/>30s/60s/90s/120s/150s/180s/210s/240s"]
    WAIT --> RETRY
    STATUS -->|"其他错误"| THROW["throw lastErr"]

    PARSE --> DELTA{"delta对象"}
    DELTA -->|"delta.content"| CHUNK["拼接content<br/>onChunk回调"]
    DELTA -->|"delta.reasoning_content"| REASONING["拼接reasoning<br/>onReasoning回调"]

    CHUNK --> COMPLETE{"stream结束?"}
    REASONING --> COMPLETE
    COMPLETE -->|"是"| RESULT["return {text, reasoning}"]
    COMPLETE -->|"否"| PARSE
```

---

## 十、版本变更记录

| 版本 | 日期 | 链路变更 |
|------|------|----------|
| v2.6.0 | 2026-07-24 | 提取_aiRequest公共方法，拆分PipelineManager |
| v2.7.0 | 2026-07-24 | 修复6个客户端问题，reasoning_content解析 |
| v2.7.1 | 2026-07-25 | **Skill链式执行**：多Skill从并行追加改为顺序链式，Agent全程参与每步 |

### v2.7.1 核心改动

**改前（v2.7.0及之前）：**
```
opts.skillIds.forEach(sid => {
    skillBlock += Skill.get(sid).template;  // 拼在一起
});
prompt += skillBlock;
apiRequest(prompt);  // 一次调用
```

**改后（v2.7.1）：**
```
if (skillIds.length === 1) {
    // 单Skill：追加模式（向后兼容）
    prompt += skill.template;
    apiRequest(prompt);
} else {
    // 多Skill：链式执行
    for (each skill in skillIds) {
        prompt = previousOutput + skill.template;
        result = apiRequest(prompt, agentConfig);  // Agent配置每步注入
        previousOutput = result;
    }
    return finalResult;
}
```

**影响范围：**
- 改动文件：renderer_v2.js（apiGenerate方法）
- 不需改动：pipeline-manager.js（调用方传skillIds数组，自动触发链式）
- 不需改动：panels.js（_plAddSkill/_plRemoveSkill存储逻辑不变）
- 向后兼容：单Skill绑定的行为完全不变

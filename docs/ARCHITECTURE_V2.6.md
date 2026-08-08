# 写作助手 v2.6.0 完整架构图

> 基于源代码逐行扫描生成，反映 v2.6.0 真实代码结构
> 生成时间：2026-07-24

---

## 一、完整链路图

应用从用户输入到最终正文输出的完整调用链路，包含 AI 调用、数据持久化、UI 联动三个维度。

```mermaid
flowchart TB
    subgraph 入口层
        UE[用户操作<br/>按钮点击/输入]
    end

    subgraph 大纲工作台
        OW[大纲编辑器<br/>outline-editor]
        OW -->|导入文件| importOutlineFile
        OW -->|AI共创| toggleAICoCreate
        OW -->|保存| saveOutlineBlur
        OW -->|锁定| lockOutline
        OW -->|拆解到设定合集| decomposeOutline
        OW -->|同步到流水线| _plLoadOutline
    end

    subgraph 设定合集
        SC[设定合集面板<br/>settingsCollection]
        SC -->|AI生成| _aiGenSettingsItem
        SC -->|手动添加| _addSettingsItem
        SC -->|编辑| _editSettingsItem
        SC -->|绑定| _toggleScBind
        SC -->|保存绑定| _saveScBind
        SC -->|同步到流水线| _syncBoundSettingsToPipeline
    end

    subgraph 生成流水线
        direction TB
        PL1[Step1 大纲<br/>pl-outline]
        PL2[Step2 设定<br/>pl-settings]
        PL3[Step3 卷纲<br/>pl-volumes]
        PL4[Step4 章节<br/>pl-chapters]
        PL5[Step5 正文<br/>pl-body]

        PL1 -->|确认| _plConfirmOutline
        _plConfirmOutline -->|写入| pl.outlineText
        _plConfirmOutline -->|失效下游| _plInvalidateDownstream

        PL2 -->|AI生成| _plGenSettings
        _plGenSettings -->|读取| pl.outlineText
        _plGenSettings -->|读取| _getBoundSettingsText
        _plGenSettings -->|保存| _plSaveSettings
        _plSaveSettings -->|写入| pl.settingsText

        PL3 -->|AI生成| _plGenVolumes
        _plGenVolumes -->|读取| pl.outlineText
        _plGenVolumes -->|读取| pl.settingsText
        _plGenVolumes -->|读取| _getBoundSettingsText
        _plGenVolumes -->|渲染卡片| _plRenderVolumeCards
        PL3 -->|保存| _plSaveVolume
        PL3 -->|确认| _plConfirmVolume

        PL4 -->|AI生成| _plGenChaptersForVolume
        _plGenChaptersForVolume -->|读取| vol.outline
        _plGenChaptersForVolume -->|读取| pl.settingsText
        _plGenChaptersForVolume -->|读取| _getBoundSettingsText
        _plGenChaptersForVolume -->|渲染卡片| _plRenderChapterCards
        PL4 -->|保存| _plSaveChapter
        PL4 -->|确认| _plConfirmChapter

        PL5 -->|AI生成| _plGenBody
        _plGenBody -->|读取| pl.outlineText
        _plGenBody -->|读取| pl.settingsText
        _plGenBody -->|读取| vol.outline
        _plGenBody -->|读取| ch.summary + ch.plot
        _plGenBody -->|读取| _getBoundSettingsText
        _plGenBody -->|写入| _plInsertBody
        _plInsertBody -->|同步| ChapterManager.updateChapter
        PL5 -->|确认| _plConfirmBody
    end

    subgraph AI调用层
        AR[_aiRequest 统一AI请求方法]
        AR -->|stream解析| RC[reasoning_content + content]
        AR -->|重试| RT[429/502/503 重试3次]
        AR -->|超时| TO[300s timeout]

        AG[apiGenerate 流水线+AI工具]
        AG -->|Agent注入| AI1[model + temperature + maxTokens + systemPrompt]
        AG -->|SKILL注入| SK1[skillBlock 追加到 prompt]
        AG -->|调用| AR

        SC2[streamChat 聊天面板]
        SC2 -->|UI回调| UI1[消息气泡 + markdown渲染]
        SC2 -->|调用| AR

        RAT[runAgentTest Agent测试]
        RAT -->|UI回调| UI2[结果区渲染]
        RAT -->|调用| AR
    end

    subgraph 左侧章节树
        CT[章节树面板 快捷操作]
        CT -->|同步到流水线| _syncTreeToPipeline
        CT -->|同步章节编辑| _syncChapterEdit
        CT -->|同步卷纲编辑| _syncVolumeEdit
        CT -->|快捷生成章节| _treeGenChapters
        CT -->|快捷生成正文| _treeGenBody
        _treeGenChapters -->|委托| _plGenChaptersForVolume
        _treeGenBody -->|委托| _plGenBodyForChapter
    end

    subgraph 中间编辑器
        ED[编辑器 editor-content]
        ED -->|AI生成| generateContent
        generateContent -->|读取| pl.outlineText
        generateContent -->|读取| pl.settingsText
        generateContent -->|调用| AG
        ED -->|保存| autoSaveChapter
    end

    subgraph 数据持久化
        SM[StorageManager localStorage封装]
        SM --> SM1["project-{pid}"]
        SM --> SM2[app-settings]
        SM --> SM3[agents]
        SM --> SM4[skills]
        SM --> SM5[providers]
        SM --> SM6[projects列表]
    end

    subgraph Manager层
        PM[ProjectManager]
        CM[ChapterManager]
        AM[AgentManager]
        SKM[SkillManager]
        PVM[ProviderManager]
    end

    UE --> OW
    UE --> SC
    UE --> PL1
    UE --> CT
    UE --> ED

    decomposeOutline -->|写入| SC
    _plLoadOutline -->|读取| PL1

    _syncBoundSettingsToPipeline -->|写入| pl.boundSettings
    _getBoundSettingsText -->|读取| pl.boundSettings

    _plInsertBody --> ED
    ChapterManager.updateChapter --> ED

    PM --> SM6
    CM --> SM1
    AM --> SM3
    SKM --> SM4
    PVM --> SM5

    _plData --> SM1
    _plPersist --> SM1
    _getProjectData --> SM1
    _saveProjectData --> SM1
    _scData --> SM1

    AR -->|fetch| API[外部API openapi.cloud-ai.cn]
```

---

## 二、完整数据结构图

所有存储在 StorageManager 中的数据结构，以及它们之间的嵌套关系。

```mermaid
flowchart LR
    subgraph StorageManager localStorage
        KS1["app-settings"]
        KS2["project-{pid}"]
        KS3["projects"]
        KS4["agents"]
        KS5["skills"]
        KS6["providers"]
    end

    subgraph "app-settings 结构"
        AS[app-settings]
        AS --> AS1[baseUrl: string]
        AS --> AS2[apiKey: string 加密]
        AS --> AS3[model: string]
        AS --> AS4[streamMode: boolean]
        AS --> AS5[systemPrompt: string]
        AS --> AS6[maxTokens: number]
        AS --> AS7[currentProjectId: string]
        AS --> AS8[currentAgentId: string]
        AS --> AS9[theme: dark/light]
    end

    subgraph "project-{pid} 结构"
        PJ["project-{pid}"]
        PJ --> PJ1[outline: string 大纲文本]
        PJ --> PJ2[outlineLocked: boolean]
        PJ --> PJ3["settingsCollection"]
        PJ --> PJ4["memories"]
        PJ --> PJ5["_pipeline"]
    end

    subgraph "settingsCollection 结构"
        SC[settingsCollection]
        SC --> SCC["categories[]"]
        SC --> SCI["items{}"]
        SCI --> SCItem["item-{id}"]
        SCItem --> SCI1[name: string]
        SCItem --> SCI2[category: string]
        SCItem --> SCI3[description: string]
        SCItem --> SCI4["attrs: {} 描述/特点/关系"]
        SCItem --> SCI5[bound: boolean 是否已绑定]
    end

    subgraph "memories 结构"
        MEM[memories]
        MEM --> MEMC["categories[] 情节/人物/世界观/伏笔"]
        MEM --> MEMI["items[]"]
        MEMI --> MEMItem[item]
        MEMItem --> MEM1[title: string]
        MEMItem --> MEM2[category: string]
        MEMItem --> MEM3[content: string]
    end

    subgraph "_pipeline 结构"
        PL["_pipeline"]
        PL --> PL1[step: 1-5 当前步骤]
        PL --> PL2[outlineConfirmed: boolean]
        PL --> PL3[settingsConfirmed: boolean]
        PL --> PL4[volumesConfirmed: boolean]
        PL --> PL5[chaptersConfirmed: boolean]
        PL --> PLA[agentId: string 当前绑定的Agent]
        PL --> PLS["s1Skills[] - s5Skills[]<br/>每步绑定的SKILL ID列表"]
        PL --> PLT["outlineText: string<br/>settingsText: string<br/>volumesText: string<br/>chaptersText: string<br/>bodyText: string"]
        PL --> PLV[volumeCount: number]
        PL --> PLC[chapterWordCount: number]
        PL --> PLBS["boundSettings[]<br/>从设定合集同步的绑定设定"]
        PL --> PLVI[currentVolumeIndex: number]
        PL --> PLVol["volumes[]"]
    end

    subgraph "volume 结构"
        VOL[volume]
        VOL --> V1[id: string]
        VOL --> V2[cmId: string 关联ChapterManager]
        VOL --> V3[name: string 卷名]
        VOL --> V4[outline: string 卷概要]
        VOL --> V5[summary: string]
        VOL --> V6[confirmed: boolean]
        VOL --> V7["chapters[]"]
    end

    subgraph "chapter 结构"
        CH[chapter]
        CH --> C1[id: string]
        CH --> C2[cmId: string 关联ChapterManager]
        CH --> C3[title: string 章节标题]
        CH --> C4[summary: string 章节梗概]
        CH --> C5[plot: string 剧情点]
        CH --> C6[body: string 正文内容]
        CH --> C7[bodyGenerated: boolean]
        CH --> C8[confirmed: boolean]
        CH --> C9[wordCount: number 目标字数]
    end

    subgraph "boundSettings 结构"
        BS[boundSettings item]
        BS --> BS1[id: string]
        BS --> BS2[name: string]
        BS --> BS3[category: string]
        BS --> BS4["attrs: {}"]
        BS --> BS5[enabled: boolean 是否启用]
    end

    subgraph "agents 结构"
        AG[agent item]
        AG --> AG1[id: string]
        AG --> AG2[name: string]
        AG --> AG3[model: string 空则用全局]
        AG --> AG4[temperature: number]
        AG --> AG5[maxTokens: number]
        AG --> AG6[systemPrompt: string]
    end

    subgraph "skills 结构"
        SK[skill item]
        SK --> SK1[id: string]
        SK --> SK2[name: string]
        SK --> SK3[description: string]
        SK --> SK4[category: string]
        SK --> SK5[injectMode: string]
        SK --> SK6[template: string 模板内容]
    end

    subgraph "providers 结构"
        PV[provider item]
        PV --> PV1[id: string]
        PV --> PV2[name: string]
        PV --> PV3[baseUrl: string]
        PV --> PV4[apiKey: string]
        PV --> PV5[model: string]
        PV --> PV6[active: boolean]
    end

    KS1 --- AS
    KS2 --- PJ
    KS3 --- PM[ProjectManager 列表]
    KS4 --- AG
    KS5 --- SK
    KS6 --- PV

    PJ3 --- SC
    PJ4 --- MEM
    PJ5 --- PL

    PLVol --- VOL
    V7 --- CH
    PLBS --- BS
```

---

## 三、完整数据内联递归关系图

展示数据如何在各模块之间流动、联动、失效和恢复。核心是"上游改动如何影响下游"。

```mermaid
flowchart TB
    subgraph 源头
        OW[大纲编辑器<br/>一切内联的源头]
    end

    subgraph 第一级递归
        OW -->|拆解| SC[设定合集<br/>人物/世界观/物种/物资]
        OW -->|同步| PL1["pl.outlineText<br/>流水线大纲文本"]
    end

    subgraph 第二级递归
        PL1 -->|AI读取生成| PL2["pl.settingsText<br/>流水线设定文本"]
        SC -->|绑定按钮| SYNC["_syncBoundSettingsToPipeline<br/>绑定即同步"]
        SYNC --> BS["pl.boundSettings[]<br/>绑定的设定列表"]
        BS -->|_getBoundSettingsText| BST["约束文本<br/>注入到每步生成"]
    end

    subgraph 第三级递归
        PL2 -->|AI读取生成| PL3["pl.volumes[]<br/>卷纲数组"]
        BST -->|注入约束| PL3
        PL3 --> VOL1[vol.name 卷名]
        PL3 --> VOL2[vol.outline 卷概要]
        PL3 --> VOL3[vol.confirmed 是否确认]
        VOL1 -->|用户可编辑| VOL1E[编辑后回写 pl.volumes]
        VOL2 -->|用户可编辑| VOL2E[编辑后回写 pl.volumes]
    end

    subgraph 第四级递归
        VOL2 -->|AI读取生成| PL4["vol.chapters[]<br/>章节数组"]
        BST -->|注入约束| PL4
        PL4 --> CH1[ch.title 标题]
        PL4 --> CH2[ch.summary 梗概]
        PL4 --> CH3[ch.plot 剧情点]
        PL4 --> CH4[ch.wordCount 目标字数]
        CH1 -->|用户可编辑| CH1E[编辑后回写]
        CH2 -->|用户可编辑| CH2E[编辑后回写]
        CH3 -->|用户可编辑| CH3E[编辑后回写]
        CH4 -->|用户可编辑| CH4E[编辑后回写]
    end

    subgraph 第五级递归
        PL1 -->|AI读取| PL5["ch.body 正文内容"]
        PL2 -->|AI读取| PL5
        VOL2 -->|AI读取| PL5
        CH2 -->|AI读取| PL5
        CH3 -->|AI读取| PL5
        CH4 -->|AI读取 目标字数| PL5
        BST -->|注入约束| PL5
        PL5 -->|_plInsertBody| CM[ChapterManager]
        CM -->|同步| ED[中间编辑器]
    end

    subgraph 失效传播机制
        INVALID["_plInvalidateDownstream<br/>fromStep 参数控制"]
        INVALID -->|fromStep=1| INV1["失效: 设定/卷纲/章节/正文<br/>全部重来"]
        INVALID -->|fromStep=2| INV2["失效: 卷纲/章节/正文<br/>卷纲confirmed=false"]
        INVALID -->|fromStep=3| INV3["失效: 该卷章节/正文<br/>vol.confirmed=false"]
        INVALID -->|fromStep=4| INV4["失效: 该章节正文<br/>ch.bodyGenerated=false"]
    end

    subgraph 双向同步机制
        direction LR
        TREE[左侧章节树<br/>快捷面板]
        TREE -->|_syncTreeToPipeline| PLDATA[流水线数据]
        PLDATA -->|_syncChapterEdit| TREE
        PLDATA -->|_syncVolumeEdit| TREE
        TREE -->|_treeGenChapters| PLGEN["委托流水线<br/>_plGenChaptersForVolume"]
        TREE -->|_treeGenBody| PLGEN2["委托流水线<br/>_plGenBodyForChapter"]
    end

    subgraph Agent和SKILL注入链路
        AGENT["AgentManager.get(agentId)"]
        AGENT --> AG1[model 注入到请求]
        AGENT --> AG2[temperature 注入到请求]
        AGENT --> AG3[maxTokens 注入到请求]
        AGENT --> AG4[systemPrompt 替换默认系统提示]

        SKILL["SkillManager.get(skillId)"]
        SKILL --> SK1[template 追加到用户prompt]
        SKILL --> SK2[日志记录注入的SKILL]
        SKILL --> SK3[toast提示用户]

        AGENT -->|每步都可绑定| PLSTEPS["s1Skills - s5Skills<br/>每步独立的SKILL列表"]
    end

    OW --> INVALID

    style OW fill:#e1f5fe,stroke:#0288d1,stroke-width:3px
    style PL5 fill:#fff3e0,stroke:#f57c00,stroke-width:3px
    style ED fill:#e8f5e9,stroke:#388e3c,stroke-width:3px
    style INVALID fill:#ffebee,stroke:#c62828,stroke-width:2px
    style TREE fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
```

---

## 附：AI 调用统一链路图

v2.6.0 重构后的 AI 调用架构，所有 AI 请求收拢到 _aiRequest 一个入口。

```mermaid
flowchart TB
    subgraph 调用方
        AG[apiGenerate<br/>流水线6处 + AI工具2处]
        SC[streamChat<br/>聊天面板]
        RAT[runAgentTest<br/>Agent测试]
        GC[generateContent<br/>编辑器直接生成]
    end

    subgraph 统一入口
        AR["_aiRequest(cfg)<br/>v2.6.0 新增"]
        AR --> AR1[构建 reqBody<br/>model + messages + stream + max_tokens]
        AR --> AR2[构建 signal<br/>AbortSignal.any 信号 + 超时]
        AR --> AR3[fetch 请求<br/>POST /chat/completions]
        AR --> AR4[流式解析<br/>reasoning_content + content 双解析]
        AR --> AR5[重试逻辑<br/>429/502/503 重试3次]
        AR --> AR6[reasoning fallback<br/>content为空时用reasoning]
    end

    subgraph 回调机制
        AR --> CB1[onChunk: 流式文本回调]
        AR --> CB2[onReasoning: 推理过程回调]
        AR --> CB3[onPause: 暂停控制]
        AR --> CB4[onUsage: token统计]
    end

    subgraph 外部API
        API["openapi.cloud-ai.cn/v1<br/>deepseek-v4-flash<br/>推理模型"]
    end

    AG -->|Agent注入 + SKILL注入| AR
    SC -->|UI渲染回调| AR
    RAT -->|结果区渲染回调| AR
    GC -->|调用 apiGenerate| AR

    AR3 --> API

    style AR fill:#e8f5e9,stroke:#2e7d32,stroke-width:3px
    style API fill:#fff3e0,stroke:#f57c00,stroke-width:2px
```

---

## 附：文件架构图

v2.6.0 的文件拆分后的模块边界。

```mermaid
flowchart TB
    subgraph "HTML入口"
        HTML["renderer.html<br/>加载所有脚本"]
    end

    subgraph "核心逻辑层"
        RV["renderer_v2.js<br/>3622行<br/>App class + 106方法<br/>AI调用/编辑器/聊天/项目"]
        PM["panels.js<br/>1215行<br/>56方法<br/>大纲工作台/设定合集/章节树同步/插件市场"]
        PLM["js/pipeline-manager.js<br/>1229行<br/>47方法<br/>流水线5步逻辑"]
    end

    subgraph "Manager层"
        SM["js/storage.js<br/>136行<br/>StorageManager"]
        PJM["js/project-manager.js<br/>74行<br/>ProjectManager"]
        CM["js/chapter-manager.js<br/>201行<br/>ChapterManager"]
        AGM["js/agent-manager.js<br/>76行<br/>AgentManager"]
        SKM["js/skill-manager.js<br/>133行<br/>SkillManager"]
        PVM["js/provider-manager.js<br/>161行<br/>ProviderManager"]
        UT["js/utils.js<br/>20行<br/>通用工具"]
    end

    subgraph "Electron层"
        MAIN["main.js<br/>184行<br/>窗口管理/文件系统"]
        PRE["preload.js<br/>11行<br/>IPC桥接"]
    end

    subgraph "样式层"
        CSS["style.css<br/>6940行"]
        CSS1["styles/components/<br/>app-layout.css"]
        CSS2["styles/components/<br/>modal-panel.css"]
        CSS3["styles/components/<br/>form-editor.css"]
    end

    HTML --> RV
    HTML --> PLM
    HTML --> PM
    HTML --> CSS
    HTML --> CSS1
    HTML --> CSS2
    HTML --> CSS3

    RV --> SM
    RV --> PJM
    RV --> CM
    RV --> AGM
    RV --> SKM
    RV --> PVM
    RV --> UT

    PM --> SM
    PM --> CM
    PM --> AGM
    PM --> SKM

    PLM --> SM
    PLM --> CM
    PLM --> AGM
    PLM --> SKM

    MAIN --> PRE
    PRE --> RV
```

---

## 数据流总结

| 维度 | 旧版 v2.5.0 | 新版 v2.6.0 |
|:---|:---|:---|
| AI 调用入口 | 3 处独立 fetch | 1 个 _aiRequest 统一入口 |
| 流水线文件 | 混在 panels.js 中 | 独立 js/pipeline-manager.js |
| reasoning_content 解析 | 仅 apiGenerate 有 | 三处统一解析 |
| 重试逻辑 | 仅 apiGenerate 有 | _aiRequest 统一处理 |
| 数据存储 | StorageManager 统一 | 不变（已合理） |
| 设定合集联动 | 单向同步 | 绑定即同步 + enabled 开关 |
| 章节树联动 | 部分同步 | 双向同步 + 快捷委托 |
| 失效传播 | 无 | _plInvalidateDownstream 级联失效 |

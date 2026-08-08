# 生成流水线结构导向图

## 一、整体流程总览

```mermaid
graph TB
    subgraph 入口["入口"]
        OE["大纲编辑器<br/>导入/AI共创"]
    end

    subgraph 流水线["生成流水线 5 步"]
        S1["Step 1 大纲"]
        S2["Step 2 设定"]
        S3["Step 3 卷纲"]
        S4["Step 4 章节"]
        S5["Step 5 正文"]
    end

    subgraph 输出["输出"]
        ED["中间编辑区<br/>editor-content"]
        CM["ChapterManager<br/>持久化存储"]
        TREE["左侧章节树<br/>快捷操作面板"]
    end

    OE -->|"自动同步<br/>outlineText"| S1
    S1 -->|"确认后传递"| S2
    S2 -->|"确认后传递"| S3
    S3 -->|"确认后传递"| S4
    S4 -->|"确认后传递"| S5
    S5 -->|"生成完成同步"| ED
    S5 -->|"写入持久化"| CM
    S5 <-->|"双向联动"| TREE
    TREE -->|"快捷生成入口"| S5

    style S1 fill:#4CAF50,color:#fff
    style S2 fill:#2196F3,color:#fff
    style S3 fill:#FF9800,color:#fff
    style S4 fill:#9C27B0,color:#fff
    style S5 fill:#F44336,color:#fff
```

## 二、每一步的详细逻辑导向

### Step 1：大纲

```mermaid
graph LR
    subgraph 输入["输入"]
        I1["大纲编辑器内容<br/>outline-editor.value"]
        I2["或 ProjectManager.outline"]
    end

    subgraph 操作["操作"]
        A1["用户编辑大纲"]
        A2["点击确认大纲<br/>_plConfirmOutline()"]
    end

    subgraph 输出["输出"]
        O1["pl.outlineText = 大纲全文"]
        O2["pl.outlineConfirmed = true"]
        O3["pl.step = 2"]
        O4["保存到 ProjectData.outline"]
    end

    subgraph 级联["级联失效"]
        C1["_plInvalidateDownstream 2"]
        C2["设定/卷纲/章节 全部标记未确认"]
    end

    I1 --> A1 --> A2
    I2 --> A2
    A2 --> O1 --> O2 --> O3 --> O4
    A2 --> C1 --> C2
```

### Step 2：设定

```mermaid
graph LR
    subgraph 输入["输入"]
        I1["pl.outlineText<br/>上一步的大纲"]
        I2["用户勾选的分类<br/>pl-gen-cat:checked"]
        I3["绑定设定文本<br/>_getBoundSettingsText()"]
        I4["SKILL: pl.s2Skills"]
    end

    subgraph 操作["操作"]
        A1["AI生成<br/>_plGenSettings()"]
        A2["手动保存到设定合集<br/>_plSaveSettings()"]
        A3["绑定设定开关<br/>_plRenderBoundSettings()"]
    end

    subgraph API["API调用"]
        P1["参数: 大纲 + 分类列表 + 约束设定"]
        P2["模型: deepseek-v4-flash"]
        P3["Agent: pl.agentId"]
        P4["返回: JSON格式设定列表"]
    end

    subgraph 输出["输出"]
        O1["pl.settingsText = 设定全文"]
        O2["设定合集更新<br/>sc.items 分类填充"]
        O3["绑定设定同步到流水线"]
    end

    I1 --> P1
    I2 --> P1
    I3 --> P1
    I4 --> P3
    P1 --> A1
    A1 --> P4 --> O1
    O1 --> A2 --> O2
    I3 --> A3 --> O3
```

### Step 3：卷纲

```mermaid
graph LR
    subgraph 输入["输入"]
        I1["pl.outlineText 大纲"]
        I2["pl.settingsText 设定"]
        I3["绑定设定文本"]
        I4["卷数选择<br/>pl-volume-count"]
        I5["SKILL: pl.s3Skills"]
    end

    subgraph 操作["操作"]
        A1["AI生成卷纲<br/>_plGenVolumes()"]
        A2["手动添加空卷"]
        A3["编辑卷名和纲要"]
        A4["确认单个卷<br/>_plConfirmVolume i"]
        A5["全部确认<br/>volumesConfirmed = true"]
    end

    subgraph API["API调用"]
        P1["参数: 大纲+设定+拆分N卷"]
        P2["返回: JSON数组 name+outline"]
    end

    subgraph 卡片渲染["卡片渲染"]
        R1["_plRenderVolumeCards()"]
        R2["每卷独立卡片"]
        R3["卷名输入框"]
        R4["纲要编辑框"]
        R5["确认/删除按钮"]
    end

    subgraph 输出["输出"]
        O1["pl.volumes 数组"]
        O2["每卷: id/name/outline/confirmed/chapters"]
        O3["volumesConfirmed = true"]
    end

    I1 --> P1
    I2 --> P1
    I3 --> P1
    I4 --> P1
    I5 --> P1
    P1 --> A1 --> P2
    P2 --> R1 --> R2
    R2 --> R3 & R4 & R5
    A2 --> R1
    R4 --> A3
    R5 --> A4 --> A5
    A5 --> O3
    P2 --> O1 --> O2
```

### Step 4：章节

```mermaid
graph LR
    subgraph 输入["输入"]
        I1["pl.outlineText 大纲"]
        I2["pl.settingsText 设定"]
        I3["绑定设定文本"]
        I4["当前卷: vol.name + vol.outline"]
        I5["章节数选择"]
        I6["SKILL: pl.s4Skills"]
    end

    subgraph 操作["操作"]
        A1["AI生成章节<br/>_plGenChaptersForVolume volIdx"]
        A2["手动添加空章节"]
        A3["编辑标题/剧情点/字数"]
        A4["确认单个章节<br/>_plConfirmChapter"]
        A5["全部确认<br/>chaptersConfirmed = true"]
    end

    subgraph API["API调用"]
        P1["参数: 大纲+设定+当前卷概要+章节数"]
        P2["返回: JSON数组 title+plot"]
    end

    subgraph 卡片渲染["卡片渲染"]
        R1["_plRenderChapterCards volIdx"]
        R2["每章独立卡片"]
        R3["标题输入框"]
        R4["剧情点编辑框"]
        R5["字数输入框"]
        R6["确认/删除按钮"]
    end

    subgraph 输出["输出"]
        O1["vol.chapters 数组"]
        O2["每章: id/title/plot/wordCount/confirmed"]
        O3["chaptersConfirmed = true"]
        O4["pl.step = 5"]
    end

    I1 --> P1
    I2 --> P1
    I3 --> P1
    I4 --> P1
    I5 --> P1
    I6 --> P1
    P1 --> A1 --> P2
    P2 --> R1 --> R2
    R2 --> R3 & R4 & R5 & R6
    A2 --> R1
    R4 --> A3
    R6 --> A4 --> A5
    A5 --> O3 --> O4
    P2 --> O1 --> O2
```

### Step 5：正文

```mermaid
graph LR
    subgraph 输入["输入"]
        I1["pl.outlineText 全书大纲"]
        I2["pl.settingsText 设定摘要"]
        I3["绑定设定文本"]
        I4["vol.name + vol.outline<br/>当前卷概要"]
        I5["ch.title + ch.plot<br/>当前章节剧情点"]
        I6["ch.wordCount<br/>目标字数"]
        I7["SKILL: pl.s5Skills"]
    end

    subgraph 操作["操作"]
        A1["AI生成正文<br/>_plGenBody / _plGenBodyForChapter"]
        A2["插入到编辑器<br/>_plInsertBody()"]
        A3["确认正文<br/>_plConfirmBody()"]
    end

    subgraph API["API调用"]
        P1["参数: 大纲+设定+卷概要+章节剧情点+目标字数"]
        P2["maxTokens: wordCount * 5"]
        P3["stream: reasoning_content + content"]
        P4["超时: 300秒"]
        P5["返回: 正文全文"]
    end

    subgraph 联动输出["联动输出"]
        O1["pl-body-result 显示生成内容"]
        O2["editor-content.value = 正文"]
        O3["editor-title = 章节标题"]
        O4["ChapterManager.updateChapter"]
        O5["renderChapterTree 刷新树"]
        O6["currentVolumeId / currentChapterId"]
    end

    I1 & I2 & I3 & I4 & I5 & I6 & I7 --> P1
    P1 --> A1
    A1 --> P3 --> P5
    P5 --> O1
    P5 --> O2 & O3 & O4 & O5 & O6
    O2 --> A2
    P5 --> A3
```

## 三、数据内联递归关系

```mermaid
graph TD
    OUTLINE["pl.outlineText<br/>全书大纲"]
    SETTINGS["pl.settingsText<br/>设定摘要"]
    BOUND["绑定设定文本<br/>_getBoundSettingsText"]
    VOL["vol.name + vol.outline<br/>当前卷概要"]
    CH["ch.title + ch.plot<br/>当前章节剧情点"]
    WC["ch.wordCount<br/>目标字数"]
    BODY["ch.body<br/>生成的正文"]

    OUTLINE -->|"Step 2"| SETTINGS
    OUTLINE -->|"Step 3"| VOL
    SETTINGS -->|"Step 3"| VOL
    OUTLINE -->|"Step 4"| CH
    SETTINGS -->|"Step 4"| CH
    VOL -->|"Step 4"| CH
    OUTLINE -->|"Step 5"| BODY
    SETTINGS -->|"Step 5"| BODY
    BOUND -->|"Step 2-5 全程"| SETTINGS
    BOUND -->|"Step 3-5"| VOL
    BOUND -->|"Step 4-5"| CH
    VOL -->|"Step 5"| BODY
    CH -->|"Step 5"| BODY
    WC -->|"Step 5 maxTokens"| BODY

    style OUTLINE fill:#4CAF50,color:#fff
    style SETTINGS fill:#2196F3,color:#fff
    style BOUND fill:#00BCD4,color:#fff
    style VOL fill:#FF9800,color:#fff
    style CH fill:#9C27B0,color:#fff
    style WC fill:#795548,color:#fff
    style BODY fill:#F44336,color:#fff
```

## 四、左侧章节树联动机制

```mermaid
graph TB
    subgraph 左侧树["左侧章节树 快捷面板"]
        T1["章节树渲染<br/>renderChapterTree()"]
        T2["data-a=gen-body 按钮"]
        T3["data-a=open-ch 按钮"]
        T4["tree-gen-btn<br/>AI生成章节"]
    end

    subgraph 同步机制["同步机制"]
        S1["_syncTreeToPipeline()<br/>树数据 -> 流水线"]
        S2["renderChapterTree()<br/>流水线 -> 树渲染"]
    end

    subgraph 流水线["生成流水线"]
        P1["_plGenBodyForChapter vi, ci<br/>直接生成正文"]
        P2["_plGenChaptersDirect volIdx<br/>直接生成章节"]
        P3["_plPersist<br/>持久化到存储"]
    end

    subgraph 编辑区["中间编辑区"]
        E1["editor-content<br/>正文内容"]
        E2["editor-title<br/>章节标题"]
    end

    T2 -->|"点击"| S1
    S1 --> P1
    P1 -->|"生成完成"| E1 & E2
    P1 -->|"持久化"| P3
    P3 -->|"刷新"| T1
    T4 -->|"点击"| S1
    S1 --> P2
    P2 --> P3
    P3 --> T1
    T3 -->|"打开章节"| E1 & E2
```

## 五、级联失效机制

```mermaid
graph TD
    CHANGE["某步骤内容被修改"]
    INV["_plInvalidateDownstream fromStep"]

    subgraph fromStep1["fromStep = 1 大纲变更"]
        F1A["settingsConfirmed = false"]
        F1B["volumesConfirmed = false"]
        F1C["chaptersConfirmed = false"]
        F1D["所有卷 confirmed = false"]
        F1E["所有章节 confirmed = false"]
    end

    subgraph fromStep2["fromStep = 2 设定变更"]
        F2A["volumesConfirmed = false"]
        F2B["chaptersConfirmed = false"]
        F2C["所有卷 confirmed = false"]
    end

    subgraph fromStep3["fromStep = 3 卷纲变更"]
        F3A["该卷 confirmed = false"]
        F3B["该卷下所有章节 confirmed = false"]
        F3C["chaptersConfirmed = false"]
    end

    CHANGE --> INV
    INV -->|"step=1"| fromStep1
    INV -->|"step=2"| fromStep2
    INV -->|"step=3"| fromStep3
```

## 六、完整数据结构

```mermaid
graph LR
    subgraph Pipeline["pl = _plData()"]
        PL1["outlineText: string<br/>全书大纲"]
        PL2["outlineConfirmed: boolean"]
        PL3["settingsText: string<br/>设定摘要"]
        PL4["settingsConfirmed: boolean"]
        PL5["volumes: Volume[]<br/>卷纲数组"]
        PL6["volumesConfirmed: boolean"]
        PL7["chaptersConfirmed: boolean"]
        PL8["step: number<br/>当前步骤 1-5"]
        PL9["agentId: string<br/>绑定的Agent"]
        PLA["s2Skills: string[]<br/>设定SKILL"]
        PLB["s3Skills: string[]<br/>卷纲SKILL"]
        PLC["s4Skills: string[]<br/>章节SKILL"]
        PLD["s5Skills: string[]<br/>正文SKILL"]
    end

    subgraph Volume["Volume 卷纲"]
        V1["id: vol_timestamp<br/>唯一标识"]
        V2["name: string<br/>卷名"]
        V3["outline: string<br/>卷纲要"]
        V4["confirmed: boolean"]
        V5["chapters: Chapter[]<br/>章节数组"]
    end

    subgraph Chapter["Chapter 章节"]
        C1["id: ch_timestamp<br/>唯一标识"]
        C2["title: string<br/>章节标题"]
        C3["plot: string<br/>剧情点"]
        C4["wordCount: number<br/>目标字数"]
        C5["confirmed: boolean"]
        C6["body: string<br/>生成的正文"]
        C7["bodyGenerated: boolean"]
    end

    PL5 --> V1
    V5 --> C1
```

## 七、API 调用链路

```mermaid
sequenceDiagram
    participant U as 用户
    participant App as 应用
    participant API as API供应商
    participant DB as IndexedDB

    U->>App: 点击生成按钮
    App->>App: _plData() 读取流水线数据
    App->>App: 组装参数 大纲+设定+卷概要+章节
    App->>App: 注入SKILL内容到system prompt
    App->>API: POST /chat/completions stream=true
    API-->>App: delta.reasoning_content 推理过程
    App->>App: onChunk 显示AI思考中
    API-->>App: delta.content 实际内容
    App->>App: onChunk 实时更新pl-body-result
    API-->>App: [DONE] 完成
    App->>App: 返回fullText 或 reasoningText
    App->>App: ch.body = text
    App->>App: _plPersist 持久化
    App->>App: editor-content.value = text
    App->>App: ChapterManager.updateChapter
    App->>App: renderChapterTree 刷新树
    App-->>U: 编辑区显示正文
```

## 八、入口与触发方式汇总

| 步骤 | 触发方式 | 函数 | SKILL字段 |
|:---|:---|:---|:---|
| Step 1 大纲 | 流水线面板确认按钮 | _plConfirmOutline() | 无 |
| Step 1 大纲 | 大纲编辑器保存自动同步 | _plData().outlineText = value | 无 |
| Step 2 设定 | 流水线面板AI生成按钮 | _plGenSettings() | pl.s2Skills |
| Step 2 设定 | 手动保存到设定合集 | _plSaveSettings() | 无 |
| Step 3 卷纲 | 流水线面板AI生成按钮 | _plGenVolumes() | pl.s3Skills |
| Step 3 卷纲 | 手动添加空卷 | _plRenderVolumeCards() | 无 |
| Step 3 卷纲 | 确认单个卷 | _plConfirmVolume(i) | 无 |
| Step 4 章节 | 流水线面板AI生成按钮 | _plGenChaptersForVolume(vi) | pl.s4Skills |
| Step 4 章节 | 左侧树AI生成章节 | _treeGenChapters -> _plGenChaptersDirect(vi) | pl.s4Skills |
| Step 4 章节 | 手动添加空章节 | _plRenderChapterCards() | 无 |
| Step 4 章节 | 确认单个章节 | _plConfirmChapter(vi, ci) | 无 |
| Step 4 章节 | 全部确认进入正文 | _plConfirmAllChapters() | 无 |
| Step 5 正文 | 流水线面板AI生成按钮 | _plGenBody() | pl.s5Skills |
| Step 5 正文 | 左侧树生成按钮 | _treeGenBody -> _plGenBodyForChapter(vi, ci) | pl.s5Skills |
| Step 5 正文 | 插入到编辑器 | _plInsertBody() | 无 |
| Step 5 正文 | 确认正文 | _plConfirmBody() | 无 |

## 九、每步上下文传递内容

| 步骤 | 传递给API的上下文 | 来源 |
|:---|:---|:---|
| Step 2 设定 | 大纲全文 | pl.outlineText |
| Step 2 设定 | 分类列表 | 用户勾选 |
| Step 2 设定 | 约束设定 | _getBoundSettingsText() |
| Step 3 卷纲 | 大纲全文 | pl.outlineText |
| Step 3 卷纲 | 设定摘要 | pl.settingsText |
| Step 3 卷纲 | 约束设定 | _getBoundSettingsText() |
| Step 3 卷纲 | 拆分卷数 | pl-volume-count |
| Step 4 章节 | 大纲全文 | pl.outlineText |
| Step 4 章节 | 设定摘要 | pl.settingsText |
| Step 4 章节 | 约束设定 | _getBoundSettingsText() |
| Step 4 章节 | 当前卷名+纲要 | vol.name + vol.outline |
| Step 4 章节 | 章节数 | pl-volume-count |
| Step 5 正文 | 大纲全文 | pl.outlineText |
| Step 5 正文 | 设定摘要 | pl.settingsText |
| Step 5 正文 | 约束设定 | _getBoundSettingsText() |
| Step 5 正文 | 当前卷名+纲要 | vol.name + vol.outline |
| Step 5 正文 | 章节标题+剧情点 | ch.title + ch.plot |
| Step 5 正文 | 目标字数 | ch.wordCount |
| Step 5 正文 | maxTokens | wordCount * 5 |
| 全步骤 | Agent | pl.agentId |
| 全步骤 | SKILL | 对应步骤的 sNSkills |

## 十、存储位置

| 数据 | 存储位置 | 格式 |
|:---|:---|:---|
| 流水线完整数据 | wa_project-{pid}.json 的 _pipeline 字段 | JSON |
| 章节内容 | wa_chapters_{pid}.json | JSON |
| 设定合集 | 项目数据的 settingsCollection | JSON |
| 项目基本信息 | wa_projects.json | JSON |
| 存储目录 | %APPDATA%/writing-assistant/data/ | 文件系统 |

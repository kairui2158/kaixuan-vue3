# API 直写 100% 闭环调研数据清点

- 生成时间：2026-09-23T16:47:15.094Z
- 去重仓库：644
- 去重缓存源码文件：2081
- 物理缓存文件：2671
- 调研轮次：200（10 维度 x 20 轮）
- 种子仓库覆盖：59/59
- 缓存异常：0
- 抓取失败：undefined
- 搜到但无可缓存源码文件的仓库：136

## 维度基线

| 维度 | 仓库数 | 缓存文件数 | 主要语言 |
|---|---:|---:|---|
| protocol | 74 | 226 | TypeScript:27, Python:22, JavaScript:7 |
| permission | 76 | 232 | TypeScript:23, Python:19, unknown:9 |
| editing | 76 | 176 | TypeScript:17, JavaScript:16, Python:16 |
| statemachine | 66 | 199 | Python:16, TypeScript:14, Go:9 |
| toolloop | 74 | 212 | Python:37, TypeScript:16, unknown:6 |
| observability | 76 | 333 | Python:22, TypeScript:12, Go:11 |
| longdocument | 72 | 190 | Python:29, TypeScript:12, Go:8 |
| provider | 68 | 317 | Python:34, TypeScript:15, Go:5 |
| routing | 76 | 108 | Python:30, unknown:19, TypeScript:6 |
| verification | 75 | 173 | TypeScript:20, JavaScript:15, Python:13 |

## 轮次口径

第 1-10 轮为原方案 V1 采集的回放记录：原始脚本同轮 10 个维度互相覆盖，源数据只剩每维度一个仓库集合，query 统一登记为 `legacy-search`，因此这 10 轮只能按“V1 事实基线”计数，不能伪称 10 组不同查询。第 11-20 轮为 V2 新采集：每维度 10 个查询词全部换新，按维度独立落盘，不存在同轮覆盖。

| 维度 | 11-20 轮查询词 | 1-10 轮回放口径 |
|---|---:|---|
| protocol | 10 | V1 回放 10 轮 |
| permission | 10 | V1 回放 10 轮 |
| editing | 10 | V1 回放 10 轮 |
| statemachine | 10 | V1 回放 10 轮 |
| toolloop | 10 | V1 回放 10 轮 |
| observability | 10 | V1 回放 10 轮 |
| longdocument | 10 | V1 回放 10 轮 |
| provider | 10 | V1 回放 10 轮 |
| routing | 10 | V1 回放 10 轮 |
| verification | 10 | V1 回放 10 轮 |

## 语言分布

| 语言 | 仓库数 |
|---|---:|
| Python | 190 |
| TypeScript | 157 |
| unknown | 59 |
| JavaScript | 57 |
| Go | 48 |
| Rust | 36 |
| Java | 21 |
| Jupyter Notebook | 13 |
| Shell | 11 |
| C | 9 |
| C# | 8 |
| HTML | 7 |
| C++ | 6 |
| Clojure | 2 |
| Kotlin | 2 |
| Makefile | 2 |
| Objective-C | 2 |
| Swift | 2 |
| CSS | 1 |
| Dart | 1 |
| Lua | 1 |
| MDX | 1 |
| OpenEdge ABL | 1 |
| PHP | 1 |
| PowerShell | 1 |
| Scala | 1 |
| SCSS | 1 |
| Svelte | 1 |
| Vim Script | 1 |
| Vue | 1 |

## 文件类型分布

| 扩展名 | 文件数 |
|---|---:|
| .py | 498 |
| .ts | 484 |
| .md | 415 |
| .json | 145 |
| .go | 137 |
| .rs | 129 |
| .tsx | 119 |
| .js | 80 |
| .java | 51 |
| .kt | 18 |
| .jsx | 5 |

## 未进入清点口径的仓库

以下仓库在 GitHub 搜索轮次中出现，但当前采集策略没有拿到任何可核对源码文件，因此不计入有效仓库与缓存文件清点。这不是丢数据，而是清点口径不把“无源码证据的搜索结果”当作证据。

- punkpeye/awesome-mcp-servers（protocol / round-1 / stars 95451）
- owainlewis/awesome-artificial-intelligence（permission / round-1 / stars 16544）
- firmai/industry-machine-learning（permission / round-1 / stars 7484）
- agarrharr/awesome-cli-apps（editing / round-1 / stars 20451）
- textAngular/textAngular（editing / round-1 / stars 3942）
- google-research/bert（statemachine / round-1 / stars 40042）
- facebookresearch/seamless_communication（statemachine / round-1 / stars 11863）
- hesreallyhim/awesome-claude-code（toolloop / round-1 / stars 54479）
- go-martini/martini（longdocument / round-1 / stars 11599）
- openai/openai-realtime-agents（provider / round-1 / stars 6989）
- PublicAffairs/openai-gemini（provider / round-1 / stars 3661）
- keon/awesome-nlp（routing / round-1 / stars 19028）
- bharathgs/Awesome-pytorch-list（routing / round-1 / stars 16679）
- ritchieng/the-incredible-pytorch（routing / round-1 / stars 12648）
- ripienaar/free-for-dev（verification / round-1 / stars 138028）
- vuejs/awesome-vue（verification / round-1 / stars 73546）
- VoltAgent/awesome-agent-skills（verification / round-1 / stars 34767）
- TheJambo/awesome-testing（verification / round-1 / stars 2380）
- goss-org/goss（protocol / round-11 / stars 5975）
- plumatic/schema（protocol / round-11 / stars 2462）
- vudovn/ag-kit（permission / round-11 / stars 8180）
- enaqx/awesome-react（editing / round-11 / stars 74680）
- yjs/yjs（editing / round-11 / stars 22830）
- daytonaio/daytona（statemachine / round-11 / stars 71728）
- sanbuphy/learn-coding-agent（statemachine / round-11 / stars 12280）
- OneUptime/oneuptime（observability / round-11 / stars 7643）
- mrmans0n/smart-location-lib（routing / round-11 / stars 1638）
- AdevintaSpain/Leku（routing / round-11 / stars 779）
- ghuntley/amazon-kiro.kiro-agent-source-code-analysis（routing / round-11 / stars 367）
- IBM-Design/icons（routing / round-11 / stars 192）
- dexteryy/spellbook-of-modern-webdev（verification / round-11 / stars 17911）
- buger/jsonparser（protocol / round-12 / stars 5657）
- ShawnDEvans/smbmap（permission / round-12 / stars 2078）
- The-Pocket/PocketFlow（editing / round-12 / stars 11193）
- AgriciDaniel/claude-ads（editing / round-12 / stars 9499）
- dbohdan/structured-text-tools（editing / round-12 / stars 7149）
- posabsolute/jQuery-Validation-Engine（editing / round-12 / stars 2535）
- meirwah/awesome-workflow-engines（statemachine / round-12 / stars 7933）
- microsoft/pg_durable（statemachine / round-12 / stars 2821）
- guillaumemeyer/watermarks-remover（toolloop / round-12 / stars 22654）
- promptslab/Awesome-Prompt-Engineering（toolloop / round-12 / stars 6339）
- DynamoRIO/dynamorio（observability / round-12 / stars 3165）
- shareAI-lab/learn-claude-code（provider / round-12 / stars 77505）
- jim-schwoebel/voice_datasets（routing / round-12 / stars 2230）
- AtmaHou/Task-Oriented-Dialogue-Research-Progress-Survey（routing / round-12 / stars 1237）
- declare-lab/MELD（routing / round-12 / stars 1088）
- qinlibo-hit/Awesome-SLU-Survey（routing / round-12 / stars 893）
- arthurspk/guiadeelectron（verification / round-12 / stars 8）
- wsw0108/playwright-fake-dialog（verification / round-12 / stars 4）
- oscartbeaumont/spectroscope（verification / round-12 / stars 3）
- PuerkitoBio/goquery（protocol / round-13 / stars 14995）
- sandboxie-plus/Sandboxie（permission / round-13 / stars 19525）
- ashishb/android-security-awesome（permission / round-13 / stars 9707）
- ai-boost/awesome-harness-engineering（permission / round-13 / stars 4482）
- google/ax（toolloop / round-13 / stars 8498）
- remzi-arpacidusseau/ostep-code（observability / round-13 / stars 4423）
- ai-boost/awesome-prompts（routing / round-13 / stars 8927）
- binhnguyennus/awesome-scalability（verification / round-13 / stars 74211）
- rothgar/awesome-tuis（verification / round-13 / stars 20707）
- avelino/awesome-go（permission / round-14 / stars 185254）
- Hack-with-Github/Awesome-Hacking（permission / round-14 / stars 121038）
- MunGell/awesome-for-beginners（permission / round-14 / stars 89524）
- git/git（permission / round-14 / stars 63282）
- awesome-foss/awesome-sysadmin（permission / round-14 / stars 35237）
- toniblyx/my-arsenal-of-aws-security-tools（permission / round-14 / stars 9508）
- appcypher/awesome-mcp-servers（permission / round-14 / stars 5777）
- Consensys/ethereum-developer-tools-list（permission / round-14 / stars 5398）
- IanLunn/Hover（editing / round-14 / stars 29399）
- nidhinjs/prompt-master（editing / round-14 / stars 13566）
- VladKopanev/zio-saga（statemachine / round-14 / stars 228）
- ruanyf/webpack-demos（longdocument / round-14 / stars 9560）
- hindupuravinash/the-gan-zoo（routing / round-14 / stars 14691）
- yizhiyanhua-ai/fireworks-tech-graph（routing / round-14 / stars 11535）
- satellite-image-deep-learning/techniques（routing / round-14 / stars 10269）
- xialeiliu/Awesome-Incremental-Learning（routing / round-14 / stars 4528）
- bragai/bRAG-langchain（routing / round-14 / stars 4167）
- maziarraissi/Applied-Deep-Learning（routing / round-14 / stars 3566）
- lucidrains/audiolm-pytorch（routing / round-14 / stars 2624）
- RobotiumTech/robotium（verification / round-14 / stars 2853）
- mojoaxel/awesome-regression-testing（verification / round-14 / stars 2416）
- mxschmitt/awesome-playwright（verification / round-14 / stars 1581）
- bkrem/awesome-solidity（protocol / round-15 / stars 7052）
- firecrawl/firecrawl-mcp-server（permission / round-15 / stars 7504）
- systemdesign42/system-design-academy（statemachine / round-15 / stars 28953）
- idugalic/micro-company（statemachine / round-15 / stars 362）
- mheiber/redux-machine（statemachine / round-15 / stars 335）
- sbilly/awesome-security（toolloop / round-15 / stars 14880）
- aasthas2022/SDE-Interview-and-Prep-Roadmap（toolloop / round-15 / stars 3279）
- indy256/Full-stack-Developer-Interview-Questions-and-Answers（toolloop / round-15 / stars 2740）
- stephenh/ts-proto（toolloop / round-15 / stars 2594）
- 0x90/wifi-arsenal（toolloop / round-15 / stars 2203）
- modelcontextprotocol/servers（longdocument / round-15 / stars 90563）
- MoonshotAI/Kimi-K2（provider / round-15 / stars 11112）
- styfeng/DataAug4NLP（routing / round-15 / stars 834）
- snakeztc/NeuralDialogPapers（routing / round-15 / stars 643）
- OJ/gobuster（permission / round-16 / stars 14150）
- cuixueshe/earthworm（permission / round-16 / stars 11079）
- ibireme/YYText（editing / round-16 / stars 8863）
- drona23/claude-token-efficient（longdocument / round-16 / stars 6054）
- noamseg/interview-coach-skill（routing / round-16 / stars 2269）
- Anil-matcha/awesome-jev-by-typesafe（routing / round-16 / stars 815）
- IDEA-Research/Grounded-Segment-Anything（statemachine / round-17 / stars 17734）
- freestylefly/awesome-gpt-image-2（longdocument / round-17 / stars 33373）
- metorial/metorial（provider / round-17 / stars 3358）
- KingOfBugbounty/KingOfBugBountyTips（routing / round-17 / stars 5541）
- Intent-Lab/VisionClaw（routing / round-17 / stars 2556）
- eugeneyan/ml-design-docs（routing / round-17 / stars 716）
- xamarin/Xamarin.Auth（routing / round-17 / stars 529）
- minio/minio（protocol / round-18 / stars 61356）
- analysis-tools-dev/static-analysis（permission / round-18 / stars 14800）
- markets/awesome-ruby（permission / round-18 / stars 14158）
- rohitg00/awesome-claude-code-toolkit（permission / round-18 / stars 2635）
- dreikanter/ruby-bookmarks（permission / round-18 / stars 2306）
- josephmisiti/awesome-machine-learning（routing / round-18 / stars 74414）
- r0f1/datascience（routing / round-18 / stars 4672）
- jondot/awesome-react-native（verification / round-18 / stars 35705）
- styfle/cancel-workflow-action（statemachine / round-19 / stars 981）
- daytona/ai-enablement-stack（toolloop / round-19 / stars 643）
- magsther/awesome-opentelemetry（observability / round-19 / stars 980）
- adriannovegil/awesome-observability（observability / round-19 / stars 695）
- jaywcjlove/awesome-mac（longdocument / round-19 / stars 114606）
- brillout/awesome-react-components（longdocument / round-19 / stars 48472）
- Trinea/android-open-project（longdocument / round-19 / stars 31805）
- browser-use/jev-ultrafast（longdocument / round-19 / stars 18863）
- sindresorhus/awesome（routing / round-19 / stars 509277）
- react-boilerplate/react-boilerplate（routing / round-19 / stars 29475）
- vinta/awesome-python（protocol / round-20 / stars 322499）
- pbakaus/impeccable（permission / round-20 / stars 70150）
- avante-corp/avante.nvim（editing / round-20 / stars 18166）
- diff-usion/Awesome-Diffusion-Models（editing / round-20 / stars 12371）
- Egonex-AI/Understand-Anything（provider / round-20 / stars 83834）
- KRTirtho/spotube（routing / round-20 / stars 49360）
- openai/openai-cs-agents-demo（routing / round-20 / stars 6574）
- jinwyp/one_click_script（verification / round-20 / stars 5142）
- mon5termatt/medicat_installer（verification / round-20 / stars 3279）
- maddox/magick-installer（verification / round-20 / stars 487）

## 星级分布

| 星级段 | 仓库数 |
|---|---:|
| 10k-100k | 301 |
| 1k-10k | 250 |
| 100-1k | 53 |
| 100k+ | 32 |
| under-100 | 8 |

## 缓存异常清单

无。

## 原始仓库清单

| 仓库 | 星级 | 语言 | 维度 | 缓存文件 |
|---|---:|---|---|---:|
| sindresorhus/awesome | 509277 | unknown | routing | 0 |
| openclaw/openclaw | 390319 | TypeScript | observability | 4 |
| vinta/awesome-python | 322450 | Python | protocol, observability, toolloop, longdocument | 46 |
| obra/superpowers | 290493 | Shell | verification | 4 |
| affaan-m/ECC | 265913 | JavaScript | editing, observability, verification, longdocument | 18 |
| NousResearch/hermes-agent | 248286 | Python | editing, provider, permission | 10 |
| n8n-io/n8n | 205767 | TypeScript | observability, permission, seed | 24 |
| microsoft/vscode | 192819 | TypeScript | seed | 20 |
| microsoft/markitdown | 186558 | Python | provider | 13 |
| avelino/awesome-go | 185254 | Go | permission, routing | 0 |
| firecrawl/firecrawl | 183710 | TypeScript | seed | 19 |
| ollama/ollama | 181522 | Go | provider | 4 |
| huggingface/transformers | 166557 | Python | statemachine, longdocument | 84 |
| langgenius/dify | 156975 | TypeScript | seed | 20 |
| msitarzewski/agency-agents | 154269 | Shell | protocol, routing, verification, longdocument, editing, observability, provider | 171 |
| Shubhamsaboo/awesome-llm-apps | 139530 | Python | toolloop, provider, editing, observability, routing | 20 |
| github/spec-kit | 138537 | Python | verification | 4 |
| ripienaar/free-for-dev | 138028 | HTML | verification | 0 |
| garrytan/gstack | 133995 | TypeScript | toolloop, editing, permission | 12 |
| openai/codex | 126143 | Rust | seed | 20 |
| Hack-with-Github/Awesome-Hacking | 121038 | unknown | permission | 0 |
| Graphify-Labs/graphify | 120813 | Python | provider | 4 |
| browser-use/browser-use | 116044 | Python | provider | 4 |
| jaywcjlove/awesome-mac | 114568 | Swift | editing, longdocument | 42 |
| microsoft/TypeScript | 111167 | Go | verification, seed | 22 |
| axios/axios | 109209 | JavaScript | observability | 4 |
| earendil-works/pi | 108827 | TypeScript | permission, provider, statemachine, protocol | 16 |
| TauricResearch/TradingAgents | 108244 | Python | statemachine | 22 |
| JuliusBrussee/caveman | 107498 | Go | longdocument | 4 |
| google-gemini/gemini-cli | 107139 | TypeScript | observability, seed | 22 |
| fastapi/fastapi | 102547 | Python | editing | 4 |
| neovim/neovim | 102530 | Vim Script | seed | 4 |
| addyosmani/agent-skills | 98640 | JavaScript | statemachine | 4 |
| nexu-io/open-design | 97744 | TypeScript | toolloop | 24 |
| punkpeye/awesome-mcp-servers | 95451 | unknown | protocol, observability, permission, toolloop | 0 |
| infiniflow/ragflow | 91211 | Go | longdocument | 22 |
| zed-industries/zed | 90763 | Rust | seed | 20 |
| modelcontextprotocol/servers | 90563 | TypeScript | longdocument, seed | 8 |
| PaddlePaddle/PaddleOCR | 90083 | Python | editing | 4 |
| MunGell/awesome-for-beginners | 89524 | unknown | permission | 0 |
| OpenHands/OpenHands | 88973 | TypeScript | seed | 20 |
| unclecode/crawl4ai | 84137 | Python | verification | 4 |
| Egonex-AI/Understand-Anything | 83834 | TypeScript | provider | 0 |
| bytedance/deer-flow | 82899 | Python | toolloop, statemachine, permission, editing, observability | 26 |
| rtk-ai/rtk | 81535 | Rust | protocol, observability, statemachine | 8 |
| paperclipai/paperclip | 81336 | TypeScript | permission, statemachine, observability | 26 |
| netdata/netdata | 80627 | Go | verification | 4 |
| opendatalab/MinerU | 80530 | Python | statemachine | 4 |
| shareAI-lab/learn-claude-code | 77505 | Python | provider, statemachine | 0 |
| ComposioHQ/awesome-claude-skills | 75531 | Python | provider | 4 |
| enaqx/awesome-react | 74680 | unknown | editing | 0 |
| josephmisiti/awesome-machine-learning | 74414 | Python | routing | 0 |
| thedaviddias/Front-End-Checklist | 74239 | MDX | longdocument | 4 |
| binhnguyennus/awesome-scalability | 74211 | unknown | verification | 0 |
| headroomlabs-ai/headroom | 73613 | Python | provider | 4 |
| vuejs/awesome-vue | 73546 | unknown | verification | 0 |
| ruvnet/ruflo | 73112 | TypeScript | protocol, toolloop, observability | 192 |
| toeverything/AFFiNE | 72888 | TypeScript | seed | 20 |
| career-ops-hq/career-ops | 72493 | JavaScript | editing | 6 |
| colbymchenry/codegraph | 71921 | C | provider | 4 |
| daytonaio/daytona | 71728 | unknown | statemachine | 0 |
| tt-a1i/archify | 70317 | JavaScript | protocol, observability, routing, verification | 92 |
| pbakaus/impeccable | 70133 | JavaScript | editing, permission | 4 |
| diegosouzapw/OmniRoute | 69506 | TypeScript | longdocument | 4 |
| code-yeongyu/oh-my-openagent | 69320 | TypeScript | routing | 4 |
| cline/cline | 69124 | TypeScript | permission, provider, seed | 44 |
| openinterpreter/openinterpreter | 68414 | Rust | provider | 4 |
| xtekky/gpt4free | 66724 | Python | provider | 6 |
| leonardomso/33-js-concepts | 66530 | JavaScript | observability | 4 |
| shanraisshan/claude-code-best-practice | 66270 | HTML | toolloop | 6 |
| nocodb/nocodb | 65048 | TypeScript | permission | 4 |
| usestrix/strix | 64278 | Python | protocol, provider | 26 |
| git/git | 63282 | C | permission | 0 |
| minio/minio | 61356 | Go | protocol | 0 |
| microsoft/autogen | 61116 | Python | provider, seed | 39 |
| calesthio/OpenMontage | 60998 | Python | permission, editing | 8 |
| BerriAI/litellm | 59460 | Python | provider | 30 |
| crewAIInc/crewAI | 58942 | Python | observability, seed | 24 |
| pathwaycom/llm-app | 58905 | Jupyter Notebook | longdocument | 4 |
| rohitg00/ai-engineering-from-scratch | 55558 | Python | toolloop, verification, protocol | 32 |
| FlowiseAI/Flowise | 55477 | TypeScript | seed | 19 |
| aaif-goose/goose | 54589 | Rust | seed | 20 |
| hesreallyhim/awesome-claude-code | 54479 | Python | toolloop | 0 |
| router-for-me/CLIProxyAPI | 52989 | Go | provider | 4 |
| run-llama/llama_index | 52298 | Python | seed | 20 |
| CherryHQ/cherry-studio | 52110 | TypeScript | longdocument | 4 |
| multica-ai/multica | 51211 | Go | observability | 4 |
| nlohmann/json | 50661 | C++ | protocol | 8 |
| HKUDS/CLI-Anything | 49781 | Python | editing, verification | 8 |
| KRTirtho/spotube | 49360 | Dart | routing | 0 |
| Imbad0202/academic-research-skills | 49268 | Python | routing, verification | 12 |
| Aider-AI/aider | 49131 | Python | seed | 12 |
| HKUDS/nanobot | 48503 | Python | longdocument, provider | 26 |
| brillout/awesome-react-components | 48472 | unknown | longdocument | 0 |
| KeygraphHQ/shannon | 48316 | TypeScript | provider | 4 |
| oobabooga/textgen | 47698 | Python | provider, editing | 8 |
| prisma/orm | 47662 | TypeScript | protocol | 4 |
| dypsilon/frontend-dev-bookmarks | 47547 | unknown | editing | 4 |
| abhigyanpatwari/GitNexus | 47539 | TypeScript | longdocument | 6 |
| zhayujie/CowAgent | 47091 | Python | editing | 4 |
| apache/airflow | 46953 | Python | seed | 20 |
| sickn33/agentic-awesome-skills | 46815 | Python | protocol, toolloop, verification, statemachine | 194 |
| microsoft/monaco-editor | 46791 | JavaScript | seed | 15 |
| milvus-io/milvus | 46236 | Go | longdocument | 4 |
| logseq/logseq | 45031 | Clojure | seed | 15 |
| danny-avila/LibreChat | 44760 | TypeScript | provider, editing | 8 |
| AykutSarac/jsoncrack.com | 44443 | TypeScript | editing | 4 |
| agno-agi/agno | 42316 | Python | observability, permission | 46 |
| langchain-ai/langgraph | 42178 | Python | statemachine, seed | 19 |
| ToolJet/ToolJet | 40980 | JavaScript | editing | 4 |
| outline/outline | 40676 | TypeScript | seed | 20 |
| HKUDS/DeepTutor | 40211 | Python | permission, longdocument | 8 |
| alibaba/open-code-review | 40071 | Go | longdocument | 4 |
| tinyhumansai/openhuman | 40058 | Rust | permission | 4 |
| google-research/bert | 40042 | Python | statemachine | 0 |
| HKUDS/LightRAG | 39830 | Python | longdocument | 8 |
| Yeachan-Heo/oh-my-claudecode | 39312 | TypeScript | statemachine, toolloop | 16 |
| deepseek-ai/awesome-deepseek-integration | 39221 | unknown | provider | 4 |
| spacedriveapp/spacedrive | 39019 | Rust | permission | 4 |
| THU-MAIC/OpenMAIC | 38750 | TypeScript | editing | 4 |
| google/langextract | 38655 | Python | protocol, provider | 8 |
| ashishpatel26/500-AI-Agents-Projects | 38010 | Python | toolloop | 4 |
| reworkd/AgentGPT | 36290 | TypeScript | protocol, editing | 64 |
| gitroomhq/postiz-app | 36228 | TypeScript | permission | 4 |
| DayuanJiang/next-ai-draw-io | 36023 | TypeScript | routing | 4 |
| continuedev/continue | 36002 | TypeScript | seed | 20 |
| VectifyAI/PageIndex | 35813 | Python | longdocument | 4 |
| jondot/awesome-react-native | 35705 | unknown | verification | 0 |
| esengine/DeepSeek-Reasonix | 35692 | Go | statemachine, observability | 8 |
| linshenkx/prompt-optimizer | 35539 | TypeScript | provider | 4 |
| awesome-foss/awesome-sysadmin | 35237 | unknown | permission | 0 |
| agentscope-ai/QwenPaw | 35232 | TypeScript | toolloop | 24 |
| langfuse/langfuse | 34968 | TypeScript | observability | 6 |
| VoltAgent/awesome-agent-skills | 34767 | unknown | verification, longdocument, provider | 0 |
| debpalash/VoiceStudio | 34755 | Python | verification | 4 |
| block/buzz | 34064 | Rust | observability, permission | 8 |
| TabbyML/tabby | 33888 | Rust | seed | 19 |
| HKUDS/Vibe-Trading | 33876 | Python | toolloop, permission | 8 |
| Gitlawb/openclaude | 33496 | TypeScript | provider, toolloop | 14 |
| xai-org/x-algorithm | 33379 | Rust | routing | 4 |
| freestylefly/awesome-gpt-image-2 | 33373 | JavaScript | longdocument | 0 |
| Yeachan-Heo/oh-my-codex | 33337 | TypeScript | statemachine | 8 |
| mukul975/Anthropic-Cybersecurity-Skills | 33268 | Python | provider | 4 |
| can1357/oh-my-pi | 32955 | TypeScript | editing | 6 |
| zeroclaw-labs/zeroclaw | 32874 | Rust | protocol, toolloop | 8 |
| vercel-labs/skills | 32324 | TypeScript | permission | 2 |
| agentscope-ai/agentscope | 32231 | Python | permission, editing | 10 |
| conductor-oss/conductor | 32225 | Java | permission, statemachine, toolloop, observability | 418 |
| SigNoz/signoz | 32174 | TypeScript | observability | 8 |
| Fincept-Corporation/FinceptTerminal | 31938 | C++ | permission | 4 |
| Trinea/android-open-project | 31805 | unknown | longdocument | 0 |
| ianstormtaylor/slate | 31748 | TypeScript | editing | 6 |
| projectdiscovery/nuclei | 31456 | Go | observability | 4 |
| ScrapeGraphAI/Scrapegraph-ai | 31222 | Python | provider | 4 |
| iOfficeAI/OfficeCLI | 31111 | C# | editing | 6 |
| getzep/graphiti | 31096 | Python | longdocument | 6 |
| topoteretes/cognee | 30940 | Python | longdocument | 4 |
| supermemoryai/supermemory | 30839 | TypeScript | longdocument | 4 |
| GoogleChrome/lighthouse | 30800 | JavaScript | verification | 4 |
| garrytan/gbrain | 30259 | TypeScript | protocol | 4 |
| tobi/qmd | 29977 | TypeScript | longdocument | 6 |
| langchain-ai/deepagents | 29686 | Python | longdocument, provider | 8 |
| openai/openai-agents-python | 29655 | Python | provider, seed | 22 |
| NirDiamant/RAG_Techniques | 29586 | Jupyter Notebook | longdocument | 10 |
| aishwaryanr/awesome-generative-ai-guide | 29541 | HTML | observability | 4 |
| react-boilerplate/react-boilerplate | 29475 | JavaScript | routing | 0 |
| huggingface/smolagents | 29459 | Python | seed | 9 |
| IanLunn/Hover | 29399 | SCSS | editing | 0 |
| Infisical/infisical | 29387 | TypeScript | permission | 22 |
| Tencent/WeKnora | 29249 | Go | longdocument, editing | 10 |
| systemdesign42/system-design-academy | 28953 | unknown | statemachine | 0 |
| k1tbyte/Wand-Enhancer | 28823 | C# | editing | 4 |
| rohitg00/agentmemory | 28757 | TypeScript | editing | 4 |
| microsoft/semantic-kernel | 28593 | C# | provider, seed | 22 |
| kestra-io/kestra | 28300 | Java | observability, editing | 8 |
| mlflow/mlflow | 28116 | Python | provider, seed | 22 |
| trufflesecurity/trufflehog | 28029 | Go | verification | 4 |
| virattt/dexter | 27618 | TypeScript | toolloop | 4 |
| go-kit/kit | 27423 | Go | observability | 4 |
| OthmanAdi/planning-with-files | 27084 | Shell | toolloop | 6 |
| xai-org/grok-build | 27046 | Rust | editing | 4 |
| tree-sitter/tree-sitter | 27025 | Rust | seed | 14 |
| vercel/ai | 26913 | TypeScript | provider, seed | 22 |
| phuryn/pm-skills | 26552 | unknown | longdocument | 4 |
| alirezarezvani/claude-skills | 26295 | Python | toolloop, longdocument | 8 |
| dapr/dapr | 26108 | Go | permission, statemachine, observability, seed | 206 |
| kataras/iris | 25567 | Go | longdocument | 22 |
| Donchitos/Claude-Code-Game-Studios | 25373 | Shell | observability | 4 |
| vxcontrol/pentagi | 24900 | Go | toolloop, provider | 10 |
| modelcontextprotocol/python-sdk | 24373 | Python | protocol | 4 |
| NirDiamant/GenAI_Agents | 24367 | Jupyter Notebook | statemachine | 2 |
| RooCodeInc/Roo-Code | 24298 | TypeScript | seed | 19 |
| pascalorg/editor | 24269 | TypeScript | protocol | 4 |
| electron-react-boilerplate/electron-react-boilerplate | 24251 | TypeScript | verification | 4 |
| mksglu/context-mode | 23981 | TypeScript | longdocument | 4 |
| PrefectHQ/prefect | 23907 | Python | seed | 20 |
| facebook/lexical | 23889 | TypeScript | seed | 16 |
| jquense/yup | 23665 | TypeScript | protocol | 6 |
| verl-project/verl | 23582 | Python | toolloop | 4 |
| temporalio/temporal | 23260 | Go | seed | 20 |
| micro/go-micro | 23075 | Go | statemachine, provider | 12 |
| yjs/yjs | 22830 | JavaScript | editing, seed | 7 |
| iovisor/bcc | 22670 | C | observability | 4 |
| guillaumemeyer/watermarks-remover | 22654 | Python | toolloop | 0 |
| yoheinakajima/babyagi | 22358 | Python | observability | 4 |
| comet-ml/opik | 22204 | Python | observability | 4 |
| PromtEngineer/localGPT | 22198 | Python | longdocument | 4 |
| openai/swarm | 22003 | Python | provider, toolloop, protocol, seed | 61 |
| chriskiehl/Gooey | 21906 | Python | protocol | 4 |
| snarktank/ralph | 21848 | TypeScript | toolloop | 2 |
| screenpipe/screenpipe | 21672 | Rust | permission | 4 |
| google/adk-python | 21609 | Python | toolloop, observability | 84 |
| AI4Finance-Foundation/FinGPT | 21280 | Jupyter Notebook | longdocument | 4 |
| openai/chatgpt-retrieval-plugin | 21248 | Python | longdocument, provider | 8 |
| PrimeIntellect-ai/prime-agent | 21219 | TypeScript | statemachine | 6 |
| stefan-jansen/machine-learning-for-trading | 20987 | Jupyter Notebook | verification | 4 |
| rothgar/awesome-tuis | 20707 | unknown | verification | 0 |
| agarrharr/awesome-cli-apps | 20451 | Shell | editing | 0 |
| openai/gpt-oss | 20426 | Python | provider | 4 |
| SWE-agent/SWE-agent | 20388 | Python | seed | 14 |
| kortix-ai/suna | 20231 | TypeScript | permission | 4 |
| pydantic/pydantic-ai | 20131 | Python | provider, protocol, seed | 24 |
| basecamp/trix | 20013 | JavaScript | editing | 30 |
| web3/web3.js | 19913 | TypeScript | protocol | 4 |
| facebookresearch/sam2 | 19912 | Jupyter Notebook | statemachine | 22 |
| nashsu/llm_wiki | 19898 | TypeScript | longdocument | 4 |
| sandboxie-plus/Sandboxie | 19525 | C | permission | 0 |
| elizaOS/eliza | 19422 | TypeScript | verification | 4 |
| huggingface/sentence-transformers | 19112 | Python | longdocument | 4 |
| keon/awesome-nlp | 19028 | unknown | routing, longdocument | 0 |
| state-spaces/mamba | 18868 | Python | statemachine | 4 |
| browser-use/jev-ultrafast | 18863 | Python | longdocument | 0 |
| NandhaKishorM/laya | 18796 | Python | statemachine, routing | 67 |
| confident-ai/deepeval | 18415 | Python | observability | 4 |
| andrewyng/openworker | 18178 | Python | permission, observability | 28 |
| avante-corp/avante.nvim | 18166 | Lua | editing | 0 |
| NVIDIA/SkillSpector | 18157 | Python | provider | 4 |
| muratcankoylan/Agent-Skills-for-Context-Engineering | 18019 | Python | longdocument, observability | 72 |
| langbot-app/LangBot | 17959 | Python | provider | 4 |
| dexteryy/spellbook-of-modern-webdev | 17911 | unknown | verification | 0 |
| GoogleCloudPlatform/generative-ai | 17749 | Jupyter Notebook | provider | 4 |
| IDEA-Research/Grounded-Segment-Anything | 17734 | Jupyter Notebook | statemachine | 0 |
| laramies/theHarvester | 17583 | Python | verification | 4 |
| openzipkin/zipkin | 17465 | Java | observability | 4 |
| larksuite/cli | 17427 | Go | permission | 4 |
| sindresorhus/type-fest | 17412 | TypeScript | protocol | 4 |
| argoproj/argo-workflows | 17000 | Go | seed | 20 |
| cft0808/edict | 16909 | Python | observability | 4 |
| semgrep/semgrep | 16736 | C | seed | 20 |
| bharathgs/Awesome-pytorch-list | 16679 | unknown | routing | 0 |
| HKUDS/DeepCode | 16624 | Python | longdocument, toolloop, permission, statemachine | 80 |
| owainlewis/awesome-artificial-intelligence | 16544 | Python | permission | 0 |
| triggerdotdev/trigger.dev | 16380 | TypeScript | statemachine | 4 |
| andrewyng/aisuite | 16297 | Python | provider, toolloop | 98 |
| dagger/dagger | 16294 | Go | observability | 4 |
| raga-ai-hub/RagaAI-Catalyst | 16164 | Python | protocol | 4 |
| quickwit-oss/tantivy | 16128 | Rust | editing | 4 |
| yabwe/medium-editor | 16099 | JavaScript | editing | 6 |
| ast-grep/ast-grep | 16010 | Rust | seed | 10 |
| Arindam200/awesome-ai-apps | 15892 | Python | longdocument | 4 |
| HKUDS/OpenHarness | 15843 | Python | permission, provider | 10 |
| walkinglabs/learn-harness-engineering | 15824 | TypeScript | statemachine | 4 |
| saltstack/salt | 15673 | Python | statemachine | 4 |
| SimulatedGREG/electron-vue | 15369 | JavaScript | verification | 4 |
| open-metadata/OpenMetadata | 15308 | TypeScript | protocol | 4 |
| AgriciDaniel/claude-obsidian | 15163 | Python | verification | 4 |
| apexcharts/apexcharts.js | 15161 | JavaScript | longdocument | 4 |
| PuerkitoBio/goquery | 14995 | Go | protocol | 0 |
| kyegomez/OpenMythos | 14907 | Python | longdocument | 4 |
| sbilly/awesome-security | 14880 | unknown | toolloop | 0 |
| ajv-validator/ajv | 14836 | TypeScript | protocol | 4 |
| llmware-ai/llmware | 14832 | Python | longdocument, seed | 21 |
| analysis-tools-dev/static-analysis | 14800 | Rust | permission | 0 |
| microsoft/RD-Agent | 14727 | Python | verification | 4 |
| hindupuravinash/the-gan-zoo | 14691 | Python | routing | 0 |
| NanmiCoder/cc-haha | 14689 | TypeScript | permission | 4 |
| aiming-lab/AutoResearchClaw | 14515 | Python | toolloop | 4 |
| alibaba/ARouter | 14455 | Java | routing | 4 |
| carla-simulator/carla | 14423 | C++ | editing | 4 |
| mvt-project/mvt | 14371 | Python | verification | 4 |
| waooAI/waoowaoo | 14271 | TypeScript | permission | 4 |
| markets/awesome-ruby | 14158 | unknown | permission | 0 |
| OJ/gobuster | 14150 | Go | permission | 0 |
| 567-labs/instructor | 13936 | Python | protocol | 4 |
| opencode-ai/opencode | 13767 | Go | observability | 4 |
| nidhinjs/prompt-master | 13566 | unknown | editing, routing | 0 |
| XiaomiMiMo/MiMo-Code | 13429 | TypeScript | permission, toolloop | 8 |
| mishoo/UglifyJS | 13378 | JavaScript | protocol | 4 |
| modelscope/DiffSynth-Studio | 13173 | Python | editing | 4 |
| cloudwego/eino | 13145 | Go | statemachine | 4 |
| ShishirPatil/gorilla | 13038 | Python | provider | 4 |
| StarTrail-org/LEANN | 12958 | Python | longdocument | 4 |
| Piebald-AI/claude-code-system-prompts | 12749 | JavaScript | toolloop | 4 |
| ritchieng/the-incredible-pytorch | 12648 | unknown | routing, longdocument | 0 |
| nearai/ironclaw | 12631 | Rust | permission, statemachine, observability, routing | 16 |
| diff-usion/Awesome-Diffusion-Models | 12371 | HTML | editing | 0 |
| Untrivial-ai/agent-orchestrator | 12301 | Go | observability | 4 |
| sanbuphy/learn-coding-agent | 12280 | unknown | statemachine, permission, observability, toolloop, protocol | 2 |
| josdejong/jsoneditor | 12266 | JavaScript | editing | 4 |
| krillinai/OpenCreator | 12231 | TypeScript | permission, verification | 86 |
| bytedance/trae-agent | 12111 | Python | editing | 4 |
| daijro/camoufox | 12100 | C++ | editing | 4 |
| OpenByteInc/QuantDinger | 12047 | Python | permission | 4 |
| jina-ai/reader | 12036 | TypeScript | longdocument, seed | 13 |
| manticoresoftware/manticoresearch | 12033 | C++ | longdocument | 4 |
| wix/Detox | 12027 | JavaScript | verification | 4 |
| nightwatchjs/nightwatch | 11953 | JavaScript | verification | 4 |
| facebookresearch/seamless_communication | 11863 | Jupyter Notebook | statemachine | 0 |
| go-martini/martini | 11599 | Go | longdocument | 0 |
| Arize-ai/phoenix | 11585 | Python | observability | 8 |
| yizhiyanhua-ai/fireworks-tech-graph | 11535 | Python | routing | 0 |
| realm/realm-java | 11456 | Java | verification | 4 |
| google/go-github | 11308 | Go | longdocument | 4 |
| elder-plinius/G0DM0D3 | 11280 | TypeScript | provider | 2 |
| wandb/wandb | 11259 | Python | seed | 19 |
| Tracer-Cloud/opensre | 11214 | Python | verification | 2 |
| The-Pocket/PocketFlow | 11193 | Python | editing, longdocument | 4 |
| EKKOLearnAI/ekko-studio | 11184 | TypeScript | permission | 4 |
| MoonshotAI/Kimi-K2 | 11112 | unknown | provider | 0 |
| cuixueshe/earthworm | 11079 | TypeScript | permission | 0 |
| huggingface/chat-ui | 10962 | TypeScript | provider, permission | 10 |
| modelcontextprotocol/inspector | 10931 | TypeScript | verification | 44 |
| alibaba/spring-ai-alibaba | 10922 | Java | statemachine | 4 |
| huggingface/ml-intern | 10821 | Python | toolloop, permission | 10 |
| zubair-trabzada/geo-seo-claude | 10789 | Python | protocol | 4 |
| sashabaranov/go-openai | 10775 | Go | provider | 22 |
| langchain-ai/open-swe | 10755 | Python | protocol, toolloop | 8 |
| DouyinFE/semi-design | 10382 | TypeScript | verification | 4 |
| hackjutsu/Lepton | 10342 | JavaScript | verification | 4 |
| astrid-runtime/astrid | 10280 | Rust | permission | 4 |
| satellite-image-deep-learning/techniques | 10269 | unknown | routing | 0 |
| sktime/sktime | 10035 | Python | routing | 4 |
| diet103/claude-code-infrastructure-showcase | 10025 | TypeScript | toolloop | 4 |
| espnet/espnet | 9966 | Python | routing | 6 |
| Companion-Inc/feynman | 9759 | TypeScript | longdocument, verification | 8 |
| wonderwhy-er/DesktopCommanderMCP | 9721 | TypeScript | editing | 4 |
| ashishb/android-security-awesome | 9707 | Makefile | permission | 0 |
| frankbria/ralph-claude-code | 9641 | Shell | toolloop | 4 |
| ruanyf/webpack-demos | 9560 | JavaScript | longdocument | 0 |
| ntegrals/openbrowser | 9542 | TypeScript | toolloop | 4 |
| toniblyx/my-arsenal-of-aws-security-tools | 9508 | Shell | permission | 0 |
| anthropics/claude-for-legal | 9503 | Python | toolloop | 4 |
| AgriciDaniel/claude-ads | 9499 | Python | editing, verification | 4 |
| spring-projects/spring-ai | 9475 | Java | provider | 4 |
| google/artemis | 9473 | Python | statemachine | 4 |
| goplus/xgo | 9457 | Go | routing | 2 |
| pipipi-pikachu/PPTist | 9350 | Vue | editing | 4 |
| modelcontextprotocol/modelcontextprotocol | 9284 | TypeScript | seed | 14 |
| Future-House/paper-qa | 9239 | Python | longdocument | 4 |
| kpdecker/jsdiff | 9211 | JavaScript | editing | 4 |
| shadcn/improve | 9164 | unknown | toolloop | 2 |
| MervinPraison/PraisonAI | 9082 | Python | toolloop, provider | 10 |
| ai-boost/awesome-prompts | 8927 | unknown | routing | 0 |
| ibireme/YYText | 8863 | Objective-C | editing | 0 |
| NVIDIA/OpenShell | 8760 | Rust | observability | 4 |
| getsentry/sentry-javascript | 8744 | TypeScript | seed | 20 |
| 0xPlaygrounds/rig | 8710 | Rust | provider | 4 |
| databasus/databasus | 8635 | TypeScript | statemachine | 4 |
| THUDM/slime | 8523 | Python | toolloop | 4 |
| google/ax | 8498 | Go | toolloop | 0 |
| vudovn/ag-kit | 8180 | TypeScript | permission | 0 |
| meirwah/awesome-workflow-engines | 7933 | unknown | statemachine | 0 |
| datahaven-xyz/datahaven | 7889 | Rust | protocol | 4 |
| Nasiko-Labs/nasiko | 7811 | Rust | observability | 4 |
| OneUptime/oneuptime | 7643 | TypeScript | observability | 0 |
| ValueCell-ai/ClawX | 7610 | TypeScript | verification | 4 |
| refly-ai/refly | 7529 | TypeScript | statemachine | 4 |
| anthropics/defending-code-reference-harness | 7511 | Python | editing | 4 |
| firecrawl/firecrawl-mcp-server | 7504 | JavaScript | protocol, permission | 2 |
| firmai/industry-machine-learning | 7484 | Jupyter Notebook | permission | 0 |
| TheCraigHewitt/seomachine | 7457 | Python | routing | 2 |
| traceloop/openllmetry | 7442 | Python | observability, seed | 24 |
| ixartz/SaaS-Boilerplate | 7423 | TypeScript | verification | 6 |
| Emily2040/seedance-2.0 | 7408 | Python | routing | 4 |
| NVIDIA-NeMo/Guardrails | 7184 | Python | permission | 4 |
| P1xt/p1xt-guides | 7182 | unknown | verification | 4 |
| dbohdan/structured-text-tools | 7149 | unknown | editing, protocol | 0 |
| enricoros/big-AGI | 7130 | TypeScript | provider | 4 |
| datajuicer/data-juicer | 7089 | Python | observability | 4 |
| katanemo/plano | 7062 | Rust | routing | 4 |
| bkrem/awesome-solidity | 7052 | unknown | protocol | 0 |
| kunchenguid/firstmate | 7048 | Shell | toolloop | 4 |
| openai/openai-realtime-agents | 6989 | TypeScript | provider | 0 |
| htdt/godogen | 6982 | Python | toolloop | 4 |
| anomalyco/models.dev | 6974 | TypeScript | protocol | 4 |
| open-multi-agent/open-multi-agent | 6952 | TypeScript | permission, observability, statemachine | 14 |
| tokio-rs/tracing | 6887 | Rust | observability | 4 |
| abhivaikar/howtheytest | 6873 | TypeScript | verification | 3 |
| Tencent/BrowserSkill | 6858 | TypeScript | verification | 4 |
| postgresml/postgresml | 6823 | Rust | longdocument | 4 |
| GreptimeTeam/greptimedb | 6705 | Rust | observability | 4 |
| ultraworkers/claw-code-parity | 6632 | Rust | statemachine | 4 |
| automerge/automerge | 6614 | JavaScript | seed | 13 |
| axa-group/nlp.js | 6585 | JavaScript | routing | 22 |
| j3ssie/osmedeus | 6577 | Go | observability | 4 |
| openai/openai-cs-agents-demo | 6574 | Python | routing | 0 |
| Conway-Research/automaton | 6560 | TypeScript | toolloop | 4 |
| Forget-C/Jellyfish | 6480 | Python | statemachine | 4 |
| genkit-ai/genkit | 6456 | TypeScript | provider | 4 |
| tiff/wysihtml5 | 6443 | JavaScript | editing | 22 |
| crytic/slither | 6368 | Python | toolloop | 4 |
| promptslab/Awesome-Prompt-Engineering | 6339 | TypeScript | toolloop | 0 |
| microsoft/agent-governance-toolkit | 6317 | Python | permission, protocol | 8 |
| czlonkowski/n8n-skills | 6308 | Shell | routing | 4 |
| Eigenwise/atomic-agents | 6255 | Python | protocol | 4 |
| kif-framework/KIF | 6249 | Objective-C | verification | 4 |
| experientiallabs/experiential | 6173 | Python | observability | 4 |
| netease-youdao/LobsterAI | 6065 | TypeScript | verification | 4 |
| drona23/claude-token-efficient | 6054 | Python | longdocument | 0 |
| MontFerret/ferret | 6012 | Go | observability | 4 |
| goss-org/goss | 5975 | Go | protocol | 0 |
| loopx-project/loopx | 5945 | Python | toolloop | 4 |
| danielgerlag/workflow-core | 5927 | C# | statemachine | 4 |
| inngest/inngest | 5878 | Go | statemachine | 6 |
| weeeBox/mobile-system-design | 5831 | unknown | longdocument | 2 |
| jdorn/json-editor | 5816 | JavaScript | protocol | 2 |
| appcypher/awesome-mcp-servers | 5777 | unknown | permission, routing | 0 |
| agentscope-ai/agentscope-java | 5763 | Java | observability, permission | 8 |
| dnhkng/GLaDOS | 5725 | Python | toolloop | 4 |
| Gen-Verse/OpenClaw-RL | 5698 | Python | toolloop | 4 |
| buger/jsonparser | 5657 | Go | protocol | 0 |
| apache/maka | 5617 | TypeScript | verification | 4 |
| KingOfBugbounty/KingOfBugBountyTips | 5541 | Python | routing | 0 |
| Blaizzy/mlx-vlm | 5532 | Python | longdocument | 4 |
| scriptscat/scriptcat | 5400 | TypeScript | permission | 4 |
| Consensys/ethereum-developer-tools-list | 5398 | unknown | permission, protocol | 0 |
| orneryd/ui-grid | 5382 | TypeScript | longdocument | 4 |
| anthropics/sandbox-runtime | 5305 | TypeScript | permission | 6 |
| linuxhsj/openclaw-zero-token | 5194 | TypeScript | provider | 4 |
| sentient-agi/ROMA | 5179 | Python | toolloop | 4 |
| rasbt/mlxtend | 5176 | Python | routing | 4 |
| dbeaver/cloudbeaver | 5159 | TypeScript | editing | 4 |
| jinwyp/one_click_script | 5142 | Shell | verification | 0 |
| nibzard/awesome-agentic-patterns | 4984 | HTML | permission | 6 |
| josephg/ShareJS | 4979 | JavaScript | editing | 4 |
| json-editor/json-editor | 4903 | JavaScript | protocol | 4 |
| conorbronsdon/avoid-ai-writing | 4690 | JavaScript | toolloop | 4 |
| r0f1/datascience | 4672 | unknown | routing | 0 |
| obgnail/typora_plugin | 4631 | JavaScript | longdocument | 4 |
| xialeiliu/Awesome-Incremental-Learning | 4528 | unknown | routing | 0 |
| ruvnet/RuVector | 4509 | Rust | permission | 4 |
| ai-boost/awesome-harness-engineering | 4482 | Python | permission, toolloop | 4 |
| restatedev/restate | 4463 | Rust | seed | 18 |
| tigerless-labs/autoharness | 4438 | Python | routing | 4 |
| remzi-arpacidusseau/ostep-code | 4423 | C | observability | 0 |
| dennybritz/deeplearning-papernotes | 4421 | unknown | longdocument | 4 |
| DistrictDataLabs/yellowbrick | 4405 | Python | routing | 4 |
| decodingai-magazine/llm-twin-course | 4390 | Python | longdocument | 4 |
| miguel-perez/smoothState.js | 4364 | CSS | statemachine | 4 |
| jorgerojas26/lazysql | 4322 | Go | editing | 4 |
| UditAkhourii/adhd | 4269 | TypeScript | routing | 4 |
| GiovanniPasq/agentic-rag-for-dummies | 4201 | Jupyter Notebook | longdocument | 4 |
| google-gemini/gemini-skills | 4201 | Python | provider | 4 |
| bragai/bRAG-langchain | 4167 | Jupyter Notebook | routing | 0 |
| wang2122/sprix-sage-router | 4063 | Python | observability | 2 |
| knownsec/aipyapp | 4026 | HTML | provider | 4 |
| javahuang/SurveyKing | 4009 | Java | editing | 22 |
| googleapis/python-genai | 3988 | Python | provider | 4 |
| totec448-spec/chat-on-steroids | 3972 | TypeScript | permission | 4 |
| textAngular/textAngular | 3942 | JavaScript | editing | 0 |
| andabi/deep-voice-conversion | 3939 | Python | routing | 4 |
| NVIDIA/Model-Optimizer | 3852 | Python | statemachine | 4 |
| openai/openai-agents-js | 3852 | TypeScript | protocol, seed | 22 |
| SchemaStore/schemastore | 3844 | JavaScript | protocol | 4 |
| Atmosphere/atmosphere | 3815 | Java | statemachine, provider | 8 |
| parse-community/parse-dashboard | 3807 | JavaScript | protocol | 4 |
| flasgger/flasgger | 3743 | Python | protocol | 4 |
| blacktop/ipsw | 3734 | Go | toolloop | 4 |
| PublicAffairs/openai-gemini | 3661 | JavaScript | provider | 0 |
| standard-schema/standard-schema | 3634 | TypeScript | protocol | 6 |
| schemathesis/schemathesis | 3622 | Python | protocol | 4 |
| seakee/CPA-Manager-Plus | 3610 | Go | statemachine | 4 |
| pytorch/rl | 3578 | Python | observability | 4 |
| maziarraissi/Applied-Deep-Learning | 3566 | unknown | routing | 0 |
| smallcloudai/refact | 3540 | Rust | seed | 20 |
| HanaokaYuzu/Gemini-API | 3533 | Python | provider | 4 |
| b-nnett/grok-bot-0.18-reconstructed | 3514 | TypeScript | verification | 4 |
| vantezzen/autoform | 3495 | TypeScript | protocol | 4 |
| cypress-io/cypress-example-recipes | 3478 | JavaScript | verification | 4 |
| Ontos-AI/knowhere | 3463 | Python | protocol, longdocument | 8 |
| imbhargav5/rooks | 3451 | TypeScript | editing | 4 |
| stevenpetryk/mafs | 3434 | TypeScript | verification | 4 |
| milind-soni/OpenMausBot | 3376 | TypeScript | permission | 4 |
| ombharatiya/ai-system-design-guide | 3373 | unknown | toolloop | 4 |
| metorial/metorial | 3358 | TypeScript | provider | 0 |
| codeaashu/claude-code | 3352 | TypeScript | protocol | 6 |
| bcherny/json-schema-to-typescript | 3347 | TypeScript | protocol | 4 |
| Sophomoresty/gemini-web2api | 3321 | Python | provider | 4 |
| aasthas2022/SDE-Interview-and-Prep-Roadmap | 3279 | Python | toolloop | 0 |
| mon5termatt/medicat_installer | 3279 | C++ | verification | 0 |
| liaohch3/claude-tap | 3235 | Python | observability | 4 |
| DynamoRIO/dynamorio | 3165 | C | observability | 0 |
| wquguru/harness-books | 3137 | Python | permission | 4 |
| daveshap/OpenAI_Agent_Swarm | 3095 | Python | toolloop | 4 |
| microsoft/skills | 3049 | TypeScript | routing | 4 |
| anthropics/commerce-agents | 3030 | Python | toolloop | 4 |
| nickel-lang/nickel | 3002 | Rust | protocol | 2 |
| sunspot/sunspot | 2978 | JavaScript | longdocument | 4 |
| QwenLM/Qwen-MM-Plugins | 2970 | Python | longdocument | 4 |
| open-gitagent/opengap | 2955 | TypeScript | toolloop | 4 |
| keleshev/schema | 2946 | Python | protocol | 4 |
| supabase/mcp | 2918 | TypeScript | protocol | 4 |
| MARKTECHPOST-AI-MEDIA-INC/AI-Agents-Projects-Tutorials | 2908 | Jupyter Notebook | provider | 4 |
| software-mansion/argent | 2882 | TypeScript | verification | 4 |
| elie222/rakazo | 2881 | TypeScript | verification | 4 |
| moltis-org/moltis | 2870 | Rust | toolloop | 4 |
| RobotiumTech/robotium | 2853 | Java | verification | 0 |
| microsoft/pg_durable | 2821 | Rust | statemachine | 0 |
| openlit/openlit | 2790 | TypeScript | observability, seed | 22 |
| codeany-ai/open-agent-sdk-typescript | 2744 | TypeScript | protocol | 4 |
| indy256/Full-stack-Developer-Interview-Questions-and-Answers | 2740 | unknown | toolloop | 0 |
| hasanharman/form-builder | 2694 | TypeScript | protocol | 4 |
| cisagov/ScubaGear | 2678 | PowerShell | verification | 4 |
| ealush/vest | 2662 | TypeScript | protocol | 4 |
| thepirat000/Audit.NET | 2652 | C# | observability | 4 |
| NVIDIA/NeMo-Agent-Toolkit | 2643 | Python | observability, protocol | 8 |
| wshobson/commands | 2641 | unknown | protocol | 4 |
| rohitg00/awesome-claude-code-toolkit | 2635 | JavaScript | toolloop, permission | 4 |
| open-telemetry/opentelemetry-java-instrumentation | 2633 | Java | observability | 4 |
| yaojingang/yao-meta-skill | 2628 | Python | routing | 4 |
| lucidrains/audiolm-pytorch | 2624 | Python | routing | 0 |
| stephenh/ts-proto | 2594 | TypeScript | toolloop | 0 |
| YeQing17-2026/OmniAgent | 2568 | Python | toolloop | 4 |
| Intent-Lab/VisionClaw | 2556 | TypeScript | routing | 0 |
| Leonxlnx/agentic-ai-prompt-research | 2539 | unknown | routing | 2 |
| posabsolute/jQuery-Validation-Engine | 2535 | JavaScript | editing | 0 |
| trailofbits/graphtage | 2486 | Python | editing | 4 |
| nitrocloudofficial/nitrostack | 2485 | TypeScript | protocol | 4 |
| plumatic/schema | 2462 | Clojure | protocol | 0 |
| open-telemetry/opentelemetry-java | 2456 | Java | observability | 4 |
| mojoaxel/awesome-regression-testing | 2416 | unknown | verification | 0 |
| TheJambo/awesome-testing | 2380 | unknown | verification | 0 |
| jarmuine/claude-code | 2311 | TypeScript | protocol | 6 |
| dreikanter/ruby-bookmarks | 2306 | unknown | permission | 0 |
| tanbiralam/claude-code | 2277 | TypeScript | protocol | 4 |
| codejunkie99/agentic-stack | 2272 | Python | observability | 4 |
| noamseg/interview-coach-skill | 2269 | unknown | routing | 0 |
| agno-agi/dash | 2267 | Python | routing | 4 |
| hekailiang/squirrel | 2262 | Java | statemachine | 4 |
| jim-schwoebel/voice_datasets | 2230 | unknown | routing | 0 |
| rebing/graphql-laravel | 2221 | PHP | protocol | 4 |
| invoice-x/invoice2data | 2217 | Python | protocol | 4 |
| 0x90/wifi-arsenal | 2203 | C | toolloop | 0 |
| fastino-ai/GLiNER2 | 2130 | Python | routing | 22 |
| ShawnDEvans/smbmap | 2078 | Python | permission | 0 |
| Starcounter-Jack/JSON-Patch | 1982 | JavaScript | editing | 4 |
| microsoft/sample-app-aoai-chatGPT | 1925 | Python | protocol | 2 |
| MicrosoftDocs/mcp | 1900 | TypeScript | protocol | 4 |
| isair/jarvis | 1845 | Python | routing | 4 |
| trpc-group/trpc-agent-go | 1821 | Go | statemachine | 4 |
| BetterDiscord/Installer | 1806 | Go | verification | 4 |
| michael/editable | 1789 | Svelte | editing | 4 |
| Besty0728/Unity-Skills | 1779 | C# | editing | 4 |
| fossasia/pslab-desktop | 1769 | JavaScript | verification | 4 |
| NoriSte/ui-testing-best-practices | 1736 | unknown | verification | 6 |
| emichael/dslabs | 1716 | Java | observability | 4 |
| naomiaro/waveform-playlist | 1678 | TypeScript | editing | 4 |
| AgentR1/Agent-R1 | 1676 | Python | toolloop | 4 |
| patoles/agent-flow | 1653 | TypeScript | observability | 4 |
| badlogic/lemmy | 1640 | TypeScript | observability | 4 |
| mrmans0n/smart-location-lib | 1638 | Java | routing | 0 |
| Delta-ML/delta | 1606 | Python | routing | 4 |
| mxschmitt/awesome-playwright | 1581 | unknown | verification | 0 |
| ngx-rocket/generator-ngx-rocket | 1504 | TypeScript | verification | 4 |
| aiko-chan-ai/DiscordBotClient | 1473 | TypeScript | routing | 4 |
| wannabespace/conar | 1448 | TypeScript | verification | 4 |
| Shopify/shopify_python_api | 1436 | Python | longdocument | 4 |
| yibie/awesome-jev | 1431 | Python | routing | 4 |
| elder-plinius/V3SP3R | 1427 | Java | permission | 4 |
| getpelican/pelican-plugins | 1401 | Python | longdocument | 4 |
| cosmtrek/mindwalk | 1353 | Go | observability | 4 |
| victordibia/designing-multiagent-systems | 1313 | Python | toolloop | 4 |
| contentful/contentful.js | 1295 | TypeScript | longdocument | 4 |
| pnoker/iot-dc3 | 1289 | Java | observability | 4 |
| josdejong/svelte-jsoneditor | 1266 | TypeScript | editing | 4 |
| openclaw/lobster | 1264 | TypeScript | statemachine | 4 |
| kellyvv/PhoneClaw | 1262 | Swift | routing | 4 |
| scottlerch/HostsFileEditor | 1258 | C# | editing | 11 |
| rs/rest-layer | 1241 | Go | editing | 4 |
| AtmaHou/Task-Oriented-Dialogue-Research-Progress-Survey | 1237 | unknown | routing | 0 |
| Arize-ai/openinference | 1232 | Python | observability | 4 |
| stanford-iris-lab/meta-harness-tbench2-artifact | 1224 | Python | toolloop | 2 |
| declare-lab/MELD | 1088 | Python | routing | 0 |
| styfle/cancel-workflow-action | 981 | TypeScript | statemachine | 0 |
| magsther/awesome-opentelemetry | 980 | unknown | observability | 0 |
| brightmart/bert_language_understanding | 965 | Python | routing | 22 |
| e10nMa2k/cc-mini | 962 | Python | permission | 4 |
| krafton-ai/KIRA | 928 | Python | toolloop | 4 |
| temporalio/sdk-typescript | 922 | TypeScript | seed | 20 |
| declare-lab/multimodal-deep-learning | 920 | OpenEdge ABL | routing | 4 |
| mutativejs/travels | 916 | TypeScript | editing | 4 |
| qinlibo-hit/Awesome-SLU-Survey | 893 | unknown | routing | 0 |
| cloudflare/mcp | 879 | TypeScript | protocol | 4 |
| jina-ai/MCP | 866 | TypeScript | protocol | 2 |
| MartinDelophy/ai-video-editor | 855 | JavaScript | editing | 4 |
| styfeng/DataAug4NLP | 834 | unknown | routing | 0 |
| Anil-matcha/awesome-jev-by-typesafe | 815 | Python | routing | 0 |
| inkandswitch/peritext | 792 | TypeScript | editing | 2 |
| AdevintaSpain/Leku | 779 | Kotlin | routing | 0 |
| thu-coai/CrossWOZ | 728 | Python | routing | 4 |
| eugeneyan/ml-design-docs | 716 | unknown | routing | 0 |
| marktext/muya | 714 | TypeScript | editing | 4 |
| armel/uv-k1-k5v3-firmware-custom | 700 | C | routing | 4 |
| adriannovegil/awesome-observability | 695 | Makefile | observability | 0 |
| databufflabs/databuff | 687 | Java | observability | 4 |
| krasimir/kuker | 656 | JavaScript | statemachine | 4 |
| daytona/ai-enablement-stack | 643 | HTML | toolloop | 0 |
| snakeztc/NeuralDialogPapers | 643 | unknown | routing | 0 |
| openteams-lab/openteams | 623 | TypeScript | statemachine | 4 |
| LiskHQ/lisk-desktop | 571 | JavaScript | verification | 4 |
| wfzyx/von | 550 | Python | routing | 4 |
| sopaco/saga-reader | 537 | Rust | statemachine | 4 |
| xamarin/Xamarin.Auth | 529 | C# | routing | 0 |
| maddox/magick-installer | 487 | Shell | verification | 0 |
| quickdrawjs/quickdraw | 486 | JavaScript | editing | 4 |
| Darwin-Agent/HarnessX | 477 | Python | toolloop | 4 |
| CodeSoul-co/Hypha | 446 | TypeScript | statemachine | 4 |
| ghuntley/amazon-kiro.kiro-agent-source-code-analysis | 367 | JavaScript | routing | 0 |
| soujanyaporia/multimodal-sentiment-analysis | 367 | Python | routing | 2 |
| idugalic/micro-company | 362 | JavaScript | statemachine | 0 |
| igorski/bitmappery | 344 | TypeScript | editing | 4 |
| mheiber/redux-machine | 335 | JavaScript | statemachine | 0 |
| computesdk/computesdk | 275 | TypeScript | toolloop | 4 |
| temporalio/samples-java | 259 | Java | statemachine | 4 |
| orra-dev/orra | 248 | Go | statemachine | 4 |
| NitorCreations/nflow | 239 | Java | statemachine | 4 |
| Devtography/electron-react-typescript-webpack-boilerplate | 235 | JavaScript | verification | 4 |
| ProseMirror/prosemirror-state | 231 | TypeScript | seed | 4 |
| VladKopanev/zio-saga | 228 | Scala | statemachine | 0 |
| microsoft/duroxide | 218 | Rust | statemachine | 4 |
| linreal/cascade-editor | 197 | Kotlin | editing | 4 |
| IBM-Design/icons | 192 | JavaScript | routing | 0 |
| ProseMirror/prosemirror-transform | 180 | TypeScript | seed | 6 |
| GoogleCloudPlatform/workflows-demos | 159 | Python | statemachine | 4 |
| floxy-project/floxy | 143 | Go | statemachine | 4 |
| Azure-Samples/Azure-Language-OpenAI-Conversational-Agent-Accelerator | 135 | Python | routing | 4 |
| ProseMirror/prosemirror-history | 60 | TypeScript | seed | 2 |
| aprilandjan/lerna-electron-react-typescript-boilerplate | 13 | JavaScript | verification | 4 |
| arthurspk/guiadeelectron | 8 | unknown | verification | 0 |
| wsw0108/playwright-fake-dialog | 4 | JavaScript | verification | 0 |
| kud04rk/anime-renamer-gui | 3 | TypeScript | verification | 4 |
| oscartbeaumont/spectroscope | 3 | TypeScript | verification | 0 |
| Badsha1996/master-os-ai | 2 | JavaScript | verification | 4 |
| chendonghp/Electron-in-Action-by-Manning-2023-updated | 0 | JavaScript | verification | 4 |

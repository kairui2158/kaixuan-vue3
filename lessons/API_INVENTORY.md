# API Inventory (from explorer agent Bohr)

## Summary: 13 fetch calls, 5 endpoint types

| Type | URL Pattern | Count |
|------|-----------|-------|
| LLM Chat | {baseUrl}/chat/completions | 8 |
| LLM Models | {baseUrl}/models | 2 |
| GitHub Search | api.github.com/search/repositories | 2 |
| GitHub User | api.github.com/user | 1 |
| GitHub README | api.github.com/repos/{name}/readme | 1 |

## Details

| # | File | Line | URL | Method | Trigger | Success Behavior | Fail Behavior |
|---|------|------|-----|--------|---------|-------------------|---------------|
| 1 | renderer_v2.js | 692 | {baseUrl}/models | GET | testConnection() | #status-connection green | #status-connection red |
| 2 | renderer_v2.js | 728 | {baseUrl}/models | GET | fetchModelList() | renderProviderModelList() | toast error |
| 3 | renderer_v2.js | 847 | {baseUrl}/chat/completions | POST | apiGenerate() | stream onChunk | toast error |
| 4 | renderer_v2.js | 977 | {baseUrl}/chat/completions | POST | streamChat()/sendMessage() | stream .message-content | [ERR] in .message-content |
| 5 | renderer_v2.js | 1584 | {baseUrl}/chat/completions | POST | _runSkillTest() | #stm-result stream | #stm-result [ERR] |
| 6 | renderer_v2.js | 2812 | {baseUrl}/chat/completions | POST | runAgentTest() | #atm-result stream | #atm-result [ERR] |
| 7 | renderer_v2.js | 2883 | api.github.com/search/repositories | GET | searchGitHub() | _renderMarketResults() | #market-status [ERR] |
| 8 | renderer_v2.js | 2915 | api.github.com/repos/{name}/readme | GET | _installFromMarket() | create Agent/Skill | toast error |
| 9 | renderer_v2.js | 2987 | api.github.com/search/repositories | GET | _goToPage() | _renderMarketResults() | #market-status [ERR] |
| 10 | renderer_v2.js | 3009 | {baseUrl}/chat/completions | POST | _callAiApi() | return text to caller | toast [API error] |
| 11 | panels.js | 129 | {baseUrl}/chat/completions | POST | toggleAICoCreate() | aiDiv.textContent stream | aiDiv [ERR] |
| 12 | panels.js | 176 | {baseUrl}/chat/completions | POST | generateOutlineSkills() | #ow-skill-suggestions | toast error |
| 13 | panels.js | 1843 | api.github.com/user | GET | _saveGitHubToken() | StorageManager.set githubToken | #github-status-text invalid |

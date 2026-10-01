/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'ui-no-direct-tool-executor',
      comment: '组件层必须通过 dialogueToolSurface 单源入口构建工具面。',
      severity: 'error',
      from: { path: '^src/components/' },
      to: { path: '^src/services/editorTools\\.ts$' },
    },
    {
      name: 'ui-no-direct-surface',
      comment: '组件层禁止直接调用 dialogueFoundation 工具面解析函数。',
      severity: 'error',
      from: { path: '^src/components/' },
      to: { path: '^src/services/dialogueFoundation\\.ts$' },
    },
    {
      name: 'eval-must-use-corpus',
      comment: '意图评估脚本必须消费 chainIntentCorpus 单源语料。',
      severity: 'error',
      from: { path: '^scripts/evaluate-chain-intent-router\\.mjs$' },
      to: { path: '^src/services/chainIntentCorpus\\.ts$' },
    },
    {
      name: 'ui-no-direct-editor-semantics',
      comment: '组件层禁止绕过协议/工具面直接消费编辑语义；operation 必须由服务层单源校验。',
      severity: 'error',
      from: { path: '^src/components/' },
      to: { path: '^src/services/editorEditSemantics\\.ts$' },
    },
    {
      name: 'ui-outline-tools-via-surface',
      comment: '组件层不得把 outlineTools 作为工具面直接注册；必须作为 extraTools 交给统一入口。',
      severity: 'error',
      from: {
        path: '^src/components/',
        pathNot: 'src/components/common/OutlineWorkspace\\.vue$',
      },
      to: { path: '^src/services/outlineTools\\.ts$' },
    },
    {
      name: 'orphan-error',
      comment: '服务层孤儿模块必须显式移除或纳入测试/生产入口。',
      severity: 'error',
      from: { orphan: true, path: '^src/services/(?!.*\\.d\\.ts$)' },
      to: {},
    },
    {
      name: 'tool-loop-policy-single-source',
      comment: '组件与执行器必须消费 toolLoopPolicy 单源，禁止绕开策略矩阵设置循环上限。',
      severity: 'error',
      from: {
        path: '^src/(components|services)/',
        pathNot: '^src/services/(toolLoopPolicy(\\.spec)?|aiService|editTaskExecutor)\\.ts$',
      },
      to: { path: '^src/services/toolLoopPolicy\\.ts$' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'node', 'require'],
    },
    reporterOptions: {
      text: {},
    },
  },
}

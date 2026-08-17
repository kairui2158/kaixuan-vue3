const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('dist-renderer/index.html'));
  if (!page) throw new Error('Electron page not found');

  const result = await page.evaluate(async () => {
    const app = document.querySelector('#app')?.__vue_app__;
    const pinia = app?.config.globalProperties?.$pinia;
    const project = pinia?._s.get('project');
    const pipeline = pinia?._s.get('pipeline');
    if (!project || !pipeline) throw new Error('Pinia stores not found');

    const original = {
      volumes: JSON.parse(JSON.stringify(project.volumes)),
      chapters: JSON.parse(JSON.stringify(project.chapters)),
      breakpoint: pipeline.breakpoint,
      fetch: window.fetch
    };
    const calls = [];
    let callNo = 0;
    if (!document.querySelector('#pipeline-panel')) {
      document.querySelector('#btn-pipeline')?.click();
      await new Promise((r) => setTimeout(r, 300));
    }
    pipeline.setStep(3);
    await new Promise((r) => setTimeout(r, 300));
    const diagnostics = {
      currentStepBefore: pipeline.currentStep,
      buttonExists: !!document.querySelector('#btn-pl-gen-chapters'),
      buttonDisplay: document.querySelector('#btn-pl-gen-chapters') ? getComputedStyle(document.querySelector('#btn-pl-gen-chapters')).display : null,
      buttonDisabled: document.querySelector('#btn-pl-gen-chapters')?.disabled ?? null,
      pipelineButtons: [...document.querySelectorAll('button')].map((b) => ({ id: b.id, text: b.innerText.trim() })).filter((b) => /流水线|pipeline|生成/.test(b.id + b.text)).slice(0, 30)
    };
    try {
      project.$patch({
        volumes: [{ id: 'vol-test-supplement', name: '补充验证卷', outline: '验证补充', summary: '', suggestedWords: 14000, confirmed: false, locked: false }],
        chapters: {}
      });
      pipeline.clearBreakpoint();
      window.fetch = async (url, opts) => {
        if (!String(url).includes('/chat/completions')) return original.fetch(url, opts);
        callNo += 1;
        const body = JSON.parse(opts?.body || '{}');
        const prompt = body.messages?.find((m) => m.role === 'user')?.content || '';
        calls.push({ callNo, prompt });
        const rows = callNo <= 2
          ? [{ title: '第1章', plot: '首批1' }, { title: '第2章', plot: '首批2' }]
          : callNo <= 4
            ? [{ title: '第2章', plot: '重复标题' }, { title: '第3章', plot: '补充3' }]
            : [{ title: '第3章', plot: '重复标题' }, { title: '第4章', plot: '补充4' }];
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(rows) } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };
      document.querySelector('#btn-pl-gen-chapters')?.click();
      const deadline = Date.now() + 15000;
      while (pipeline.isGenerating && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
      const vol = project.volumes[0];
      const chapters = project.chapters[vol.id] || [];
      return {
        passed: !pipeline.isGenerating && chapters.length === 4 && calls.length === 6,
        diagnostics,
        calls: calls.map((x) => ({ callNo: x.callNo, hasSupplementInstruction: /已有\d+章，继续从第/.test(x.prompt), prompt: x.prompt.slice(0, 180) })),
        chapterTitles: chapters.map((x) => x.title),
        uniqueTitles: new Set(chapters.map((x) => x.title)).size === chapters.length,
        breakpointAfter: pipeline.breakpoint,
        status: pipeline.generationStatus
      };
    } finally {
      window.fetch = original.fetch;
      project.$patch({ volumes: original.volumes, chapters: original.chapters });
      pipeline.$patch({ breakpoint: original.breakpoint });
    }
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err.stack || err);
  process.exitCode = 1;
}).finally(() => setTimeout(() => process.exit(process.exitCode || 0), 50));

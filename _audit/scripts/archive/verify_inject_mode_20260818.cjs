const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('dist-renderer/index.html'))
  if (!page) throw new Error('Electron page not found')

  const result = await page.evaluate(async () => {
    const app = document.querySelector('#app')?.__vue_app__
    const pinia = app?.config.globalProperties?.$pinia
    const skills = pinia?._s.get('skill')
    const pipeline = pinia?._s.get('pipeline')
    if (!skills || !pipeline) throw new Error('Pinia stores not found')

    if (!document.querySelector('#pipeline-panel')) {
      document.querySelector('#btn-pipeline')?.click()
      await new Promise((r) => setTimeout(r, 400))
    }
    const panel = document.querySelector('#pipeline-panel')
    const componentChain = []
    let component = panel?.__vueParentComponent
    while (component && componentChain.length < 8) {
      componentChain.push({
        type: component.type?.name || component.type?.__name || 'anonymous',
        stateKeys: Object.keys(component.setupState || {}),
        hasRunStepSkills: typeof component.setupState?.runStepSkills === 'function'
      })
      if (typeof component.setupState?.runStepSkills === 'function') break
      component = component.parent
    }
    const stateKeys = component ? Object.keys(component.setupState || {}) : []
    const buttons = [...document.querySelectorAll('button')]
      .map((b) => ({ id: b.id, text: (b.innerText || '').trim() }))
      .filter((b) => /生成|流水线|章节/.test(b.id + b.text))

    const original = {
      skills: JSON.parse(JSON.stringify(skills.skills)),
      fetch: window.fetch,
      currentStep: pipeline.currentStep
    }
    const calls = []
    try {
      const testSkills = [
        { id: 'verify-system', name: '系统注入', template: 'SYSTEM_MARKER', injectMode: 'system_prefix' },
        { id: 'verify-user-prefix', name: '用户前缀', template: 'PREFIX_MARKER', injectMode: 'user_prefix' },
        { id: 'verify-user-suffix', name: '用户后缀', template: 'SUFFIX_MARKER', injectMode: 'user_suffix' }
      ]
      skills.skills.splice(0, skills.skills.length, ...testSkills.map((s) => ({
        ...s, category: 'verify', executionMode: 'chain', outputFormat: 'text', validationRules: [], splitSize: 1000
      })))
      const setup = component?.setupState
      if (!setup?.stepSkills || !setup?.runStepSkills) {
        return { passed: false, reason: 'pipeline setup methods not exposed', panelExists: !!panel, stateKeys, componentChain, buttons }
      }
      setup.stepSkills[0] = testSkills.map((s) => s.id)
      setup.stepSkillModes[0] = 'compose'
      window.fetch = async (url, opts) => {
        if (!String(url).includes('/chat/completions')) return original.fetch(url, opts)
        const body = JSON.parse(opts?.body || '{}')
        calls.push(body.messages)
        return new Response(JSON.stringify({ choices: [{ message: { content: 'verify-result' } }] }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        })
      }
      await setup.runStepSkills(0, 'USER_MARKER', undefined, 'fallback')
      const messages = calls[0] || []
      const system = messages.find((m) => m.role === 'system')?.content || ''
      const user = messages.find((m) => m.role === 'user')?.content || ''
      const positions = (text, marker) => ({ index: text.indexOf(marker), count: text.split(marker).length - 1 })
      return {
        passed: calls.length === 1 && positions(system, 'SYSTEM_MARKER').count === 1 &&
          positions(user, 'PREFIX_MARKER').count === 1 && positions(user, 'SUFFIX_MARKER').count === 1 &&
          user.indexOf('PREFIX_MARKER') < user.indexOf('USER_MARKER') && user.indexOf('USER_MARKER') < user.indexOf('SUFFIX_MARKER'),
        panelExists: !!panel,
        stateKeys,
        componentChain,
        buttons,
        callCount: calls.length,
        system,
        user
      }
    } finally {
      skills.skills.splice(0, skills.skills.length, ...original.skills)
      window.fetch = original.fetch
      pipeline.setStep(original.currentStep)
    }
  })

  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}

main().catch((err) => {
  console.error(err.stack || err)
  process.exitCode = 1
}).finally(() => setTimeout(() => process.exit(process.exitCode || 0), 50))

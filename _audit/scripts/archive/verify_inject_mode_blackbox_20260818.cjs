const { chromium } = require('playwright')

const MARKERS = {
  system: 'VERIFY_SYSTEM_MARKER',
  prefix: 'VERIFY_PREFIX_MARKER',
  suffix: 'VERIFY_SUFFIX_MARKER',
  business: 'VERIFY_BUSINESS_PROMPT'
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function count(text, marker) {
  return String(text || '').split(marker).length - 1
}

function positionCheck(user, before, after) {
  const beforeIndex = user.indexOf(before)
  const businessIndex = user.indexOf(MARKERS.business)
  const afterIndex = user.lastIndexOf(after)
  return beforeIndex >= 0 && businessIndex >= 0 && afterIndex >= 0 &&
    beforeIndex < businessIndex && businessIndex < afterIndex
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts().flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes('dist-renderer/index.html'))
  if (!page) throw new Error('Electron page not found')

  const result = await page.evaluate(async (markers) => {
    const root = document.querySelector('#app')
    const app = root?.__vue_app__
    const pinia = app?.config?.globalProperties?.$pinia
    const skillStore = pinia?._s.get('skill')
    const pipelineStore = pinia?._s.get('pipeline')
    const projectStore = pinia?._s.get('project')
    if (!skillStore || !pipelineStore || !projectStore) throw new Error('Required Pinia stores not found')

    if (!document.querySelector('#pipeline-panel')) document.querySelector('#btn-pipeline')?.click()
    await new Promise((resolve) => setTimeout(resolve, 200))
    const panel = document.querySelector('#pipeline-panel')
    if (!panel) throw new Error('Pipeline panel not found')

    const component = panel.__vueParentComponent
    const setup = component?.setupState || {}
    const original = {
      skills: JSON.parse(JSON.stringify(skillStore.skills || [])),
      outlineText: projectStore.outlineText,
      volumes: JSON.parse(JSON.stringify(projectStore.volumes || [])),
      chapters: JSON.parse(JSON.stringify(projectStore.chapters || {})),
      currentStep: pipelineStore.currentStep,
      stepSkills: setup.stepSkills ? JSON.parse(JSON.stringify(setup.stepSkills)) : null,
      stepSkillModes: setup.stepSkillModes ? JSON.parse(JSON.stringify(setup.stepSkillModes)) : null,
      fetch: window.fetch
    }

    const markerCount = (text, marker) => String(text || '').split(marker).length - 1
    const markerPositionCheck = (user, before, after) => {
      const beforeIndex = user.indexOf(before)
      const businessIndex = user.indexOf(markers.business)
      const afterIndex = user.lastIndexOf(after)
      return beforeIndex >= 0 && businessIndex >= 0 && afterIndex >= 0 &&
        beforeIndex < businessIndex && businessIndex < afterIndex
    }

    const testSkills = [
      { id: 'verify-inject-system', name: '验证系统注入', template: markers.system, injectMode: 'system_prefix' },
      { id: 'verify-inject-prefix', name: '验证用户前缀', template: markers.prefix, injectMode: 'user_prefix' },
      { id: 'verify-inject-suffix', name: '验证用户后缀', template: markers.suffix, injectMode: 'user_suffix' }
    ].map((skill) => ({
      ...skill,
      category: 'verify-only',
      executionMode: 'compose',
      outputFormat: 'text',
      validationRules: [],
      customVars: {},
      splitSize: 1000
    }))

    const selectValue = (selector, value) => {
      const element = document.querySelector(selector)
      if (!element) throw new Error(`selector not found: ${selector}`)
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
      setter?.call(element, value)
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
    }

    const click = (selector) => {
      const element = document.querySelector(selector)
      if (!element) throw new Error(`button not found: ${selector}`)
      element.click()
    }

    const setupModeAndSkills = async (mode) => {
      pipelineStore.setStep(2)
      await new Promise((resolve) => setTimeout(resolve, 120))
      while (document.querySelector('#pl-s3-skills-list .pl-chip-close')) {
        document.querySelector('#pl-s3-skills-list .pl-chip-close').click()
        await new Promise((resolve) => setTimeout(resolve, 60))
      }
      selectValue('#pl-s3-mode', mode)
      await new Promise((resolve) => setTimeout(resolve, 80))

      for (const skill of testSkills) {
        selectValue('#pl-s3-skill', skill.id)
        click('#pl-s3-add-skill')
        await new Promise((resolve) => setTimeout(resolve, 80))
      }
      const selected = [...document.querySelectorAll('#pl-s3-skills-list .pl-skill-chip')]
        .map((chip) => chip.textContent?.trim() || '')
      if (selected.length !== 3) throw new Error(`Expected 3 selected skills, got ${selected.length}`)
    }

    const runMode = async (mode) => {
      const calls = []
      const originalFetch = window.fetch
      window.fetch = async (url, options) => {
        if (!String(url).includes('/chat/completions')) return originalFetch(url, options)
        const body = JSON.parse(options?.body || '{}')
        calls.push(body.messages || [])
        const content = '[{"name":"验证卷","outline":"验证卷纲","summary":"验证摘要","suggestedWords":10000}]'
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      try {
        await setupModeAndSkills(mode)
        projectStore.outlineText = markers.business
        projectStore.volumes = []
        const button = document.querySelector('#btn-pl-gen-volumes')
        if (!button) throw new Error('volume generation button not found')
        button.click()
        await new Promise((resolve) => setTimeout(resolve, 700))

        const messages = calls.map((items) => ({
          system: items.filter((item) => item.role === 'system').map((item) => item.content).join('\n'),
          user: items.filter((item) => item.role === 'user').map((item) => item.content).join('\n')
        }))
        const composeMessages = messages[0] || { system: '', user: '' }
        const composePass = mode === 'compose' && calls.length === 1 &&
          markerCount(composeMessages.system, markers.system) === 1 &&
          markerCount(composeMessages.user, markers.prefix) === 1 &&
          markerCount(composeMessages.user, markers.suffix) === 1 &&
          markerPositionCheck(composeMessages.user, markers.prefix, markers.suffix)

        const chainPass = mode === 'chain' && calls.length === 3 &&
          markerCount(messages[0].system, markers.system) === 1 &&
          markerCount(messages[1].user, markers.prefix) === 1 &&
          markerCount(messages[2].user, markers.suffix) === 1 &&
          messages.every((message) => message.user.includes(markers.business) || message.user.includes('上一个Skill的输出结果'))

        return {
          passed: composePass || chainPass,
          callCount: calls.length,
          messages,
          generatedVolumes: projectStore.volumes.length,
          mode,
          composePass,
          chainPass
        }
      } finally {
        window.fetch = originalFetch
      }
    }

    try {
      skillStore.skills.splice(0, skillStore.skills.length, ...testSkills)
      await new Promise((resolve) => setTimeout(resolve, 120))
      const compose = await runMode('compose')
      const chain = await runMode('chain')
      return { passed: compose.passed && chain.passed, compose, chain }
    } finally {
      skillStore.skills.splice(0, skillStore.skills.length, ...original.skills)
      projectStore.outlineText = original.outlineText
      projectStore.volumes = original.volumes
      projectStore.chapters = original.chapters
      if (original.stepSkills && setup.stepSkills) setup.stepSkills = original.stepSkills
      if (original.stepSkillModes && setup.stepSkillModes) setup.stepSkillModes = original.stepSkillModes
      if (typeof setup.saveStepConfig === 'function') setup.saveStepConfig()
      pipelineStore.setStep(original.currentStep)
      window.fetch = original.fetch
    }
  }, MARKERS)

  console.log(JSON.stringify(result, null, 2))
  await browser.close()
  process.exit(result.passed ? 0 : 1)
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exit(1)
})

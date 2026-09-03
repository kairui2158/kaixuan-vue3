const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const outFile = path.join(root, '_audit', 'UI_DRAFT_HOME_CO_CREATION_CONFIG.png')

const W = 1360
const H = 900
const css = `
* { margin: 0; padding: 0; box-sizing: border-box; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; }
body { background: #0a0a0c; width: ${W}px; height: ${H}px; overflow: hidden; }
.app { display: grid; grid-template-columns: 260px 1fr 400px; height: ${H}px; background: #0a0a0c; }
.sidebar { background: #121215; border-right: 1px solid #25252e; padding: 18px 16px; display: flex; flex-direction: column; gap: 14px; }
.side-title { color: #e8e8ec; font-size: 16px; font-weight: 700; }
.side-sub { color: #888a94; font-size: 11px; margin-top: -10px; }
.tree { display: flex; flex-direction: column; gap: 6px; }
.tree-item { color: #a0a2ac; font-size: 12px; padding: 7px 9px; border-radius: 6px; background: transparent; }
.tree-item.active { background: rgba(124, 140, 248, .12); color: #e8e8ec; }
.tree-item.hl { color: #9da9fa; background: rgba(124, 140, 248, .07); }
.main { display: grid; grid-template-rows: 47px 1fr 42px; border-right: 1px solid #25252e; background: #121215; min-width: 0; }
.main-head { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #25252e; padding: 0 18px; background: #121215; }
.doc-title { color: #e8e8ec; font-size: 14px; font-weight: 650; }
.doc-badge { color: #9da9fa; background: rgba(124, 140, 248, .12); border-radius: 5px; padding: 3px 7px; font-size: 11px; }
.doc-meta { margin-left: auto; color: #888a94; font-size: 11px; }
.editor { background: #0a0a0c; padding: 24px 36px; overflow: hidden; }
.paper { background: #121215; border: 1px solid #25252e; border-radius: 8px; padding: 26px 30px; color: #e8e8ec; font-size: 13px; line-height: 1.85; max-width: 560px; }
.paper h3 { color: #e8e8ec; font-size: 15px; margin-bottom: 14px; }
.paper p { color: #c8c9d3; margin-bottom: 12px; }
.paper .mark { color: #9da9fa; background: rgba(124, 140, 248, .12); border-radius: 3px; padding: 0 3px; }
.main-foot { display: flex; align-items: center; gap: 10px; border-top: 1px solid #25252e; padding: 0 16px; color: #888a94; font-size: 11px; }
.ghost-btn { color: #a0a2ac; border: 1px solid #35353f; border-radius: 5px; padding: 4px 9px; font-size: 11px; background: transparent; }
.right { display: grid; grid-template-rows: 1fr auto auto auto; min-width: 0; background: #121215; }
.messages { padding: 14px 14px 8px; overflow: hidden; display: flex; flex-direction: column; gap: 12px; background: #0a0a0c; }
.message { display: flex; flex-direction: column; gap: 6px; }
.msg-label { font-size: 9px; color: #888a94; }
.msg-label.ai { color: #9da9fa; }
.bubble { max-width: 340px; border-radius: 7px; padding: 9px 11px; font-size: 11px; line-height: 1.65; }
.bubble.user { background: #1a1a1f; border: 1px solid #25252e; color: #e8e8ec; align-self: flex-end; }
.bubble.ai { background: #15151c; border: 1px solid #2b2b37; color: #c8c9d3; }
.bubble strong { color: #9da9fa; font-weight: 650; }
.actions { display: flex; gap: 6px; align-self: flex-end; }
.action { height: 22px; border-radius: 4px; border: 1px solid #35353f; background: #1a1a1f; color: #a0a2ac; font-size: 9px; padding: 0 7px; }
.action.primary { border-color: rgba(124, 140, 248, .5); color: #dfe2ff; background: rgba(124, 140, 248, .14); }
.input { border-top: 1px solid #25252e; background: #121215; padding: 10px 12px; }
.input-box { display: grid; grid-template-columns: 1fr 56px; gap: 7px; align-items: center; }
.input-field { height: 34px; border-radius: 6px; border: 1px solid #35353f; background: #15151c; color: #888a94; font-size: 10px; padding: 0 9px; display: flex; align-items: center; }
.send { height: 34px; border-radius: 6px; border: 0; background: linear-gradient(135deg, #7c8cf8, #9b6cf8); color: #fff; font-size: 11px; display: flex; align-items: center; justify-content: center; }
.co-bar { border-top: 1px solid #25252e; background: #1a1a1f; padding: 6px 12px 8px; display: grid; grid-template-rows: auto auto; gap: 5px; }
.co-row { display: grid; grid-template-columns: repeat(3, 1fr) auto; gap: 8px; align-items: center; }
.co-row-2 { display: flex; align-items: center; gap: 5px; min-width: 0; }
.field { min-width: 0; display: flex; align-items: center; gap: 5px; }
.label { color: #888a94; font-size: 9px; white-space: nowrap; }
.select { height: 24px; border-radius: 4px; border: 1px solid #35353f; background: #15151c; color: #e8e8ec; font-size: 10px; padding: 0 6px; display: flex; align-items: center; justify-content: space-between; min-width: 0; flex: 1; }
.select span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.caret { color: #888a94; margin-left: 3px; }
.chips-inline { display: flex; align-items: center; gap: 5px; flex-wrap: nowrap; overflow: hidden; min-width: 0; }
.chip { display: inline-flex; align-items: center; gap: 4px; height: 22px; border: 1px solid #25252e; border-radius: 4px; background: #15151c; padding: 0 6px; }
.seq { width: 14px; height: 14px; border-radius: 50%; background: rgba(124, 140, 248, .16); color: #9da9fa; font-size: 8px; display: flex; align-items: center; justify-content: center; }
.chip-name { color: #e8e8ec; font-size: 9px; white-space: nowrap; }
.close { color: #888a94; font-size: 11px; line-height: 1; text-align: center; }
.more { color: #9da9fa; font-size: 9px; white-space: nowrap; }
`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="app">
  <aside class="sidebar">
    <div class="side-title">神意助手</div>
    <div class="side-sub">项目：长夜灯</div>
    <div class="tree">
      <div class="tree-item active">第一卷 暗河</div>
      <div class="tree-item">第 1 章 暗巷交易</div>
      <div class="tree-item">第 2 章 旧账</div>
      <div class="tree-item">第 3 章 断线</div>
      <div class="tree-item hl">第二卷 潮声</div>
      <div class="tree-item">第 4 章 夜航</div>
      <div class="tree-item">第 5 章 灯塔</div>
    </div>
  </aside>
  <main class="main">
    <header class="main-head">
      <div class="doc-title">第 1 章 暗巷交易</div>
      <div class="doc-badge">正文</div>
      <div class="doc-meta">自动保存 · 3 分钟前</div>
    </header>
    <section class="editor">
      <article class="paper">
        <h3>第 1 章 暗巷交易</h3>
        <p>雨水顺着屋檐滴落，男主把袖口收紧，站在废弃仓库的铁门旁。他听见巷口传来三声短促的口哨，那是和林见约好的信号。</p>
        <p>"东西带了吗？"林见的声音比记忆里低，像被雨泡过。男主把布包递过去，指尖碰到对方腕上的<span class="mark">旧疤</span>。</p>
        <p>那是三年前留下的。那年他们还在同一条船上，而现在，一个成了买家，一个成了卖家。</p>
      </article>
    </section>
    <footer class="main-foot">
      <button class="ghost-btn">插入 AI 建议</button>
      <button class="ghost-btn">替换选区</button>
      <button class="ghost-btn">查看修改记录</button>
      <span style="margin-left:auto">字数 2,486</span>
    </footer>
  </main>
  <section class="right">
    <div class="messages">
      <div class="message">
        <div class="msg-label" style="text-align:right">你</div>
        <div class="bubble user">帮我把第二卷的伏笔重新梳理一遍，重点看男主和林见的关系线。</div>
      </div>
      <div class="message">
        <div class="msg-label ai">AI · 卷纲推演师</div>
        <div class="bubble ai">第二卷当前有 <strong>4 条未回收伏笔</strong>。我建议保留 A/C 两条主线伏笔，把"旧疤"提前到第三幕触发，并把灯塔线并入林见的信任变化。</div>
        <div class="actions">
          <button class="action">插入编辑器</button>
          <button class="action">替换选区</button>
          <button class="action primary">预览修改</button>
        </div>
      </div>
    </div>
    <div class="input">
      <div class="input-box">
        <div class="input-field">输入消息，和 AI 共同打磨当前章节…</div>
        <button class="send">发送</button>
      </div>
    </div>
    <div class="co-bar">
      <div class="co-row">
        <div class="field"><span class="label">SKILL选择</span><div class="select"><span>添加技能</span><span class="caret">▾</span></div></div>
        <div class="field"><span class="label">AGENT</span><div class="select"><span>卷纲推演师</span><span class="caret">▾</span></div></div>
        <div class="field"><span class="label">模式</span><div class="select"><span>串行</span><span class="caret">▾</span></div></div>
        <button class="send" style="height:24px;font-size:9px;border-radius:4px;padding:0 9px">共创</button>
      </div>
      <div class="co-row-2">
        <span class="label">SKILL显示</span>
        <div class="chips-inline">
          <div class="chip"><div class="seq">1</div><span class="chip-name">卷纲结构解析</span><span class="close">×</span></div>
          <div class="chip"><div class="seq">2</div><span class="chip-name">卷纲推演补全</span><span class="close">×</span></div>
          <div class="chip"><div class="seq">3</div><span class="chip-name">伏笔连续性检查</span><span class="close">×</span></div>
          <span class="more">+添加</span>
        </div>
      </div>
    </div>
  </section>
</div>
</body></html>`

;(async () => {
  const { chromium } = require('playwright')
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'load' })
  await page.screenshot({ path: outFile })
  await browser.close()
  console.log(outFile)
})().catch(error => {
  console.error(error)
  process.exit(1)
})

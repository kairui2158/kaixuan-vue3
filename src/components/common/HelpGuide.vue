<template>
  <div v-if="visible" class="help-overlay" :style="{ zIndex: modalQueue.getZIndex('help-guide') }" @click.self="close">
    <section class="help-modal" role="dialog" aria-modal="true" aria-label="应用教学指南">
      <header class="help-header">
        <div>
          <h2>应用教学指南</h2>
          <p>按创作顺序阅读，遇到哪个板块就看哪一节。每一节都按“这是干什么的、怎么点、出问题怎么办”来讲。</p>
        </div>
        <button class="help-close" type="button" aria-label="关闭教学指南" @click="close">×</button>
      </header>

      <div class="help-layout">
        <nav class="help-nav" aria-label="教学章节">
          <button
            v-for="item in sections"
            :key="item.id"
            type="button"
            :class="{ active: activeId === item.id }"
            @click="activeId = item.id"
          >
            {{ item.title }}
          </button>
        </nav>

        <article class="help-content">
          <template v-if="activeId === 'start'">
            <h3>快速上手</h3>
            <p>你可以把神意助手想象成一条“小说加工流水线”：先把大纲定住，再一层一层细化，最后生成正文。前一层的输出就是后一层的输入，所以每层确认过再往下走，质量最稳。</p>
            <h4>第一次使用，按这 8 步走</h4>
            <ol>
              <li>创建项目，或打开已有项目。</li>
              <li>在大纲工作台写大纲，也可以点“AI 共创大纲”让模型陪你改。</li>
              <li>大纲满意后点“确认大纲，锁定并进入创作”。锁定后流水线才知道该按哪份大纲干活。</li>
              <li>打开生成流水线，先在大纲层确认总字数，再进入设定层。</li>
              <li>设定层点“AI设定生成 / 解析大纲”，检查生成结果并绑定需要的设定。</li>
              <li>卷纲层确定卷数并生成卷纲，然后点某卷的“绑定到章节层”。</li>
              <li>章节层生成章节列表；正文层生成正文，生成后可插入编辑器继续修改。</li>
              <li>正文确认时审核记忆，把重要事实写进项目记忆，后续章节就不会前后矛盾。</li>
            </ol>
            <h4>三条最容易被忽略的规则</h4>
            <ul>
              <li><strong>别跳层。</strong>没有设定和卷纲就直接生成正文，模型只能自己编，前后一致性会明显变差。</li>
              <li><strong>每层先确认再进入下一层。</strong>确认后的结果才会作为后续生成的稳定依据。</li>
              <li><strong>先配 API，再动技能。</strong>供应商、智能体、技能三层都要通，生成按钮才真正有东西可用。</li>
            </ul>
          </template>

          <template v-else-if="activeId === 'main'">
            <h3>主界面</h3>
            <p>主界面就是你的“工作台”：左边管目录，中间改文字，右边和 AI 讨论。</p>
            <dl>
              <dt>章节树</dt><dd>书的目录。卷、章节都从这里找。点“纲要”会打开卷纲纲要，点章节会打开正文，点“概要”会打开章节概要。</dd>
              <dt>编辑器</dt><dd>中间的大输入框。顶部有保存、导出、撤销、重做、查找替换、去AI味、AI起名等按钮。</dd>
              <dt>AI 对话框</dt><dd>和 AI 讨论当前打开的内容。AI 看到的是当前编辑器里的内容，大纲只是参考资料，不是主要内容。</dd>
              <dt>状态栏</dt><dd>看连接状态、当前模型、正在编辑的内容和字数。生成异常时先看这里。</dd>
            </dl>
            <h4>常用小动作</h4>
            <ul>
              <li>想改正文：章节树点章节，直接在编辑器里改，改完点保存。</li>
              <li>想改卷纲：章节树点该卷的“纲要”，编辑器切换到卷纲纲要。</li>
              <li>想找文字：点“查找”，可以单个替换，也可以全部替换。</li>
              <li>想导出：点“导出”，支持 Markdown、纯文本和 EPUB。</li>
            </ul>
          </template>

          <template v-else-if="activeId === 'outline'">
            <h3>大纲工作台</h3>
            <p>大纲工作台是写大纲的专用房间。这里可以自己写，也可以让 AI 陪你一起改，改到满意再锁定。</p>
            <h4>你可以做什么</h4>
            <ul>
              <li>直接编辑大纲，支持撤销、重做、复制、粘贴、查找。</li>
              <li>点“从文件导入”读取 .txt / .md / .rtf / .docx 文件。</li>
              <li>点“AI 共创大纲”和 AI 讨论；AI 提出的修改会先给预览，确认后才写入。</li>
              <li>AI 回复可以插入到光标处，也可以替换整个大纲。</li>
              <li>点“保存大纲到本地”把大纲另存为文件。</li>
              <li>点“确认大纲，锁定并进入创作”进入流水线。</li>
            </ul>
            <h4>锁定是什么意思</h4>
            <p>锁定就像把大纲“定稿”。锁定后流水线会按这份大纲生成，不会被后续编辑误改。想继续改大纲，先点“解锁”，改完再重新确认。</p>
            <h4>智能体和技能在哪</h4>
            <p>大纲工作台顶部可以选智能体、技能和技能模式。它和主页聊天的配置是分开的，两套配置不会互相打架。</p>
          </template>

          <template v-else-if="activeId === 'pipeline'">
            <h3>生成流水线</h3>
            <p>流水线负责把“一份大纲”加工成“一本可写的书”。每一层只做自己那一段事，上一层的结果是下一层的原料。</p>
            <dl>
              <dt>大纲层</dt><dd>只做一件事：确认总字数和大纲信息。智能体和技能配置已经移到大纲工作台。</dd>
              <dt>设定层</dt><dd>从大纲提取角色、世界观、势力、物品等设定。可以新增分类、手动补设定，也可以一键绑定到全局。</dd>
              <dt>卷纲层</dt><dd>决定写几卷、每卷讲什么。生成后有“绑定到章节层”按钮，想接着上一卷写就点“续生成”。</dd>
              <dt>章节层</dt><dd>把某一卷拆成具体章节，每章有标题和剧情点。想改某一章就点“编辑”。</dd>
              <dt>正文层</dt><dd>按章节生成正文。生成完可以插入编辑器，或确认并写入记忆。</dd>
            </dl>
            <h4>每一层怎么配</h4>
            <p>设定层、卷纲层、章节层、正文层顶部都有“本层智能体、技能、技能模式”。这些配置只影响本层，不会改其他层。</p>
            <h4>生成时看哪里</h4>
            <p>生成时页面底部会出现进度条。想看模型正在输出什么，点进度条上的“展开 API 输出”；看完点“收起 API 输出”。</p>
            <h4>逐卷生成怎么用</h4>
            <p>卷纲层有“AI生成全卷”和“逐卷生成”。逐卷生成适合写长篇：一次只生成一卷，确认满意后点该卷的“续生成”接着写下一卷；续生成同样只生成下一卷。</p>
            <h4>常见卡点</h4>
            <ul>
              <li>确认按钮灰着：多半是上游还没完成，比如大纲没锁定、没有绑定卷、没有可确认内容。</li>
              <li>生成失败：看执行日志和诊断日志，通常是 API 配置、模型权限或网络问题。</li>
              <li>对生成结果不满意：不要急着确认，先改提示或换技能重新生成。</li>
            </ul>
          </template>

          <template v-else-if="activeId === 'memory'">
            <h3>记忆板块</h3>
            <p>记忆板块就是 AI 的“项目记事本”。人物受伤了、关系变了、伏笔埋了，这些事写进记忆后，后面生成章节时 AI 会先翻这本记事本，减少前后矛盾。</p>
            <h4>什么时候写记忆</h4>
            <ul>
              <li>正文层点“确认并写入记忆”时会弹出记忆预览，先看清单再写入。</li>
              <li>编辑器里点“提取记忆”，可以针对当前正文手动提取。</li>
              <li>设置里开启“正文确认后自动抽取记忆”后，确认正文会更省事，但清单仍然建议看一眼。</li>
            </ul>
            <h4>记忆预览怎么审</h4>
            <ul>
              <li>不想写入的点“拒绝”；特别重要、不想被后续合并冲掉的点“锁定”。</li>
              <li>看错某条时可以先恢复，再重新决定。</li>
              <li>审完再点确认，误写进记忆的内容后面会影响生成判断。</li>
            </ul>
            <h4>导入和备份</h4>
            <ul>
              <li>合并导入 JSON 会把文件内容加进现有记忆，通常选这个。</li>
              <li>覆盖导入 JSON 会清掉当前项目记忆，只保留文件内容。必须先备份再点。</li>
              <li>关系、图谱、思维导图、时间线四个视图用来检查记忆是否乱、是否有冲突。</li>
              <li>导出 JSON 和角色卡可用于备份或迁移项目。</li>
            </ul>
          </template>

          <template v-else-if="activeId === 'skills'">
            <h3>技能与 Folder SKILL</h3>
            <p>技能就是“交给 AI 的作业说明”。普通技能像一张说明书；文件夹技能像一整包工具，里面除了说明书还有模板、脚本、示例和校验规则。</p>
            <h4>四种导入方式</h4>
            <dl>
              <dt>导入配置</dt><dd>导入 JSON 或 Markdown 文本技能。适合单文件技能。</dd>
              <dt>导入文件夹技能</dt><dd>选一个包含 SKILL.md 的文件夹。文件夹可以放在电脑任意位置，不需要先复制到应用目录。</dd>
              <dt>批量导入文件夹技能</dt><dd>选一个根目录，应用会扫描它下面的一级子文件夹，找出所有包含 SKILL.md 的文件夹。</dd>
              <dt>导入技能包</dt><dd>选 ZIP 技能包，会安装进应用技能库。</dd>
            </dl>
            <h4>Folder SKILL 怎么理解</h4>
            <ul>
              <li>一个文件夹就是一个技能，入口固定是 SKILL.md，模板放在 template.md。</li>
              <li>文件夹名不是技能 ID，真正的 ID 写在 SKILL.md 里。</li>
              <li>meta.json、script.js、samples.txt、schema.json 是可选增强：管配置、脚本、示例和输出校验。</li>
              <li>samples.txt 只放短句风格参考或占位符示例，不要放完整成品，避免 AI 把示例内容当成结果复制。</li>
              <li>应用只认这一层文件，不扫描更深的子文件夹。</li>
            </ul>
            <h4>导入后怎么用</h4>
            <ul>
              <li>文件夹技能是外部路径模式：你改源文件夹里的文件，应用下次读取就用新内容。</li>
              <li>源文件夹被移动或删除时，技能卡会显示“路径失效”。点“重新选择文件夹”，选回新位置即可恢复。</li>
              <li>设置页里文件夹技能是只读展示。想改内容，点“打开文件夹”去改源文件。</li>
              <li>体检可以检查文件缺失、格式错误等问题；测试可以先跑一次看输出是否符合预期。</li>
            </ul>
          </template>

          <template v-else-if="activeId === 'ai'">
            <h3>AI 与配置</h3>
            <p>可以把 AI 配置想成三层：供应商管“连到谁”，智能体管“用哪个模型、什么性格”，技能管“这次具体怎么干”。</p>
            <dl>
              <dt>供应商</dt><dd>保存接口地址、密钥、模型列表。地址写错、密钥失效、模型没权限，都会在这里出问题。</dd>
              <dt>智能体</dt><dd>决定模型、温度、输出上限和基础人设。比如同一个模型，低温度更稳，高温度更有创造性。</dd>
              <dt>技能</dt><dd>给具体任务的作业指令。设定怎么拆、卷纲怎么写、正文怎么落笔，都靠技能交代。</dd>
              <dt>技能模式</dt><dd>串行是一个技能做完，把结果交给下一个技能；并行是把多个技能合成一次调用，速度更快，但技能级智能体不生效。</dd>
            </dl>
            <h4>不出内容时按顺序查</h4>
            <ol>
              <li>供应商是否启用，接口地址和密钥是否正确。</li>
              <li>模型列表能不能读取，当前模型有没有权限。</li>
              <li>生成、验证、检测等用途是否绑定了可用供应商。</li>
              <li>当前层或当前对话框绑定的技能、智能体是否选对。</li>
              <li>仍失败就看诊断日志，按时间点找错误。</li>
            </ol>
          </template>

          <template v-else-if="activeId === 'deai'">
            <h3>去AI味</h3>
            <p>去AI味就是把“AI 腔”的机械表达改得更像人写的，同时尽量保住事实、场景和人物状态。</p>
            <ul>
              <li>正文层已经内嵌降AI：生成前自动加方法论约束，生成后自动跑硬规则清洗，不需要手动再来一遍。</li>
              <li>编辑器顶部的“去AI味”用于手动处理。适合处理导入文本、自己写的稿子，或对已生成正文再打磨。</li>
              <li>处理完成后重点检查对话、动作、关键信息有没有被误改。</li>
              <li>处理失败时看诊断日志，区分超时、密钥、地址格式还是返回内容异常。</li>
            </ul>
          </template>

          <template v-else-if="activeId === 'ai-naming'">
            <h3>AI 命名</h3>
            <p>AI 命名是专门的起名工作台，点主界面的“AI 命名”打开，用来给角色、地点、势力、物品等批量起名。</p>
            <ul>
              <li>先选类别，也可以自己输入类别，比如阵法、丹药、妖兽。</li>
              <li>填背景、风格、数量和字数；角色类还能补性别和种族。</li>
              <li>生成时会参考当前正文和大纲，并避开已经用过的名字。</li>
              <li>喜欢的名字可以收藏或复制；收藏和历史只属于当前项目，切项目不会串。</li>
            </ul>
          </template>

          <template v-else-if="activeId === 'plugins'">
            <h3>插件市场</h3>
            <p>插件市场是找别人做好的智能体和技能的地方，入口在设置页。</p>
            <ul>
              <li>输入关键词搜索 GitHub 仓库，可按智能体、技能筛选，也可按星标或更新时间排序。</li>
              <li>配置 GitHub Token 可以提高搜索配额；Token 只保存在本机。</li>
              <li>点安装后，内容会进入智能体或技能列表，装完可以先点“测试”确认能不能用。</li>
              <li>第三方内容质量不一，先拿小任务试跑，确认符合预期再放进正式流水线。</li>
            </ul>
          </template>

          <template v-else-if="activeId === 'windows'">
            <h3>多窗口</h3>
            <p>多窗口用来同时开几个项目。比如一个窗口写主项目，另一个窗口开参考项目查资料，不用来回切换。</p>
            <ul>
              <li>点顶栏“窗口”菜单，选“新建窗口”。</li>
              <li>项目列表里也有“新窗口”按钮，或在窗口菜单里选“在新窗口打开当前项目”。</li>
              <li>同一个项目不允许同时开两个窗口。这是防止两份内容互相覆盖，不是故障。</li>
              <li>供应商、技能、智能体是全局共享的：A 窗口改了技能，B 窗口也会用新版本。</li>
              <li>每个窗口的位置和大小会自动记住，下次打开还在原位。</li>
              <li>想避免内容冲突，就不要在两个窗口里改同一个章节。</li>
            </ul>
          </template>

          <template v-else-if="activeId === 'appearance'">
            <h3>外观设置</h3>
            <p>外观设置在设置页里，管的是“应用看起来舒不舒服”和“多久自动保存一次”。</p>
            <ul>
              <li>主题有亮色、深色两档。</li>
              <li>界面密度有默认、舒适、紧凑三档。舒适更透气，紧凑能在同屏放下更多内容。</li>
              <li>界面字体影响菜单、面板和弹窗；编辑器字体只影响编辑区。内置霞鹜文楷、思源宋体、思源黑体，也支持楷体、宋体等系统字体。</li>
              <li>字体大小改完即生效；点“保存外观设置”后下次打开仍保持。</li>
              <li>自动保存间隔也可在这里调。数值越小，断电丢失的内容越少。</li>
            </ul>
          </template>

          <template v-else>
            <h3>数据与诊断</h3>
            <p>这一节管“东西存在哪、坏了怎么查”。项目数据保存在本机，重要节点要记得导出备份。</p>
            <dl>
              <dt>自动保存</dt><dd>应用按设置里的间隔自动写盘。退出时会先保存，保存失败会明确提示。</dd>
              <dt>导入导出</dt><dd>合并导入更安全，覆盖导入会替换现有数据，只应在备份充分时使用。</dd>
              <dt>崩溃恢复</dt><dd>窗口页面异常退出时会出现提示横幅。看到横幅先检查刚才写的内容，再继续操作。</dd>
              <dt>数据目录</dt><dd>外观设置里可查看并打开数据目录，也能导出全部数据备份。</dd>
              <dt>诊断日志</dt><dd>记录请求用途、供应商、模型、耗时、错误和 token 用量，可筛选、搜索、导出。</dd>
            </dl>
            <h4>出问题时的检查顺序</h4>
            <ol>
              <li>先看界面上有没有错误提示或崩溃恢复横幅。</li>
              <li>再打开诊断日志，按错误级别筛选，记下报错时间。</li>
              <li>接口类问题优先检查地址、密钥、模型权限和网络。</li>
              <li>仍处理不了就导出日志和项目备份，交给排查的人。</li>
            </ol>
          </template>
        </article>
      </div>

      <footer class="help-footer">
        <span>建议从“快速上手”开始，遇到具体板块再查阅对应章节。</span>
        <button type="button" @click="close">开始使用</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useModalQueue } from '../../composables/useModalQueue'

const visible = ref(false)
const activeId = ref('start')
const modalQueue = useModalQueue()

const sections = [
  { id: 'start', title: '快速上手' },
  { id: 'main', title: '主界面' },
  { id: 'outline', title: '大纲工作台' },
  { id: 'pipeline', title: '生成流水线' },
  { id: 'skills', title: '技能与 Folder SKILL' },
  { id: 'memory', title: '记忆板块' },
  { id: 'ai', title: 'AI 与配置' },
  { id: 'ai-naming', title: 'AI 命名' },
  { id: 'plugins', title: '插件市场' },
  { id: 'windows', title: '多窗口' },
  { id: 'appearance', title: '外观设置' },
  { id: 'deai', title: '去AI味' },
  { id: 'data', title: '数据与诊断' }
]

const activeSection = computed(() => sections.find(item => item.id === activeId.value))

function open() {
  visible.value = true
  modalQueue.open('help-guide')
}

function close() {
  visible.value = false
  modalQueue.close('help-guide')
}

onMounted(() => {
  window.electronAPI?.onOpenHelpGuide?.(() => {
    activeId.value = 'start'
    open()
  })
})

defineExpose({ open, activeSection })
</script>

<style scoped>
.help-overlay {
  position: fixed;
  inset: 0;
  z-index: 2200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
  background: var(--bg-overlay, rgba(0, 0, 0, 0.55));
}

.help-modal {
  width: min(1080px, 100%);
  max-height: min(820px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xl);
}

.help-header,
.help-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  padding: 1var(--space-4) 2var(--space-1);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.help-footer {
  justify-content: space-between;
  border-top: 1px solid var(--border-color);
  border-bottom: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.help-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
  line-height: 1.3;
}

.help-header p {
  margin: var(--space-2) 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.help-close {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.help-close:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.help-layout {
  display: grid;
  grid-template-columns: 198px minmax(0, 1fr);
  min-height: 0;
  flex: 1;
}

.help-nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  overflow-y: auto;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.help-nav button {
  min-height: 34px;
  padding: var(--space-4) var(--space-5);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  font-size: 13px;
  cursor: pointer;
}

.help-nav button:hover,
.help-nav button.active {
  color: var(--accent);
  background: var(--bg-hover);
}

.help-nav button.active {
  font-weight: 650;
}

.help-content {
  min-width: 0;
  padding: var(--space-8) 2var(--space-4) 2var(--space-4);
  overflow-y: auto;
  color: var(--text-primary);
}

.help-content h3 {
  margin: 0 0 var(--space-5);
  font-size: 19px;
  line-height: 1.3;
}

.help-content h4 {
  margin: var(--space-7) 0 var(--space-4);
  font-size: 15px;
}

.help-content p {
  margin: 0 0 var(--space-5);
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.help-content strong {
  color: var(--text-primary);
}

.help-content ul,
.help-content ol {
  margin: 0 0 var(--space-5);
  padding-left: 20px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.75;
}

.help-content dl {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: var(--space-4) var(--space-5);
  margin: 0 0 var(--space-5);
}

.help-content dt {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 650;
}

.help-content dd {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.help-footer button {
  min-width: 84px;
  height: 32px;
  padding: 0 var(--space-5);
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--text-on-accent);
  font-size: 13px;
  cursor: pointer;
}

.help-footer button:hover {
  filter: brightness(1.08);
}

@media (max-width: 760px) {
  .help-overlay {
    padding: var(--space-5);
  }

  .help-modal {
    max-height: calc(100vh - 20px);
  }

  .help-header,
  .help-footer {
    padding: var(--space-5);
  }

  .help-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .help-nav {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
  }

  .help-nav button {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .help-content {
    padding: 1var(--space-4);
  }

  .help-content dl {
    grid-template-columns: 1fr;
  }

  .help-footer span {
    display: none;
  }
}
</style>

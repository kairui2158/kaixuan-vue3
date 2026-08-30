<template>
  <div v-if="visible" class="help-overlay" @click.self="close">
    <section class="help-modal" role="dialog" aria-modal="true" aria-label="应用教学指南">
      <header class="help-header">
        <div>
          <h2>应用教学指南</h2>
          <p>按创作顺序阅读，就能理解每个板块在整条工作流里的位置。</p>
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
            <p>神意助手的推荐创作顺序是：准备素材 → 编写或共创大纲 → 生成设定 → 生成卷纲 → 生成章节 → 生成正文 → 审核记忆 → 导出作品。</p>
            <ol>
              <li>在主界面创建或打开项目，先在大纲工作台准备一条可执行的大纲。</li>
              <li>打开生成流水线，从大纲层逐层推进，检查每一层结果后再进入下一层。</li>
              <li>为不同层级选择合适的智能体、技能和执行模式，不要在信息不足时直接跳到正文。</li>
              <li>正文确认后进入记忆管理，审核新增记忆，保证后续章节能继续使用已确立的事实。</li>
              <li>定期保存项目，必要时导出备份。</li>
            </ol>
          </template>

          <template v-else-if="activeId === 'main'">
            <h3>主界面</h3>
            <p>主界面由章节树、中间编辑器和右侧对话框组成，适合阅读、修改和管理当前项目。</p>
            <dl>
              <dt>章节树</dt><dd>展示卷、章节、卷纲纲要入口和章节概要入口。点击章节会打开正文标签；点击纲要或概要按钮会把对应内容同步到编辑器。</dd>
              <dt>中间编辑器</dt><dd>编辑正文、卷纲纲要或章节概要。顶部工具负责保存、导出、撤销、重做和 AI 操作。</dd>
              <dt>右侧对话框</dt><dd>围绕当前编辑内容进行提问、生成和共创。同步特定技能或智能体后，对话会优先使用当前上下文。</dd>
              <dt>状态栏</dt><dd>显示连接状态、当前模型、活动标签和字数，可用于快速确认当前工作对象。</dd>
            </dl>
          </template>

          <template v-else-if="activeId === 'outline'">
            <h3>大纲工作台</h3>
            <p>大纲工作台是进入流水线前的创作区，用来准备、修改和确认整部作品的大纲。</p>
            <h4>你可以做什么</h4>
            <ul>
              <li>直接编辑大纲文本，包括输入、删除、复制、粘贴、撤销和重做。</li>
              <li>从文件导入大纲，或把当前大纲保存到本地。</li>
              <li>与 AI 讨论情节、结构、伏笔、人物动机和分卷方向。</li>
              <li>把 AI 回复插入光标位置，或替换指定范围的大纲内容。</li>
              <li>确认大纲并锁定进入创作，让后续流水线使用稳定版本。</li>
            </ul>
            <p><strong>建议：</strong>进入生成流水线前，先检查主线目标、分卷边界、主要冲突和结局方向是否已经清楚。</p>
          </template>

          <template v-else-if="activeId === 'pipeline'">
            <h3>生成流水线</h3>
            <p>生成流水线把大纲逐步加工成可写正文的结构化结果，每一层完成后都会成为下一层的输入。</p>
            <dl>
              <dt>大纲层</dt><dd>确认作品规模、主线走向和大纲信息，是整条流水线的起点。</dd>
              <dt>设定层</dt><dd>从大纲提取世界观、角色、势力、物品等设定，并支持继续补充和绑定。</dd>
              <dt>卷纲层</dt><dd>根据卷数分配叙事阶段、卷级目标和章节方向。</dd>
              <dt>章节层</dt><dd>把卷纲拆成具体章节标题、剧情点和章节概要。</dd>
              <dt>正文层</dt><dd>根据章节执行信息生成正文，并进入主编辑器继续打磨。</dd>
            </dl>
            <p>每层顶部的控制区用于选择本层智能体、技能和执行模式。生成过程中可以查看进度，生成完成后应检查结果，再进入下一层。</p>
          </template>

          <template v-else-if="activeId === 'memory'">
            <h3>记忆板块</h3>
            <p>记忆板块保存已经确认的人物、事件、关系、规则和状态变化，帮助后续创作保持一致性。</p>
            <ul>
              <li>生成或编辑正文后，可以把相关事实提交到记忆审核。</li>
              <li>审核通过的信息会进入项目记忆，供检索和后续生成参考。</li>
              <li>四视图用于从关系、图谱、思维导图和时间线角度检查记忆结构。</li>
              <li>导入 JSON 时优先使用合并模式；覆盖导入会替换现有数据，必须确认后再使用。</li>
              <li>导出 JSON 和角色卡可用于备份或迁移。</li>
            </ul>
          </template>

          <template v-else-if="activeId === 'ai'">
            <h3>AI 与配置</h3>
            <p>AI 能力由供应商、模型、智能体和技能共同决定。配置正确时，不同任务可以走不同通道。</p>
            <dl>
              <dt>供应商</dt><dd>保存接口地址、密钥、模型列表和用途。生成、验证、检测等用途可以分别指定不同供应商。</dd>
              <dt>智能体</dt><dd>控制模型、温度、输出上限和系统指令，影响表达风格和稳定性。</dd>
              <dt>技能</dt><dd>提供具体任务指令。技能可以绑定智能体，按步骤处理大纲、设定、卷纲、章节或正文。</dd>
              <dt>执行模式</dt><dd>串行适合按步骤传递结果；组合适合把多个指令合并成一次调用。选择模式时应看技能说明，不要只看数量。</dd>
            </dl>
            <p><strong>排查顺序：</strong>先检查供应商是否启用，再检查模型是否能获取，然后确认任务用途、技能和智能体绑定。</p>
          </template>

          <template v-else-if="activeId === 'deai'">
            <h3>去AI味</h3>
            <p>去AI味用于改写机械感表达，同时保留事实、场景和人物状态。改写后应重点检查对话、动作和信息是否被误改。</p>
            <ul>
              <li>选择与任务匹配的模式，不要为了速度把需要多步推演的文本压缩成一次处理。</li>
              <li>验证用途建议使用独立供应商或更稳定的模型。</li>
              <li>处理失败时查看诊断日志，确认是超时、密钥、地址格式还是返回内容异常。</li>
            </ul>
          </template>

          <template v-else>
            <h3>数据与诊断</h3>
            <p>项目数据保存在本机，重要节点应导出备份。遇到按钮无响应、生成失败或界面异常时，优先查看诊断日志。</p>
            <dl>
              <dt>保存与恢复</dt><dd>项目会写入本地数据目录；重新打开应用后应确认章节和记忆是否完整。</dd>
              <dt>导入导出</dt><dd>导入前先确认模式。合并导入更安全，覆盖导入只应在备份充分时使用。</dd>
              <dt>诊断日志</dt><dd>记录请求用途、供应商、模型、耗时、错误和 token 用量。报错时尽量带上时间点。</dd>
              <dt>常见问题</dt><dd>接口失败多与地址后缀、密钥、模型权限或超时有关；界面异常可先重置缩放或重启应用。</dd>
            </dl>
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

const visible = ref(false)
const activeId = ref('start')

const sections = [
  { id: 'start', title: '快速上手' },
  { id: 'main', title: '主界面' },
  { id: 'outline', title: '大纲工作台' },
  { id: 'pipeline', title: '生成流水线' },
  { id: 'memory', title: '记忆板块' },
  { id: 'ai', title: 'AI 与配置' },
  { id: 'deai', title: '去AI味' },
  { id: 'data', title: '数据与诊断' }
]

const activeSection = computed(() => sections.find(item => item.id === activeId.value))

function open() {
  visible.value = true
}

function close() {
  visible.value = false
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
  padding: 24px;
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
  border-radius: 10px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
}

.help-header,
.help-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
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
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.help-close {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border: 1px solid var(--border-color);
  border-radius: 7px;
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
  gap: 3px;
  padding: 12px;
  overflow-y: auto;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.help-nav button {
  min-height: 34px;
  padding: 8px 11px;
  border: 0;
  border-radius: 7px;
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
  padding: 24px 28px 28px;
  overflow-y: auto;
  color: var(--text-primary);
}

.help-content h3 {
  margin: 0 0 14px;
  font-size: 19px;
  line-height: 1.3;
}

.help-content h4 {
  margin: 20px 0 8px;
  font-size: 15px;
}

.help-content p {
  margin: 0 0 12px;
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
  margin: 0 0 14px;
  padding-left: 20px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.75;
}

.help-content dl {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 8px 14px;
  margin: 0 0 12px;
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
  padding: 0 14px;
  border: 0;
  border-radius: 7px;
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
    padding: 10px;
  }

  .help-modal {
    max-height: calc(100vh - 20px);
  }

  .help-header,
  .help-footer {
    padding: 14px;
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
    padding: 18px;
  }

  .help-content dl {
    grid-template-columns: 1fr;
  }

  .help-footer span {
    display: none;
  }
}
</style>

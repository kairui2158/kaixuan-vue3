import fs from 'fs'
import path from 'path'

const target = path.resolve('src/components/chat/ChatPanel.vue')
const file = `...`
fs.writeFileSync(target, file, 'utf8')
console.log('written', target, file.length)

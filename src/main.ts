import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/tokens.css'
import './styles/global.css'

import VueVirtualScroller from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(VueVirtualScroller)
app.mount('#app')

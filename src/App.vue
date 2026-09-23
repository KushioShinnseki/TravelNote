<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'

const { t, locale } = useI18n()

const systemTags = ['自然风光', '文化历史', '美食探索', '建筑空间', '慢节奏', '周末短途', '艺术展览', '朋友同行']
const tagClass = { 自然风光: 'green', 文化历史: 'blue', 建筑空间: 'blue', 慢节奏: 'green', 艺术展览: 'blue', 朋友同行: 'green' }
const emptyState = () => ({ profile: { home: '' }, destinations: [], plans: [], tagCatalog: [] })
const state = reactive(emptyState())
const account = ref(null)
const authenticated = ref(false)
const authMode = ref('login')
const authError = ref('')
const activeView = ref('destinations')
const activeFilter = ref('全部')
const searchTerm = ref('')
const mobileMenuOpen = ref(false)
const toastMessage = ref('')
const toastTimer = ref(null)
const showDestinationModal = ref(false)
const showPlanModal = ref(false)
const showPasswordModal = ref(false)
const showQrLightbox = ref(false)
const editingDestinationId = ref(null)
const editingPlanId = ref(null)
const qrText = ref('')
const qrCanvas = ref(null)
const qrLargeCanvas = ref(null)

const loginForm = reactive({ username: '', password: '' })
const registerForm = reactive({ username: '', password: '', confirmPassword: '' })
const passwordForm = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const destinationForm = reactive({ name: '', region: '', location: '', transport: '', arrangement: '', note: '', tags: [] })
const planForm = reactive({ date: '', time: '09:00', destinationId: '', otherDestination: '', activity: '', note: '' })

const navItems = computed(() => [
  { id: 'destinations', icon: '✦', label: t('inspiration'), count: state.destinations.length },
  { id: 'plans', icon: '▣', label: t('plans'), count: state.plans.length },
  { id: 'exchange', icon: '↗', label: t('exchange') },
  { id: 'tags', icon: '#', label: t('tags'), count: state.tagCatalog.length }
])
const pageTitle = computed(() => ({ destinations: t('inspiration'), plans: t('plans'), exchange: t('exchange'), tags: t('tags') }[activeView.value]))
const filteredDestinations = computed(() => state.destinations.filter(item => {
  const haystack = [item.name, item.region, item.location, ...(item.tags || [])].join(' ').toLowerCase()
  return (!searchTerm.value || haystack.includes(searchTerm.value.toLowerCase())) &&
    (activeFilter.value === '全部' || (item.tags || []).includes(activeFilter.value) || item.status === activeFilter.value)
}))
const sortedPlans = computed(() => [...state.plans].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)))
const upcomingPlans = computed(() => sortedPlans.value.slice(0, 3))
const usedTagCount = computed(() => new Set(state.destinations.flatMap(item => item.tags || [])).size)
const accountAvatar = computed(() => Array.from(String(account.value?.username || '--').trim() || '--').slice(0, 2).join(''))
const localeOptions = computed(() => [
  { value: 'zh', label: t('chinese') },
  { value: 'en', label: t('english') },
  { value: 'ja', label: t('japanese') }
])

function normalizeState(saved = {}) {
  const destinations = (Array.isArray(saved.destinations) ? saved.destinations : []).map(item => ({
    ...item, arrangement: item.arrangement || '', note: item.note || '', transport: item.transport || '', tags: Array.isArray(item.tags) ? item.tags : []
  }))
  return {
    profile: { home: '', ...(saved.profile || {}) },
    destinations,
    plans: (Array.isArray(saved.plans) ? saved.plans : []).map(item => ({ ...item, destinationId: item.destinationId || '', otherDestination: item.otherDestination || '', activity: item.activity || '', note: item.note || '' })),
    tagCatalog: [...new Set([...(Array.isArray(saved.tagCatalog) ? saved.tagCatalog : []), ...systemTags, ...destinations.flatMap(item => item.tags || [])])]
  }
}

function replaceState(next) {
  const normalized = normalizeState(next)
  state.profile = normalized.profile
  state.destinations = normalized.destinations
  state.plans = normalized.plans
  state.tagCatalog = normalized.tagCatalog
}

function packet() {
  return { format: 'travelnote', version: 3, accountId: String(account.value?.id || ''), exportedAt: new Date().toISOString(), profile: state.profile, tagCatalog: state.tagCatalog, destinations: state.destinations, plans: state.plans }
}

function encodePacket(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return `TN1.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

function storageKey() { return `travelnote-state-v1-${account.value?.id || ''}` }
function persistLocal() { if (account.value) localStorage.setItem(storageKey(), JSON.stringify(state)) }
function cloneState() { return JSON.parse(JSON.stringify({ profile: state.profile, destinations: state.destinations, plans: state.plans, tagCatalog: state.tagCatalog })) }
function showToast(message) {
  toastMessage.value = message
  clearTimeout(toastTimer.value)
  toastTimer.value = setTimeout(() => { toastMessage.value = '' }, 2600)
}

async function apiRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !headers['Idempotency-Key']) headers['Idempotency-Key'] = crypto.randomUUID?.() || `tn-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`)
  return body
}

async function loadWorkspace() {
  const remote = await apiRequest('/api/workspace')
  const legacy = localStorage.getItem('travelnote-state-v1')
  const hasAccountLocal = Boolean(localStorage.getItem(storageKey()))
  if (!remote.destinations?.length && !remote.plans?.length && !hasAccountLocal && legacy) {
    try {
      replaceState(JSON.parse(legacy))
      await syncWorkspace()
      localStorage.removeItem('travelnote-state-v1')
      return
    } catch {
      replaceState(remote)
    }
  }
  replaceState(remote)
  persistLocal()
}

async function syncWorkspace() {
  const remote = await apiRequest('/api/workspace', { method: 'PUT', body: JSON.stringify(packet()) })
  replaceState(remote)
  persistLocal()
  await refreshQr()
}

async function commitWorkspace(mutator, message) {
  const previous = cloneState()
  mutator()
  try { await syncWorkspace(); showToast(message) } catch (error) { replaceState(previous); showToast(error.message) }
}

async function bootstrap() {
  try {
    const data = await apiRequest('/api/auth/me')
    account.value = data.account
    authenticated.value = true
    await loadWorkspace()
  } catch { authenticated.value = false }
}

async function login() {
  authError.value = ''
  try {
    const data = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(loginForm) })
    account.value = data.account
    authenticated.value = true
    await loadWorkspace()
  } catch (error) { authError.value = error.message || t('loginFailed') }
}

async function register() {
  authError.value = ''
  if (registerForm.password !== registerForm.confirmPassword) { authError.value = t('passwordMismatch'); return }
  try {
    const data = await apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify({ username: registerForm.username, password: registerForm.password }) })
    account.value = data.account
    authenticated.value = true
    replaceState(emptyState())
    await syncWorkspace()
    showToast(t('registerSuccess'))
  } catch (error) { authError.value = error.message || t('registerFailed') }
}

async function logout() {
  try { await apiRequest('/api/auth/logout', { method: 'POST', body: '{}' }) } catch { /* local reset still logs out */ }
  authenticated.value = false
  account.value = null
  replaceState(emptyState())
}

async function changePassword() {
  authError.value = ''
  if (passwordForm.newPassword !== passwordForm.confirmPassword) { authError.value = t('passwordMismatch'); return }
  try {
    await apiRequest('/api/auth/change-password', { method: 'POST', body: JSON.stringify(passwordForm) })
    showPasswordModal.value = false
    Object.assign(passwordForm, { currentPassword: '', newPassword: '', confirmPassword: '' })
    showToast(t('passwordChanged'))
  } catch (error) { authError.value = error.message || t('passwordError') }
}

function chooseView(view) { activeView.value = view; mobileMenuOpen.value = false }
function statusClass(status) { return status === '已出发' ? 'dot-green' : status === '已计划' ? 'dot-blue' : 'dot-coral' }
function statusLabel(status) { return status === '已出发' ? t('departed') : status === '已计划' ? t('planned') : t('want') }
function tagTone(tag) { return tagClass[tag] || '' }
function formatDate(date) { const d = new Date(`${date}T00:00:00`); return locale.value === 'en' ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : locale.value === 'ja' ? d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) : `${d.getMonth() + 1}月${d.getDate()}日` }
function formatWeek(date) { const d = new Date(`${date}T00:00:00`); return d.toLocaleDateString(locale.value === 'en' ? 'en-US' : locale.value === 'ja' ? 'ja-JP' : 'zh-CN', { weekday: 'short' }) }
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])) }
function markdownInline(value = '') {
  let html = escapeHtml(value); const links = []
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => { const token = `\u0000LINK${links.length}\u0000`; links.push(`<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`); return token })
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/_([^_]+)_/g, '<em>$1</em>')
  return html.replace(/\u0000LINK(\d+)\u0000/g, (_, index) => links[Number(index)])
}
function markdownHtml(value = '') {
  const output = []; let listOpen = false
  const closeList = () => { if (listOpen) { output.push('</ul>'); listOpen = false } }
  String(value).replace(/\r\n?/g, '\n').split('\n').forEach(line => {
    if (!line.trim()) { closeList(); return }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/); const bullet = line.match(/^\s*[-*+]\s+(.+)$/)
    if (heading) { closeList(); output.push(`<h${Math.min(heading[1].length, 4)}>${markdownInline(heading[2])}</h${Math.min(heading[1].length, 4)}>`); return }
    if (bullet) { if (!listOpen) { output.push('<ul>'); listOpen = true } output.push(`<li>${markdownInline(bullet[1])}</li>`); return }
    closeList(); output.push(`<p>${markdownInline(line)}</p>`)
  }); closeList(); return `<div class="markdown-body">${output.join('')}</div>`
}

function openDestination(id = null) {
  editingDestinationId.value = id
  const item = state.destinations.find(x => x.id === id)
  Object.assign(destinationForm, { name: item?.name || '', region: item?.region || '', location: item?.location || '', transport: item?.transport || '', arrangement: item?.arrangement || '', note: item?.note || '', tags: [...(item?.tags || [])] })
  showDestinationModal.value = true
}
async function saveDestination() {
  if (!destinationForm.name.trim()) return
  const id = editingDestinationId.value || `destination-${crypto.randomUUID?.() || Date.now()}`
  const value = { id, name: destinationForm.name.trim(), region: destinationForm.region.trim(), location: destinationForm.location.trim(), transport: destinationForm.transport.trim(), arrangement: destinationForm.arrangement.trim(), note: destinationForm.note, tags: [...destinationForm.tags], status: state.destinations.find(x => x.id === id)?.status || '想去' }
  await commitWorkspace(() => { const index = state.destinations.findIndex(x => x.id === id); if (index >= 0) state.destinations[index] = value; else state.destinations.push(value) }, t(editingDestinationId.value ? 'destinationUpdated' : 'destinationAdded'))
  showDestinationModal.value = false
}
async function deleteDestination(item) {
  if (!confirm(t('confirmDeleteDestination', { name: item.name }))) return
  await commitWorkspace(() => { state.destinations = state.destinations.filter(x => x.id !== item.id) }, t('destinationDeleted'))
}
function toggleDestinationTag(tag) { destinationForm.tags = destinationForm.tags.includes(tag) ? destinationForm.tags.filter(x => x !== tag) : [...destinationForm.tags, tag] }

function openPlan(id = null) {
  editingPlanId.value = id
  const item = state.plans.find(x => x.id === id)
  Object.assign(planForm, { date: item?.date || new Date().toISOString().slice(0, 10), time: item?.time || '09:00', destinationId: item?.destinationId || '', otherDestination: item?.otherDestination || (!item?.destinationId ? item?.destination || '' : ''), activity: item?.activity || '', note: item?.note || '' })
  showPlanModal.value = true
}
async function savePlan() {
  const selected = state.destinations.find(x => x.id === planForm.destinationId)
  const destination = selected ? `${selected.name}${selected.location ? ` · ${selected.location}` : ''}` : planForm.otherDestination.trim()
  if (!destination || !planForm.date || !planForm.activity.trim()) return
  const id = editingPlanId.value || `plan-${crypto.randomUUID?.() || Date.now()}`
  const value = { id, date: planForm.date, time: planForm.time || '09:00', destinationId: selected?.id || '', otherDestination: selected ? '' : planForm.otherDestination.trim(), destination, activity: planForm.activity.trim(), note: planForm.note }
  await commitWorkspace(() => { const index = state.plans.findIndex(x => x.id === id); if (index >= 0) state.plans[index] = value; else state.plans.push(value) }, t(editingPlanId.value ? 'planUpdated' : 'planAdded'))
  showPlanModal.value = false
}
async function deletePlan(item) {
  if (!confirm(t('confirmDeletePlan', { name: item.destination }))) return
  await commitWorkspace(() => { state.plans = state.plans.filter(x => x.id !== item.id) }, t('planDeleted'))
}

async function addTag() {
  const input = document.querySelector('#new-tag')
  const tag = input?.value.trim()
  if (!tag || state.tagCatalog.includes(tag)) return
  await commitWorkspace(() => state.tagCatalog.push(tag), t('tagAdded', { tag }))
  if (input) input.value = ''
}
async function deleteTag(tag) {
  if (systemTags.includes(tag) || !confirm(t('confirmDeleteTag', { tag }))) return
  await commitWorkspace(() => { state.tagCatalog = state.tagCatalog.filter(x => x !== tag); state.destinations.forEach(item => { item.tags = (item.tags || []).filter(x => x !== tag) }) }, t('tagDeleted', { tag }))
}
async function editHome() {
  const value = prompt(t('departurePrompt'), state.profile.home || '')
  if (value === null) return
  await commitWorkspace(() => { state.profile.home = value.trim() }, t('departureUpdated'))
}

function downloadBackup() { const blob = new Blob([JSON.stringify(packet(), null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `travelnote-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); showToast(t('download')) }
async function copyPacket() { try { await navigator.clipboard.writeText(encodePacket(packet())); showToast(t('copy')) } catch { showToast(t('invalidPacket')) } }
async function handleImport(event) {
  const file = event.target.files?.[0]; if (!file) return
  try {
    const data = JSON.parse(await file.text())
    if (data.format !== 'travelnote' || !Array.isArray(data.destinations) || !Array.isArray(data.plans)) throw new Error('invalid')
    if (data.accountId && String(data.accountId) !== String(account.value?.id)) throw new Error('account')
    const previous = cloneState(); replaceState(data)
    try { await syncWorkspace(); showToast(t('importSuccess')) } catch (error) { replaceState(previous); throw error }
  } catch (error) { showToast(error.message === 'account' ? t('accountMismatch') : t('invalidPacket')) }
  event.target.value = ''
}
async function refreshQr() {
  if (activeView.value !== 'exchange') return
  qrText.value = encodePacket(packet())
  await nextTick()
  for (const [canvas, width] of [[qrCanvas.value, 512], [qrLargeCanvas.value, 768]]) if (canvas && (showQrLightbox.value || canvas === qrCanvas.value)) {
    try { await QRCode.toCanvas(canvas, qrText.value, { width, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#14373b', light: '#fffdf9' } }) } catch { showToast(t('qrFailed')) }
  }
}
function openQr() { showQrLightbox.value = true; nextTick(refreshQr) }
function setLocale(value) { locale.value = value; localStorage.setItem('travelnote-locale', value); document.documentElement.lang = value === 'zh' ? 'zh-CN' : value }
function noteLabel(noteRef) { return noteRef ? t('noteCollapse') : t('noteExpand') }

watch(activeView, () => { nextTick(refreshQr) })
onMounted(() => { document.documentElement.lang = locale.value === 'zh' ? 'zh-CN' : locale.value; bootstrap() })
</script>

<template>
  <div v-if="!authenticated" class="auth-gate">
    <section class="auth-card">
      <div class="brand-mark auth-brand"><span class="brand-dot"></span><span>Travel<span>Note</span></span></div>
      <span class="eyebrow">Private travel workspace</span>
      <h1>{{ authMode === 'register' ? t('register') : t('login') }}</h1>
      <p>{{ authMode === 'register' ? t('registerDescription') : t('loginDescription') }}</p>
      <form v-if="authMode === 'login'" @submit.prevent="login">
        <label>{{ t('username') }}<input v-model="loginForm.username" autocomplete="username" required :placeholder="t('username')" /></label>
        <label>{{ t('password') }}<input v-model="loginForm.password" type="password" autocomplete="current-password" required :placeholder="t('password')" /></label>
        <div class="login-error" role="alert">{{ authError }}</div>
        <button class="primary-button" type="submit">{{ t('loginButton') }}</button>
      </form>
      <form v-else @submit.prevent="register">
        <label>{{ t('username') }}<input v-model="registerForm.username" autocomplete="username" minlength="3" maxlength="120" required /></label>
        <label>{{ t('password') }}<input v-model="registerForm.password" type="password" autocomplete="new-password" minlength="8" maxlength="200" required /></label>
        <label>{{ t('confirmPassword') }}<input v-model="registerForm.confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="200" required /></label>
        <div class="login-error" role="alert">{{ authError }}</div>
        <button class="primary-button" type="submit">{{ t('registerButton') }}</button>
      </form>
      <button class="auth-switch" type="button" @click="authMode = authMode === 'login' ? 'register' : 'login'; authError = ''">{{ authMode === 'login' ? t('switchRegister') : t('switchLogin') }}</button>
    </section>
  </div>

  <div v-else class="app-shell" :class="{ 'menu-open': mobileMenuOpen }">
    <aside class="sidebar" aria-label="主导航">
      <div class="brand-mark"><span class="brand-dot"></span><span>Travel<span>Note</span></span></div>
      <div class="workspace-switcher"><div class="workspace-avatar">{{ accountAvatar }}</div><div><strong>{{ t('workspace') }}</strong><small>{{ t('personalSpace') }}</small></div><span class="chevron">⌄</span></div>
      <div class="sidebar-label">{{ t('workspaceLabel') }}</div>
      <nav class="main-nav"><button v-for="item in navItems" :key="item.id" class="nav-item" :class="{ active: activeView === item.id }" @click="chooseView(item.id)"><span class="nav-icon">{{ item.icon }}</span><span>{{ item.label }}</span><b v-if="item.count !== undefined">{{ String(item.count).padStart(2, '0') }}</b></button></nav>
      <div class="sidebar-label">{{ t('quickFilter') }}</div>
      <div class="quick-filters"><button class="quick-filter" @click="activeFilter = '想去'; chooseView('destinations')"><i class="dot dot-coral"></i>{{ t('want') }} <span>{{ state.destinations.filter(x => x.status === '想去').length }}</span></button><button class="quick-filter" @click="activeFilter = '已计划'; chooseView('destinations')"><i class="dot dot-blue"></i>{{ t('planned') }} <span>{{ state.destinations.filter(x => x.status === '已计划').length }}</span></button><button class="quick-filter" @click="activeFilter = '已出发'; chooseView('destinations')"><i class="dot dot-green"></i>{{ t('departed') }} <span>{{ state.destinations.filter(x => x.status === '已出发').length }}</span></button></div>
      <div class="sidebar-bottom"><div class="offline-pill"><span class="offline-dot"></span>{{ t('offline') }}</div><button class="settings-link" @click="showPasswordModal = true">⚙ {{ t('changePassword') }}</button><button class="settings-link" @click="logout">↪ {{ t('logout') }}</button></div>
    </aside>

    <main class="main-content">
      <header class="topbar"><button class="mobile-menu" @click="mobileMenuOpen = !mobileMenuOpen">☰</button><div class="breadcrumb"><span>{{ t('workspace') }}</span><i>/</i><strong>{{ pageTitle }}</strong></div><div class="topbar-actions"><select class="language-select" :value="locale" :aria-label="t('language')" @change="setLocale($event.target.value)"><option v-for="option in localeOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select><button class="mini-avatar" @click="logout" :aria-label="t('logout')">{{ accountAvatar }}</button></div></header>
      <div class="page-wrap">
        <section v-if="activeView === 'destinations'" class="view-section">
          <div class="page-heading"><div><span class="eyebrow">My travel notes</span><h1>{{ t('inspirationTitle') }}</h1><p>{{ t('inspirationIntro') }}</p></div><button class="primary-button" @click="openDestination()">＋ {{ t('addDestination') }}</button></div>
          <div class="stats-row"><div class="stat-card"><small>{{ t('destinations') }}</small><strong>{{ state.destinations.length }}</strong><span>{{ t('records') }}</span></div><div class="stat-card"><small>{{ t('plans') }}</small><strong>{{ state.plans.length }}</strong><span>{{ t('dates') }}</span></div><div class="stat-card"><small>{{ t('tags') }}</small><strong class="accent">{{ usedTagCount }}</strong><span>{{ t('reasons') }}</span></div></div>
          <div class="toolbar"><div class="search-wrap">⌕<input v-model="searchTerm" :placeholder="t('search')" /></div><select v-model="activeFilter" class="filter-select"><option value="全部">{{ t('allStatuses') }}</option><option value="想去">{{ t('want') }}</option><option value="已计划">{{ t('planned') }}</option><option value="已出发">{{ t('departed') }}</option></select></div>
          <div class="tag-filter-row"><button class="tag-filter" :class="{ active: activeFilter === '全部' }" @click="activeFilter = '全部'">{{ t('all') }}</button><button v-for="tag in state.tagCatalog" :key="tag" class="tag-filter" :class="{ active: activeFilter === tag }" @click="activeFilter = tag">{{ tag }}</button></div>
          <div class="destination-list"><article v-for="item in filteredDestinations" :key="item.id" class="destination-card"><div class="card-topline"><div class="card-pin" :class="tagTone(item.tags?.[0])">⌖</div><div class="card-actions"><button class="small-icon" @click="openDestination(item.id)">✎</button><button class="small-icon" @click="deleteDestination(item)">×</button></div></div><h3>{{ item.name }}</h3><div class="region">{{ item.region }}<span v-if="item.location"> · {{ item.location }}</span></div><div class="tag-list"><span v-for="tag in item.tags" :key="tag" class="tag" :class="tagTone(tag)">{{ tag }}</span></div><div class="transport-line"><span>⇢</span><span>{{ item.transport || t('defaultTransport') }}</span></div><div v-if="item.arrangement" class="transport-line"><span>▣</span><span>{{ item.arrangement }}</span></div><div v-if="item.note" class="note-block"><button class="note-toggle" @click="$event.currentTarget.nextElementSibling.hidden = !$event.currentTarget.nextElementSibling.hidden; $event.currentTarget.classList.toggle('expanded')">{{ t('viewNote') }} <span>{{ t('noteExpand') }}</span></button><div class="note-content" hidden v-html="markdownHtml(item.note)"></div></div><div class="card-footer"><span class="status-label"><i class="dot" :class="statusClass(item.status)"></i>{{ statusLabel(item.status) }}</span></div></article><div v-if="!filteredDestinations.length" class="empty-state"><strong>{{ t('noDestinations') }}</strong><span>{{ t('noDestinationsHint') }}</span></div></div>
        </section>

        <section v-else-if="activeView === 'plans'" class="view-section"><div class="plans-header"><div><span class="eyebrow">Your itinerary</span><h2>{{ t('itinerary') }}</h2><p>{{ t('itineraryIntro') }}</p></div><button class="primary-button" @click="openPlan()">＋ {{ t('addPlan') }}</button></div><div class="plan-list"><article v-for="plan in sortedPlans" :key="plan.id" class="plan-row"><div class="plan-date"><strong>{{ formatDate(plan.date) }}</strong><small>{{ formatWeek(plan.date) }}</small></div><div class="plan-main"><h3>{{ plan.destination }}</h3><p>{{ plan.activity }}</p><div v-if="plan.note" class="note-block"><button class="note-toggle" @click="$event.currentTarget.nextElementSibling.hidden = !$event.currentTarget.nextElementSibling.hidden; $event.currentTarget.classList.toggle('expanded')">{{ t('viewNote') }} <span>{{ t('noteExpand') }}</span></button><div class="note-content" hidden v-html="markdownHtml(plan.note)"></div></div></div><time>{{ plan.time }}</time><div class="plan-actions"><button class="small-icon" @click="openPlan(plan.id)">✎</button><button class="small-icon" @click="deletePlan(plan)">×</button></div></article><div v-if="!sortedPlans.length" class="empty-state"><strong>{{ t('noPlans') }}</strong><span>{{ t('noPlansHint') }}</span></div></div></section>

        <section v-else-if="activeView === 'exchange'" class="view-section"><div class="exchange-hero"><div><span class="eyebrow">Offline handoff</span><h2>{{ t('exchangeTitle') }}</h2><p>{{ t('exchangeIntro') }}</p></div><span class="hero-symbol">↗</span></div><div class="exchange-grid"><article class="exchange-card"><h3>{{ t('generateQr') }}</h3><p>{{ t('qrHint') }}</p><div class="qr-stage"><button class="qr-button" @click="openQr"><canvas ref="qrCanvas" width="512" height="512"></canvas></button></div><div class="data-code">{{ qrText.slice(0, 120) }}…</div><button class="secondary-button" @click="copyPacket">{{ t('copy') }}</button></article><article class="exchange-card"><h3>{{ t('exportImport') }}</h3><p>{{ t('exportHint') }}</p><label class="file-drop" for="import-file"><div><strong>{{ t('chooseJson') }}</strong><small>{{ t('jsonOnly') }}</small></div><input id="import-file" type="file" accept="application/json,.json" @change="handleImport" /></label><button class="primary-button" @click="downloadBackup">{{ t('download') }}</button></article></div></section>

        <section v-else class="view-section"><div class="page-heading"><div><span class="eyebrow">Your tag library</span><h1>{{ t('tags') }}</h1><p>{{ t('tagIntro') }}</p></div></div><div class="tag-management-card"><div class="tag-management-intro"><div><h2>{{ t('addTag') }}</h2><p>{{ t('tagIntro') }}</p></div><div class="add-tag-row"><input id="new-tag" maxlength="64" :placeholder="t('tagPlaceholder')" @keyup.enter="addTag" /><button class="primary-button" @click="addTag">＋ {{ t('addTag') }}</button></div></div><div class="tag-library"><div v-for="tag in state.tagCatalog" :key="tag" class="tag-library-item"><div><span class="tag" :class="tagTone(tag)">{{ tag }}</span><small>{{ state.destinations.filter(item => item.tags?.includes(tag)).length }} {{ t('used') }}</small></div><button v-if="!systemTags.includes(tag)" class="small-icon" @click="deleteTag(tag)">×</button><span v-else class="tag-system">{{ t('system') }}</span></div></div></div></section>
      </div>
    </main>

    <aside class="right-rail"><div class="rail-topline"><span>{{ t('next') }}</span><button @click="openPlan()">{{ t('newPlan') }}</button></div><div class="timeline"><div v-for="plan in upcomingPlans" :key="plan.id" class="timeline-item"><div class="time">{{ plan.time }}</div><i class="event-dot"></i><div class="event-card"><strong>{{ plan.destination }}</strong><span>{{ plan.activity }}</span><div v-if="plan.note" class="sidebar-note"><button class="note-toggle" @click="$event.currentTarget.nextElementSibling.hidden = !$event.currentTarget.nextElementSibling.hidden; $event.currentTarget.classList.toggle('expanded')">{{ t('viewNote') }} <span>{{ t('noteExpand') }}</span></button><div class="note-content" hidden v-html="markdownHtml(plan.note)"></div></div></div></div><div v-if="!upcomingPlans.length" class="empty-state">{{ t('noUpcoming') }}</div></div><div class="rail-divider"></div><div class="rail-section-title"><span>{{ t('home') }}</span><button @click="editHome">{{ t('homeEdit') }}</button></div><div class="home-card"><div class="home-pin">⌖</div><div><strong>{{ state.profile.home || '—' }}</strong><small>{{ t('homeHint') }}</small></div></div></aside>
  </div>

  <div v-if="showDestinationModal" class="modal-backdrop" @click.self="showDestinationModal = false"><section class="modal" role="dialog"><div class="modal-header"><div><span class="eyebrow">{{ t('travelReason') }}</span><h2>{{ editingDestinationId ? t('editDestinationTitle') : t('addDestinationTitle') }}</h2></div><button class="close-button" @click="showDestinationModal = false">×</button></div><form @submit.prevent="saveDestination"><div class="form-grid two-col"><label>{{ t('destinationName') }}<input v-model="destinationForm.name" required /></label><label>{{ t('region') }}<input v-model="destinationForm.region" required /></label></div><label>{{ t('location') }}<input v-model="destinationForm.location" /></label><div class="form-section-label">{{ t('why') }} <span>{{ t('multi') }}</span></div><div class="tag-picker"><button v-for="tag in state.tagCatalog" :key="tag" type="button" class="tag-choice" :class="{ selected: destinationForm.tags.includes(tag) }" @click="toggleDestinationTag(tag)">{{ tag }}</button></div><label>{{ t('transport') }}<textarea v-model="destinationForm.transport" rows="3"></textarea></label><label>{{ t('arrangement') }}<textarea v-model="destinationForm.arrangement" rows="3"></textarea></label><label>{{ t('note') }} <span class="field-hint">{{ t('markdownHint') }}</span><textarea v-model="destinationForm.note" rows="5"></textarea></label><div class="modal-footer"><button type="button" class="text-button" @click="showDestinationModal = false">{{ t('cancel') }}</button><button class="primary-button">{{ t('save') }}</button></div></form></section></div>

  <div v-if="showPlanModal" class="modal-backdrop" @click.self="showPlanModal = false"><section class="modal small-modal" role="dialog"><div class="modal-header"><div><span class="eyebrow">{{ t('itinerary') }}</span><h2>{{ editingPlanId ? t('editPlanTitle') : t('addPlanTitle') }}</h2></div><button class="close-button" @click="showPlanModal = false">×</button></div><form @submit.prevent="savePlan"><div class="form-grid two-col"><label>{{ t('date') }}<input v-model="planForm.date" type="date" required /></label><label>{{ t('time') }}<input v-model="planForm.time" type="time" /></label></div><label>{{ t('chooseDestination') }}<select v-model="planForm.destinationId"><option value="">{{ t('noChoose') }}</option><option v-for="destination in state.destinations" :key="destination.id" :value="destination.id">{{ destination.name }} · {{ destination.region }}</option></select></label><label>{{ t('otherDestination') }}<input v-model="planForm.otherDestination" :placeholder="t('otherPlaceholder')" /></label><label>{{ t('activity') }}<textarea v-model="planForm.activity" rows="3" required></textarea></label><label>{{ t('note') }} <span class="field-hint">{{ t('markdownHint') }}</span><textarea v-model="planForm.note" rows="5"></textarea></label><div class="modal-footer"><button type="button" class="text-button" @click="showPlanModal = false">{{ t('cancel') }}</button><button class="primary-button">{{ editingPlanId ? t('savePlan') : t('joinPlan') }}</button></div></form></section></div>

  <div v-if="showPasswordModal" class="modal-backdrop" @click.self="showPasswordModal = false"><section class="modal small-modal" role="dialog"><div class="modal-header"><div><span class="eyebrow">Account security</span><h2>{{ t('changePassword') }}</h2></div><button class="close-button" @click="showPasswordModal = false">×</button></div><form @submit.prevent="changePassword"><label>{{ t('currentPassword') }}<input v-model="passwordForm.currentPassword" type="password" required /></label><label>{{ t('newPassword') }}<input v-model="passwordForm.newPassword" type="password" minlength="8" required /></label><label>{{ t('confirmPassword') }}<input v-model="passwordForm.confirmPassword" type="password" minlength="8" required /></label><div class="login-error">{{ authError }}</div><div class="modal-footer"><button type="button" class="text-button" @click="showPasswordModal = false">{{ t('cancel') }}</button><button class="primary-button">{{ t('savePassword') }}</button></div></form></section></div>

  <div v-if="showQrLightbox" class="qr-lightbox" @click.self="showQrLightbox = false"><section class="qr-lightbox-card" role="dialog"><div class="modal-header"><div><span class="eyebrow">Offline handoff</span><h2>{{ t('enlargeQr') }}</h2></div><button class="close-button" @click="showQrLightbox = false">×</button></div><button class="qr-lightbox-stage" @click="showQrLightbox = false"><canvas ref="qrLargeCanvas" width="768" height="768"></canvas></button><p class="qr-lightbox-hint">{{ t('qrCloseHint') }}</p></section></div>
  <div class="toast" :class="{ show: toastMessage }">{{ toastMessage }}</div>
</template>

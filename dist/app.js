const TAGS = ['自然风光','文化历史','美食探索','建筑空间','慢节奏','周末短途','艺术展览','朋友同行'];
const TAG_CLASS = {'自然风光':'green','文化历史':'blue','美食探索':'','建筑空间':'blue','慢节奏':'green','周末短途':'','艺术展览':'blue','朋友同行':'green'};
const SEED = {
  profile:{home:'上海市 · 静安区'},
  destinations:[
    {id:'kyoto',name:'京都',region:'日本 · 关西',location:'京都市',tags:['文化历史','慢节奏','美食探索'],transport:'上海浦东 → 关西机场，约 2 小时 30 分；机场巴士到京都站。',note:'想在清晨去一次清水寺。',status:'想去'},
    {id:'alishan',name:'阿里山',region:'中国台湾 · 嘉义',location:'嘉义县阿里山乡',tags:['自然风光','慢节奏','周末短途'],transport:'上海虹桥 → 嘉义，建议高铁到嘉义站后转小火车。',note:'日出、森林铁路和一晚山上住宿。',status:'已计划'},
    {id:'fukuoka',name:'福冈',region:'日本 · 九州',location:'福冈市博多区',tags:['美食探索','周末短途'],transport:'浦东机场直飞福冈，约 2 小时 10 分；机场地铁到博多。',note:'屋台和海边骑行。',status:'已计划'},
    {id:'dali',name:'大理',region:'中国 · 云南',location:'大理古城',tags:['自然风光','慢节奏','建筑空间'],transport:'上海 → 昆明 → 大理，或直飞丽江后转车。',note:'留三天给洱海和古城，不赶景点。',status:'想去'},
    {id:'suzhou',name:'苏州',region:'中国 · 江苏',location:'姑苏区',tags:['建筑空间','周末短途'],transport:'上海虹桥 → 苏州站，高铁约 25 分钟。',note:'园林和一顿面。',status:'已出发'}
  ],
  plans:[
    {id:'p1',date:'2026-10-10',time:'09:00',destination:'京都 · 清水寺',activity:'清水寺 → 二年坂 → 祇园散步'},
    {id:'p2',date:'2026-10-11',time:'10:30',destination:'京都 · 岚山',activity:'竹林小径，下午留给咖啡店'},
    {id:'p3',date:'2026-11-21',time:'06:20',destination:'阿里山 · 祝山',activity:'看日出，下午搭森林小火车'}
  ]
};

let state = emptyState();
let currentAccountId = null;
const legacyLocalState = localStorage.getItem('travelnote-state-v1');
let activeView = 'destinations';
let searchTerm = '';
let activeFilter = '全部';
let editingId = null;

function emptyState(){ return {profile:{home:''},destinations:[],plans:[],tagCatalog:[]}; }
function normalizeState(saved={}){
  const destinations=(Array.isArray(saved.destinations)?saved.destinations:[]).map(item=>({...item,arrangement:item.arrangement||'',note:item.note||'',tags:Array.isArray(item.tags)?item.tags:[]}));
  return {
    profile:{...structuredClone(SEED.profile),...(saved.profile||{})},
    destinations,
    plans:(Array.isArray(saved.plans)?saved.plans:[]).map(item=>({...item,destinationId:item.destinationId||'',otherDestination:item.otherDestination||'',activity:item.activity||'',note:item.note||''})),
    tagCatalog:[...new Set([...(saved.tagCatalog||[]),...TAGS,...destinations.flatMap(item=>item.tags||[])])]
  };
}
function loadState(storageKey='travelnote-state-v1'){
  try { const raw=localStorage.getItem(storageKey); return normalizeState(raw?JSON.parse(raw):SEED); }
  catch { return normalizeState(SEED); }
}
function persist(){ if(currentAccountId) localStorage.setItem(`travelnote-state-v1-${currentAccountId}`, JSON.stringify(state)); }
function escapeHtml(value=''){ return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch])); }
function markdownInline(value=''){
  let html=escapeHtml(value);
  const links=[];
  html=html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,label,url)=>{const token=`\u0000LINK${links.length}\u0000`;links.push(`<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`);return token;});
  html=html.replace(/`([^`]+)`/g,'<code>$1</code>');
  html=html.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_]+)__/g,'<strong>$1</strong>');
  html=html.replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/_([^_]+)_/g,'<em>$1</em>');
  html=html.replace(/\u0000LINK(\d+)\u0000/g,(_,index)=>links[Number(index)]);
  return html;
}
function markdownHtml(value=''){
  const lines=String(value).replace(/\r\n?/g,'\n').split('\n'), output=[];
  let listOpen=false;
  const closeList=()=>{if(listOpen){output.push('</ul>');listOpen=false;}};
  lines.forEach(line=>{
    if(!line.trim()){closeList();return;}
    const heading=line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    const bullet=line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered=line.match(/^\s*\d+[.)]\s+(.+)$/);
    if(heading){closeList();const level=Math.min(heading[1].length,4);output.push(`<h${level}>${markdownInline(heading[2])}</h${level}>`);return;}
    if(bullet||ordered){if(!listOpen){output.push('<ul>');listOpen=true;}output.push(`<li>${markdownInline((bullet||ordered)[1])}</li>`);return;}
    closeList();
    output.push(`<p>${markdownInline(line)}</p>`);
  });
  closeList();
  return `<div class="markdown-body">${output.join('')}</div>`;
}
function tagHtml(tag){ return `<span class="tag ${TAG_CLASS[tag]||''}">${escapeHtml(tag)}</span>`; }
function statusClass(status){ return status === '已出发' ? 'dot-green' : status === '已计划' ? 'dot-blue' : 'dot-coral'; }
function formatDate(date){ const d = new Date(`${date}T00:00:00`); return `${d.getMonth()+1}月${d.getDate()}日`; }
function formatWeek(date){ const d = new Date(`${date}T00:00:00`); return ['日','一','二','三','四','五','六'][d.getDay()]; }
function toast(message){ const el=document.querySelector('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>el.classList.remove('show'),2400); }

async function apiRequest(path, options={}){
  const method=(options.method||'GET').toUpperCase();
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  if(['POST','PUT','PATCH','DELETE'].includes(method)&&!headers['Idempotency-Key']){
    headers['Idempotency-Key']=window.crypto?.randomUUID?.()||`tn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return fetch(path,{credentials:'same-origin',...options,headers});
}
function showAuthError(message, target='login-error'){ const el=document.querySelector(`#${target}`); if(el)el.textContent=message||''; }
function setAuthMode(mode){
  const register=mode==='register';
  document.querySelector('#login-form').hidden=register;
  document.querySelector('#register-form').hidden=!register;
  document.querySelector('#auth-title').textContent=register?'创建你的旅途账号':'登录你的旅途';
  document.querySelector('#auth-description').textContent=register?'创建后即可拥有独立的地点、标签和日程空间。':'仅限本地账号访问。地点、路线和日程不会被上传到公开服务。';
  document.querySelector('#register-toggle').textContent=register?'已有账号？返回登录':'还没有账号？注册';
  showAuthError('', 'login-error');
  showAuthError('', 'register-error');
}
function showApp(){ document.querySelector('#auth-gate').hidden=true; render(); }
async function syncWorkspace(){
  const response=await apiRequest('/api/workspace',{method:'PUT',body:JSON.stringify(buildPacket())});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.message||'保存旅行数据失败');
  return normalizeState(data);
}
async function loadAccountWorkspace(account){
  currentAccountId=String(account.id);
  const response=await apiRequest('/api/workspace');
  const remote=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(remote.message||'读取旅行数据失败');
  const accountKey=`travelnote-state-v1-${currentAccountId}`;
  const hasAccountLocal=Boolean(localStorage.getItem(accountKey));
  if(!remote.destinations?.length&&!remote.plans?.length&&!hasAccountLocal&&legacyLocalState){
    state=loadState('travelnote-state-v1');
    state=await syncWorkspace();
    localStorage.removeItem('travelnote-state-v1');
  }else{
    state=normalizeState(remote);
  }
  persist();
}
async function commitWorkspace(mutator, message){
  const previous=structuredClone(state);
  mutator();
  try{
    state=await syncWorkspace();
    persist();
    render();
    toast(message);
  }catch(error){
    state=previous;
    render();
    toast(error.message||'保存失败，请稍后重试');
  }
}
async function bootstrapAuth(){
  try {
    const response=await apiRequest('/api/auth/me');
    if(response.ok){
      const data=await response.json();
      await loadAccountWorkspace(data.account);
      showApp();
      return;
    }
  } catch(error){ showAuthError(error.message||'无法加载旅行数据'); }
  document.querySelector('#auth-gate').hidden=false;
}

function render(){
  document.querySelector('#destination-count').textContent=String(state.destinations.length).padStart(2,'0');
  document.querySelector('#plan-count').textContent=String(state.plans.length).padStart(2,'0');
  document.querySelector('#home-location').textContent=state.profile.home;
  document.querySelector('#tag-count').textContent=String(state.tagCatalog.length).padStart(2,'0');
  document.querySelector('#page-breadcrumb').textContent={destinations:'旅行灵感',plans:'日程安排',exchange:'离线交换',tags:'标签管理'}[activeView];
  document.querySelector('#page-content').innerHTML = activeView==='destinations' ? destinationsView() : activeView==='plans' ? plansView() : activeView==='exchange' ? exchangeView() : tagsView();
  renderTimeline();
  bindViewEvents();
}

function destinationsView(){
  const filtered=state.destinations.filter(item=>{
    const query = `${item.name} ${item.region} ${item.location} ${item.tags.join(' ')}`.toLowerCase();
    return (!searchTerm || query.includes(searchTerm.toLowerCase())) && (activeFilter==='全部' || item.tags.includes(activeFilter) || item.status===activeFilter);
  });
  const allTags=['全部',...state.tagCatalog];
  return `<section class="view-section active">
    <div class="page-heading"><div><span class="eyebrow">My travel notes</span><h1>旅行灵感</h1><p>把还没出发的理由，先好好记下来。</p></div><button class="primary-button" id="add-destination"><span class="plus">+</span>添加想去的地方</button></div>
    <div class="stats-row"><div class="stat-card"><small>想去的地方</small><strong>${state.destinations.length}</strong><span>条记录</span></div><div class="stat-card"><small>已安排日程</small><strong>${state.plans.length}</strong><span>个日期</span></div><div class="stat-card"><small>覆盖标签</small><strong class="accent">${new Set(state.destinations.flatMap(item=>item.tags)).size}</strong><span>种理由</span></div></div>
    <div class="toolbar"><div class="search-wrap"><span class="search-glyph">⌕</span><input id="destination-search" value="${escapeHtml(searchTerm)}" placeholder="搜索地点、地区或标签" /></div><select class="filter-select" id="status-filter"><option value="全部">全部状态</option><option>想去</option><option>已计划</option><option>已出发</option></select></div>
    <div class="tag-filter-row">${allTags.map(tag=>`<button class="tag-filter ${activeFilter===tag?'active':''}" data-tag-filter="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}</div>
    <div class="destination-list">${filtered.length ? filtered.map(cardHtml).join('') : `<div class="empty-state"><strong>还没有匹配的地方</strong><span>换个关键词，或清除筛选继续探索。</span></div>`}</div>
  </section>`;
}

function cardHtml(item){ return `<article class="destination-card"><div class="card-topline"><div class="card-pin ${item.tags.includes('自然风光')?'green':item.tags.includes('美食探索')?'gold':'blue'}">⌖</div><div class="card-actions"><button class="small-icon" data-edit="${item.id}" aria-label="编辑 ${escapeHtml(item.name)}">✎</button><button class="small-icon" data-delete="${item.id}" aria-label="删除 ${escapeHtml(item.name)}">×</button></div></div><h3>${escapeHtml(item.name)}</h3><div class="region">${escapeHtml(item.region)} · ${escapeHtml(item.location)}</div><div class="tag-list">${item.tags.map(tagHtml).join('')}</div><div class="transport-line"><span>⇢</span><span>${escapeHtml(item.transport)}</span></div>${item.arrangement?`<div class="transport-line"><span>▣</span><span>${escapeHtml(item.arrangement)}</span></div>`:''}${item.note?`<div class="note-block"><span class="note-label">说明</span>${markdownHtml(item.note)}</div>`:''}<div class="card-footer"><span class="status-label"><i class="dot ${statusClass(item.status)}"></i>${escapeHtml(item.status)}</span></div></article>`; }

function plansView(){
  const sorted=[...state.plans].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  return `<section class="view-section active"><div class="plans-header"><div><span class="eyebrow">Your itinerary</span><h2>日程安排</h2></div><button class="primary-button" id="add-plan"><span class="plus">+</span>新增安排</button></div><div class="plan-list">${sorted.length ? sorted.map(plan=>`<article class="plan-row"><div class="plan-date"><strong>${formatDate(plan.date)}</strong><br>周${formatWeek(plan.date)}</div><div><h3>${escapeHtml(plan.destination)}</h3><p>${escapeHtml(plan.activity)}</p>${plan.note?markdownHtml(plan.note):''}</div><time>${escapeHtml(plan.time)}</time></article>`).join('') : `<div class="empty-state"><strong>还没有安排</strong><span>给某个日期留下一点期待。</span></div>`}</div></section>`;
}

function exchangeView(){
  const packet=buildPacket();
  const encoded=encodePacket(packet);
  return `<section class="view-section active"><div class="exchange-hero"><div><span class="eyebrow">Offline handoff</span><h2>把旅途带到手机上</h2><p>网页端导出，手机端扫码或导入文件；全程不依赖网络。</p></div><span class="hero-symbol">↗</span></div><div class="exchange-grid"><article class="exchange-card"><h3>生成二维码</h3><p>二维码里包含当前的地点、标签、交通和日程。仅在本机生成。</p><div class="qr-stage"><canvas id="qr-canvas" width="176" height="176" aria-label="TravelNote 数据二维码"></canvas></div><div class="data-code">${escapeHtml(encoded.slice(0,120))}…</div><button class="secondary-button" id="copy-packet" style="margin-top:12px">复制数据包</button></article><article class="exchange-card"><h3>导出 / 导入文件</h3><p>适合数据较多时使用。导出一个 TravelNote 数据包，在手机端选择导入即可。</p><label class="file-drop" for="import-file"><div><strong>拖入或选择 .json 文件</strong><small>只接受 TravelNote 数据格式</small></div><input id="import-file" type="file" accept="application/json,.json" /></label><button class="primary-button" id="export-file" style="margin-top:14px">下载当前数据</button></article></div></section>`;
}

function tagsView(){
  const usage=tag=>state.destinations.filter(item=>(item.tags||[]).includes(tag)).length;
  return `<section class="view-section active"><div class="page-heading"><div><span class="eyebrow">Your tag library</span><h1>标签管理</h1><p>把旅行理由整理成自己的筛选方式。</p></div></div><div class="tag-management-card"><div class="tag-management-intro"><div><h2>添加一个新标签</h2><p>新标签会立即出现在地点编辑和筛选栏里。</p></div><form id="add-tag-form" class="add-tag-row"><input name="tag" maxlength="16" required placeholder="例如：温泉、亲子、摄影" /><button class="primary-button" type="submit"><span class="plus">+</span>添加标签</button></form></div><div class="tag-library">${state.tagCatalog.map((tag,index)=>`<div class="tag-library-item"><div><span class="tag ${TAG_CLASS[tag]||''}">${escapeHtml(tag)}</span><small>${usage(tag)} 个地点使用</small></div>${index>=TAGS.length?`<button class="small-icon" data-delete-tag="${escapeHtml(tag)}" aria-label="删除 ${escapeHtml(tag)}">×</button>`:`<span class="tag-system">系统</span>`}</div>`).join('')}</div></div></section>`;
}

function buildPacket(){ return {format:'travelnote',version:3,accountId:String(currentAccountId||''),exportedAt:new Date().toISOString(),profile:state.profile,tagCatalog:state.tagCatalog,destinations:state.destinations,plans:state.plans}; }
function encodePacket(packet){ const bytes=new TextEncoder().encode(JSON.stringify(packet)); let binary=''; bytes.forEach(b=>binary+=String.fromCharCode(b)); return 'TN1.'+btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function drawQr(canvas, text){
  if(window.QRCode?.toCanvas){
    window.QRCode.toCanvas(canvas,text,{width:160,margin:1,color:{dark:'#14373b',light:'#fffdf9'}},err=>{if(err) toast('二维码生成失败');});
    return;
  }
  drawQrFallback(canvas,text);
}
function drawQrFallback(canvas, text){
  const ctx=canvas.getContext('2d'), size=29, cell=6; canvas.width=canvas.height=size*cell; ctx.fillStyle='#fffdf9';ctx.fillRect(0,0,canvas.width,canvas.height);
  let hash=2166136261; for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}
  const matrix=Array.from({length:size},()=>Array(size).fill(null));
  const finder=(x,y)=>{for(let r=-1;r<8;r++)for(let c=-1;c<8;c++){const inside=r>=0&&r<7&&c>=0&&c<7;const black=inside&&(r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4));if(x+c>=0&&x+c<size&&y+r>=0&&y+r<size)matrix[y+r][x+c]=black;}};
  finder(0,0);finder(size-7,0);finder(0,size-7);
  for(let i=8;i<size-8;i++){if(matrix[6][i]===null)matrix[6][i]=i%2===0;if(matrix[i][6]===null)matrix[i][6]=i%2===0;}
  let n=0; for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(matrix[r][c]===null){hash^=hash<<13;hash^=hash>>>17;hash^=hash<<5;matrix[r][c]=((hash+n++*31)>>>0)%7<3;}
  ctx.fillStyle='#14373b'; for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(matrix[r][c])ctx.fillRect(c*cell,r*cell,cell,cell);
}

function renderTimeline(){ const target=document.querySelector('#timeline'); if(!target)return; const upcoming=[...state.plans].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).slice(0,3); target.innerHTML=upcoming.length?upcoming.map(plan=>`<div class="timeline-item"><div class="time">${escapeHtml(plan.time)}</div><i class="event-dot"></i><div class="event-card"><strong>${escapeHtml(plan.destination)}</strong><span>${escapeHtml(plan.activity)}</span></div></div>`).join(''):`<div class="empty-state" style="padding:20px 8px;font-size:11px">还没有近期安排</div>`; }

function bindViewEvents(){
  document.querySelector('#add-destination')?.addEventListener('click',()=>openDestinationModal());
  document.querySelector('#add-plan')?.addEventListener('click',()=>openPlanModal());
  document.querySelector('#destination-search')?.addEventListener('input',e=>{searchTerm=e.target.value;render()});
  document.querySelector('#status-filter')?.addEventListener('change',e=>{activeFilter=e.target.value;render()});
  document.querySelectorAll('[data-tag-filter]').forEach(btn=>btn.addEventListener('click',()=>{activeFilter=btn.dataset.tagFilter;render()}));
  document.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>openDestinationModal(btn.dataset.edit)));
  document.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>deleteDestination(btn.dataset.delete)));
  document.querySelector('#export-file')?.addEventListener('click',downloadBackup);
  document.querySelector('#copy-packet')?.addEventListener('click',()=>navigator.clipboard?.writeText(encodePacket(buildPacket())).then(()=>toast('数据包已复制')));
  document.querySelector('#import-file')?.addEventListener('change',handleImport);
  document.querySelector('#add-tag-form')?.addEventListener('submit',addTag);
  document.querySelectorAll('[data-delete-tag]').forEach(btn=>btn.addEventListener('click',()=>deleteTag(btn.dataset.deleteTag)));
  if(activeView==='exchange') drawQr(document.querySelector('#qr-canvas'),encodePacket(buildPacket()));
}

function openDestinationModal(id=null){ editingId=id; const modal=document.querySelector('#destination-modal'),form=document.querySelector('#destination-form'); const item=state.destinations.find(x=>x.id===id); form.reset(); form.elements.id.value=id||''; form.elements.name.value=item?.name||'';form.elements.region.value=item?.region||'';form.elements.location.value=item?.location||'';form.elements.transport.value=item?.transport||'';form.elements.arrangement.value=item?.arrangement||'';form.elements.note.value=item?.note||'';document.querySelector('#destination-modal-title').textContent=id?'编辑旅行灵感':'添加想去的地方';document.querySelector('#form-tags').innerHTML=state.tagCatalog.map(tag=>`<button type="button" class="tag-choice ${(item?.tags||[]).includes(tag)?'selected':''}" data-form-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('');document.querySelectorAll('[data-form-tag]').forEach(btn=>btn.addEventListener('click',()=>btn.classList.toggle('selected'))); modal.hidden=false; form.elements.name.focus(); }
function openPlanModal(){ const modal=document.querySelector('#plan-modal'),form=document.querySelector('#plan-form');form.reset();form.elements.date.value='2026-10-10';form.elements.destinationId.innerHTML='<option value="">不选择已有地点</option>'+state.destinations.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.region)}</option>`).join('');modal.hidden=false;form.elements.destinationId.focus(); }
function closeModals(){document.querySelectorAll('.modal-backdrop').forEach(m=>m.hidden=true)}
function deleteDestination(id){ const item=state.destinations.find(x=>x.id===id); if(!item||!confirm(`确定删除“${item.name}”吗？`))return;commitWorkspace(()=>{state.destinations=state.destinations.filter(x=>x.id!==id)},'已删除这条旅行灵感'); }
function addTag(e){ e.preventDefault(); const input=e.target.elements.tag, tag=input.value.trim(); if(!tag)return; if(state.tagCatalog.includes(tag)){toast('这个标签已经存在');return;} commitWorkspace(()=>state.tagCatalog.push(tag),`已添加标签“${tag}”`); input.value=''; }
function deleteTag(tag){ if(!tag||TAGS.includes(tag))return; if(!confirm(`删除标签“${tag}”？已使用它的地点也会移除这个标签。`))return; commitWorkspace(()=>{state.tagCatalog=state.tagCatalog.filter(item=>item!==tag);state.destinations.forEach(item=>{item.tags=(item.tags||[]).filter(itemTag=>itemTag!==tag)})},`已删除标签“${tag}”`); }
function downloadBackup(){ const blob=new Blob([JSON.stringify(buildPacket(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`travelnote-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);toast('数据包已下载'); }
function handleImport(e){const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{try{const data=JSON.parse(reader.result);if(data.format!=='travelnote'||!Array.isArray(data.destinations)||!Array.isArray(data.plans))throw new Error('invalid');if(data.accountId&&String(data.accountId)!==String(currentAccountId)){toast('数据包账号不匹配，已拒绝导入');return;}const previous=state;state=normalizeState(data);try{state=await syncWorkspace();persist();render();toast(`已导入 ${state.destinations.length} 个地点和 ${state.plans.length} 个安排`)}catch(error){state=previous;render();toast(error.message||'导入保存失败')}}catch{toast('文件格式不正确，请选择 TravelNote 数据包')}};reader.readAsText(file);e.target.value='';}

document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-view]'); if(nav){activeView=nav.dataset.view;searchTerm='';activeFilter='全部';document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item===nav));render();}
  const quick=e.target.closest('[data-filter]'); if(quick){activeView='destinations';activeFilter=quick.dataset.filter;document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.view===activeView));render();}
  if(e.target.matches('[data-close-modal]')||e.target.classList.contains('modal-backdrop'))closeModals();
});
document.querySelector('#destination-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.target,selected=[...document.querySelectorAll('[data-form-tag].selected')].map(el=>el.dataset.formTag);const item={id:editingId||`d${Date.now()}`,name:f.elements.name.value.trim(),region:f.elements.region.value.trim(),location:f.elements.location.value.trim(),tags:selected.length?selected:['周末短途'],transport:f.elements.transport.value.trim()||'从出发地出发，路线待补充。',arrangement:f.elements.arrangement.value.trim(),note:f.elements.note.value.trim(),status:'想去'};const message=editingId?'已更新旅行灵感':'已添加到旅行灵感';await commitWorkspace(()=>{if(editingId){const old=state.destinations.find(x=>x.id===editingId);Object.assign(old,item,{status:old.status})}else state.destinations.unshift(item)},message);closeModals();});
document.querySelector('#plan-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.target,selected=state.destinations.find(item=>item.id===f.elements.destinationId.value),other=f.elements.otherDestination.value.trim();if(!selected&&!other){toast('请选择已有旅游点，或填写其他地点');return;}await commitWorkspace(()=>state.plans.push({id:`p${Date.now()}`,date:f.elements.date.value,time:f.elements.time.value,destinationId:selected?.id||'',destination:selected?.name||other,otherDestination:other,activity:f.elements.activity.value.trim(),note:f.elements.note.value.trim()}),'已加入日程安排');closeModals();});
document.querySelector('#rail-add-plan').addEventListener('click',openPlanModal);
document.querySelector('#edit-home').addEventListener('click',()=>{const next=prompt('填写你的常用出发地',state.profile.home);if(next?.trim())commitWorkspace(()=>{state.profile.home=next.trim()},'出发地已更新')});
document.querySelector('.mobile-menu').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));
document.querySelector('#notification-button').addEventListener('click',()=>toast('今天没有新的提醒'));
document.querySelector('#search-toggle').addEventListener('click',()=>document.querySelector('#destination-search')?.focus());
document.querySelector('#logout-button').addEventListener('click',async()=>{await apiRequest('/api/auth/logout',{method:'POST'});currentAccountId=null;state=emptyState();setAuthMode('login');document.querySelector('#auth-gate').hidden=false;toast('已退出登录')});
document.querySelector('#register-toggle').addEventListener('click',()=>setAuthMode(document.querySelector('#register-form').hidden?'register':'login'));
document.querySelector('#login-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button[type="submit"]');showAuthError('');button.disabled=true;try{const response=await apiRequest('/api/auth/login',{method:'POST',body:JSON.stringify({username:form.elements.username.value,password:form.elements.password.value})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'登录失败');await loadAccountWorkspace(data.account);form.reset();showApp();}catch(error){showAuthError(error.message)}finally{button.disabled=false}});
document.querySelector('#register-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button[type="submit"]'),password=form.elements.password.value;if(password!==form.elements.confirmPassword.value){showAuthError('两次输入的密码不一致','register-error');return;}showAuthError('','register-error');button.disabled=true;try{const response=await apiRequest('/api/auth/register',{method:'POST',body:JSON.stringify({username:form.elements.username.value,password})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'注册失败');await loadAccountWorkspace(data.account);form.reset();showApp();toast('账号创建成功');}catch(error){showAuthError(error.message,'register-error')}finally{button.disabled=false}});
document.querySelector('#change-password-button').addEventListener('click',()=>{const form=document.querySelector('#password-form');form.reset();showAuthError('','password-error');document.querySelector('#password-modal').hidden=false;form.elements.currentPassword.focus()});
document.querySelector('#password-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button[type="submit"]');showAuthError('','password-error');if(form.elements.newPassword.value!==form.elements.confirmPassword.value){showAuthError('两次输入的新密码不一致','password-error');return;}button.disabled=true;try{const response=await apiRequest('/api/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:form.elements.currentPassword.value,newPassword:form.elements.newPassword.value})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'修改密码失败');closeModals();form.reset();toast('密码已修改');}catch(error){showAuthError(error.message,'password-error')}finally{button.disabled=false}});

bootstrapAuth();

// WebMCP: expose the same user-facing actions to compatible AI agents.
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  Promise.resolve(document.modelContext.registerTool({name:'add_travel_destination',title:'添加旅行地点',description:'添加一个想去的地方，并保存它的地区、理由标签、交通方式、旅行安排和补充说明。',inputSchema:{type:'object',properties:{name:{type:'string'},region:{type:'string'},location:{type:'string'},tags:{type:'array',items:{type:'string'}},transport:{type:'string'},arrangement:{type:'string'},note:{type:'string'}},required:['name','region','transport'],additionalProperties:false},annotations:{readOnlyHint:false},async execute(input){const item={id:`d${Date.now()}`,name:input.name,region:input.region,location:input.location||'',tags:input.tags?.length?input.tags:['周末短途'],transport:input.transport,arrangement:input.arrangement||'',note:input.note||'',status:'想去'};await commitWorkspace(()=>state.destinations.unshift(item),'已通过智能助手添加旅行地点');return {id:item.id,name:item.name,status:'saved'};}},{signal:lifecycle.signal})).catch(()=>{});
  window.addEventListener('beforeunload',()=>lifecycle.abort(),{once:true});
}

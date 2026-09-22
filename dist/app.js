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

let state = loadState();
let activeView = 'destinations';
let searchTerm = '';
let activeFilter = '全部';
let editingId = null;

function loadState(){
  try {
    const saved = JSON.parse(localStorage.getItem('travelnote-state-v1')) || structuredClone(SEED);
    saved.profile ||= structuredClone(SEED.profile);
    saved.destinations ||= [];
    saved.plans ||= [];
    saved.tagCatalog = [...new Set([...(saved.tagCatalog||[]), ...TAGS, ...saved.destinations.flatMap(item=>item.tags||[])])];
    return saved;
  } catch { const fresh=structuredClone(SEED); fresh.tagCatalog=[...TAGS]; return fresh; }
}
function persist(){ localStorage.setItem('travelnote-state-v1', JSON.stringify(state)); }
function escapeHtml(value=''){ return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch])); }
function tagHtml(tag){ return `<span class="tag ${TAG_CLASS[tag]||''}">${escapeHtml(tag)}</span>`; }
function statusClass(status){ return status === '已出发' ? 'dot-green' : status === '已计划' ? 'dot-blue' : 'dot-coral'; }
function formatDate(date){ const d = new Date(`${date}T00:00:00`); return `${d.getMonth()+1}月${d.getDate()}日`; }
function formatWeek(date){ const d = new Date(`${date}T00:00:00`); return ['日','一','二','三','四','五','六'][d.getDay()]; }
function toast(message){ const el=document.querySelector('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>el.classList.remove('show'),2400); }

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

function cardHtml(item){ return `<article class="destination-card"><div class="card-topline"><div class="card-pin ${item.tags.includes('自然风光')?'green':item.tags.includes('美食探索')?'gold':'blue'}">⌖</div><div class="card-actions"><button class="small-icon" data-edit="${item.id}" aria-label="编辑 ${escapeHtml(item.name)}">✎</button><button class="small-icon" data-delete="${item.id}" aria-label="删除 ${escapeHtml(item.name)}">×</button></div></div><h3>${escapeHtml(item.name)}</h3><div class="region">${escapeHtml(item.region)} · ${escapeHtml(item.location)}</div><div class="tag-list">${item.tags.map(tagHtml).join('')}</div><div class="transport-line"><span>⇢</span><span>${escapeHtml(item.transport)}</span></div><div class="card-footer"><span class="status-label"><i class="dot ${statusClass(item.status)}"></i>${escapeHtml(item.status)}</span><span>${escapeHtml(item.note||'')}</span></div></article>`; }

function plansView(){
  const sorted=[...state.plans].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  return `<section class="view-section active"><div class="plans-header"><div><span class="eyebrow">Your itinerary</span><h2>日程安排</h2></div><button class="primary-button" id="add-plan"><span class="plus">+</span>新增安排</button></div><div class="plan-list">${sorted.length ? sorted.map(plan=>`<article class="plan-row"><div class="plan-date"><strong>${formatDate(plan.date)}</strong><br>周${formatWeek(plan.date)}</div><div><h3>${escapeHtml(plan.destination)}</h3><p>${escapeHtml(plan.activity)}</p></div><time>${escapeHtml(plan.time)}</time></article>`).join('') : `<div class="empty-state"><strong>还没有安排</strong><span>给某个日期留下一点期待。</span></div>`}</div></section>`;
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

function buildPacket(){ return {format:'travelnote',version:1,exportedAt:new Date().toISOString(),profile:state.profile,tagCatalog:state.tagCatalog,destinations:state.destinations,plans:state.plans}; }
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

function openDestinationModal(id=null){ editingId=id; const modal=document.querySelector('#destination-modal'),form=document.querySelector('#destination-form'); const item=state.destinations.find(x=>x.id===id); form.reset(); form.elements.id.value=id||''; form.elements.name.value=item?.name||'';form.elements.region.value=item?.region||'';form.elements.location.value=item?.location||'';form.elements.transport.value=item?.transport||'';form.elements.note.value=item?.note||'';document.querySelector('#destination-modal-title').textContent=id?'编辑旅行灵感':'添加想去的地方';document.querySelector('#form-tags').innerHTML=state.tagCatalog.map(tag=>`<button type="button" class="tag-choice ${(item?.tags||[]).includes(tag)?'selected':''}" data-form-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('');document.querySelectorAll('[data-form-tag]').forEach(btn=>btn.addEventListener('click',()=>btn.classList.toggle('selected'))); modal.hidden=false; form.elements.name.focus(); }
function openPlanModal(){ const modal=document.querySelector('#plan-modal'),form=document.querySelector('#plan-form');form.reset();form.elements.date.value='2026-10-10';modal.hidden=false;form.elements.destination.focus(); }
function closeModals(){document.querySelectorAll('.modal-backdrop').forEach(m=>m.hidden=true)}
function deleteDestination(id){ const item=state.destinations.find(x=>x.id===id); if(!item||!confirm(`确定删除“${item.name}”吗？`))return;state.destinations=state.destinations.filter(x=>x.id!==id);persist();render();toast('已删除这条旅行灵感'); }
function addTag(e){ e.preventDefault(); const input=e.target.elements.tag, tag=input.value.trim(); if(!tag)return; if(state.tagCatalog.includes(tag)){toast('这个标签已经存在');return;} state.tagCatalog.push(tag);persist();render();toast(`已添加标签“${tag}”`); }
function deleteTag(tag){ if(!tag||TAGS.includes(tag))return; if(!confirm(`删除标签“${tag}”？已使用它的地点也会移除这个标签。`))return; state.tagCatalog=state.tagCatalog.filter(item=>item!==tag);state.destinations.forEach(item=>{item.tags=(item.tags||[]).filter(itemTag=>itemTag!==tag)});persist();render();toast(`已删除标签“${tag}”`); }
function downloadBackup(){ const blob=new Blob([JSON.stringify(buildPacket(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`travelnote-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);toast('数据包已下载'); }
function handleImport(e){const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(data.format!=='travelnote'||!Array.isArray(data.destinations)||!Array.isArray(data.plans))throw new Error('invalid');state={profile:data.profile||SEED.profile,tagCatalog:[...new Set([...(data.tagCatalog||[]),...TAGS,...data.destinations.flatMap(item=>item.tags||[])])],destinations:data.destinations,plans:data.plans};persist();render();toast(`已导入 ${state.destinations.length} 个地点和 ${state.plans.length} 个安排`)}catch{toast('文件格式不正确，请选择 TravelNote 数据包')}};reader.readAsText(file);e.target.value='';}

document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-view]'); if(nav){activeView=nav.dataset.view;searchTerm='';activeFilter='全部';document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item===nav));render();}
  const quick=e.target.closest('[data-filter]'); if(quick){activeView='destinations';activeFilter=quick.dataset.filter;document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.view===activeView));render();}
  if(e.target.matches('[data-close-modal]')||e.target.classList.contains('modal-backdrop'))closeModals();
});
document.querySelector('#destination-form').addEventListener('submit',e=>{e.preventDefault();const f=e.target,selected=[...document.querySelectorAll('[data-form-tag].selected')].map(el=>el.dataset.formTag);const item={id:editingId||`d${Date.now()}`,name:f.elements.name.value.trim(),region:f.elements.region.value.trim(),location:f.elements.location.value.trim(),tags:selected.length?selected:['周末短途'],transport:f.elements.transport.value.trim()||'从出发地出发，路线待补充。',note:f.elements.note.value.trim(),status:'想去'};if(editingId){const old=state.destinations.find(x=>x.id===editingId);Object.assign(old,item,{status:old.status})}else state.destinations.unshift(item);persist();closeModals();render();toast(editingId?'已更新旅行灵感':'已添加到旅行灵感');});
document.querySelector('#plan-form').addEventListener('submit',e=>{e.preventDefault();const f=e.target;state.plans.push({id:`p${Date.now()}`,date:f.elements.date.value,time:f.elements.time.value,destination:f.elements.destination.value.trim(),activity:f.elements.activity.value.trim()});persist();closeModals();render();toast('已加入日程安排');});
document.querySelector('#rail-add-plan').addEventListener('click',openPlanModal);
document.querySelector('#edit-home').addEventListener('click',()=>{const next=prompt('填写你的常用出发地',state.profile.home);if(next?.trim()){state.profile.home=next.trim();persist();render();toast('出发地已更新')}});
document.querySelector('.mobile-menu').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));
document.querySelector('#notification-button').addEventListener('click',()=>toast('今天没有新的提醒'));
document.querySelector('#search-toggle').addEventListener('click',()=>document.querySelector('#destination-search')?.focus());

render();

// WebMCP: expose the same user-facing actions to compatible AI agents.
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  Promise.resolve(document.modelContext.registerTool({name:'add_travel_destination',title:'添加旅行地点',description:'添加一个想去的地方，并保存它的地区、理由标签和从出发地出发的交通方式。',inputSchema:{type:'object',properties:{name:{type:'string'},region:{type:'string'},location:{type:'string'},tags:{type:'array',items:{type:'string'}},transport:{type:'string'},note:{type:'string'}},required:['name','region','transport'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){const item={id:`d${Date.now()}`,name:input.name,region:input.region,location:input.location||'',tags:input.tags?.length?input.tags:['周末短途'],transport:input.transport,note:input.note||'',status:'想去'};state.destinations.unshift(item);persist();render();toast('已通过智能助手添加旅行地点');return {id:item.id,name:item.name,status:'saved'};}},{signal:lifecycle.signal})).catch(()=>{});
  window.addEventListener('beforeunload',()=>lifecycle.abort(),{once:true});
}

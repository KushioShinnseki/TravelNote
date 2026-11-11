const SYSTEM_TAGS = ['自然风光','文化历史','美食探索','建筑空间','慢节奏','周末短途','艺术展览','朋友同行'];
const id = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const clone = value => JSON.parse(JSON.stringify(value));
const text = value => typeof value === 'string' ? value.trim() : '';
const unique = values => [...new Set(values)];
function initial() { return { format:'travelnote', version:3, source:'travelnote-local', accountId:id('local'), profile:{home:''}, trips:[], destinations:[], plans:[], tagCatalog:[...SYSTEM_TAGS], enabledSystemTags:[...SYSTEM_TAGS] }; }
function normalize(value) {
  if (!value || value.format !== 'travelnote' || !Array.isArray(value.destinations) || !Array.isArray(value.plans)) throw Error('备份格式不正确');
  const result = { ...initial(), ...clone(value) };
  result.source = 'travelnote-local';
  result.profile = { home: text(result.profile && result.profile.home) };
  if (!Array.isArray(result.trips) || !Array.isArray(result.tagCatalog) || !Array.isArray(result.enabledSystemTags)) throw Error('备份字段不完整');
  if (result.destinations.length > 5000 || result.plans.length > 10000 || result.trips.length > 1000) throw Error('数据量过大');
  for (const list of [result.destinations, result.plans, result.trips]) {
    if (list.some(item => !item || typeof item.id !== 'string' || !item.id) || new Set(list.map(item => item.id)).size !== list.length) throw Error('备份中有无效或重复的 ID');
  }
  result.tagCatalog = unique([...SYSTEM_TAGS, ...result.tagCatalog.filter(item => typeof item === 'string')]);
  result.destinations = result.destinations.map(item => ({...item, tags:Array.isArray(item.tags)?item.tags:[], visitCount:Math.max(0,Math.floor(Number(item.visitCount)||0))}));
  const catalog = new Map(result.destinations.map(item => [item.id,item]));
  result.plans = result.plans.map(plan => {
    const ids = unique((Array.isArray(plan.destinationIds)?plan.destinationIds:[plan.destinationId]).filter(key=>catalog.has(key)));
    const labels = ids.map(key => {const item=catalog.get(key);return [item.name,item.location].filter(Boolean).join(' · ');});
    const other = text(plan.otherDestination) || (!ids.length ? text(plan.destination):'');
    if (other) labels.push(other);
    return {...plan,tripId:result.trips.some(trip=>trip.id===plan.tripId)?plan.tripId:'',destinationIds:ids,destinationId:ids.length===1&&!other?ids[0]:'',destination:labels.join(' → '),otherDestination:other,time:plan.time||'',note:plan.note||'',activity:plan.activity||''};
  });
  delete result.scope;
  return result;
}
function change(previous, action) {
  const next = clone(previous), value=action.value || {};
  const upsert=(list,item)=>{const index=list.findIndex(old=>old.id===item.id);if(index<0)list.push(item);else list[index]=item;};
  switch(action.type) {
    case 'destination': {
      if(!text(value.name))throw Error('请输入景点名称');
      const count=Number(value.visitCount||0);if(!Number.isInteger(count)||count<0)throw Error('去过次数必须是非负整数');
      upsert(next.destinations,{...value,id:value.id||id('destination'),name:text(value.name),tags:value.tags||[],visitCount:count,status:value.status||'想去'});break;
    }
    case 'deleteDestination': {
      const old=next.destinations.find(item=>item.id===action.id);
      next.plans.forEach(plan=>{if((plan.destinationIds||[]).includes(action.id)){plan.destinationIds=plan.destinationIds.filter(key=>key!==action.id);plan.otherDestination=[plan.otherDestination,old&&[old.name,old.location].filter(Boolean).join(' · ')].filter(Boolean).join(' → ');}});
      next.destinations=next.destinations.filter(item=>item.id!==action.id);break;
    }
    case 'visit': {const item=next.destinations.find(item=>item.id===action.id);if(item)item.visitCount=(item.visitCount||0)+1;break;}
    case 'plan':
      if(!/^\d{4}-\d{2}-\d{2}$/.test(value.date)||(!value.destinationIds?.length&&!text(value.otherDestination)))throw Error('请选择日期和至少一个景点');
      if(value.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))throw Error('时间格式不正确');
      upsert(next.plans,{...value,id:value.id||id('plan')});break;
    case 'deletePlan':next.plans=next.plans.filter(item=>item.id!==action.id);break;
    case 'trip':if(!text(value.name))throw Error('请输入出行计划名称');upsert(next.trips,{id:value.id||id('trip'),name:text(value.name)});break;
    case 'deleteTrip':next.trips=next.trips.filter(item=>item.id!==action.id);next.plans.forEach(plan=>{if(plan.tripId===action.id)plan.tripId='';});break;
    case 'tag':if(!text(value.name))throw Error('请输入标签');next.tagCatalog=unique([...next.tagCatalog,text(value.name)]);break;
    case 'deleteTag':if(SYSTEM_TAGS.includes(action.id))throw Error('系统标签请使用启用/取消');next.tagCatalog=next.tagCatalog.filter(tag=>tag!==action.id);next.destinations.forEach(item=>{item.tags=item.tags.filter(tag=>tag!==action.id);});break;
    case 'toggleTag':next.enabledSystemTags=next.enabledSystemTags.includes(action.id)?next.enabledSystemTags.filter(tag=>tag!==action.id):[...next.enabledSystemTags,action.id];break;
    case 'home':next.profile={home:text(value.home)};break;
    default:throw Error('未知操作');
  }
  return normalize(next);
}
function restore(raw) {
  const incoming=JSON.parse(raw);
  if(incoming.scope&&incoming.scope.type!=='all')throw Error('请使用完整备份恢复本地版');
  return normalize(incoming);
}
module.exports={SYSTEM_TAGS,initial,normalize,change,restore};

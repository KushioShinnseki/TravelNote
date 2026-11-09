const {SYSTEM_TAGS,initial,normalize,change,restore}=require('./workspace');
const {markdownNodes}=require('../../utils/markdown');
const platform=typeof wx!=='undefined'?wx:my;
const wechat=typeof wx!=='undefined';
const KEY='travelnote-local-planner-v1';
const get=()=>wechat?platform.getStorageSync(KEY):platform.getStorageSync({key:KEY}).data;
const put=value=>wechat?platform.setStorageSync(KEY,value):platform.setStorageSync({key:KEY,data:value});
const toast=message=>platform.showToast(wechat?{title:message,icon:'none'}:{content:message});
const confirm=(message,callback)=>wechat?platform.showModal({title:'TravelNote 本地版',content:message,success:result=>{if(result.confirm)callback();}}):platform.confirm({title:'TravelNote 本地版',content:message,success:result=>{if(result.confirm)callback();}});
const emptyDestination=()=>({name:'',region:'',location:'',transport:'',arrangement:'',note:'',tags:[],visitCount:0});
const date=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
Page({
 data:{tab:'plans',state:initial(),destinations:[],plans:[],trips:[],tags:[],query:'',tagQuery:'',tripIndex:0,tripChoices:[],editor:'',form:{},tagName:'',backup:'',storageError:false},
 onLoad(){try{const saved=get();this.workspace=saved?normalize(saved):initial();this.render();}catch(error){this.workspace=initial();this.setData({storageError:true});toast('读取失败，原存储已保留，请恢复备份');}},
 render(){
  const s=this.workspace,query=this.data.query.trim().toLowerCase();
  const selectedTrip=this.data.tripChoices[this.data.tripIndex];
  const destinations=s.destinations.filter(item=>!query||[item.name,item.region,...item.tags].join(' ').toLowerCase().includes(query)).map(item=>({...item,noteNodes:markdownNodes(item.note||''),noteExpanded:false}));
  const trips=[{id:'all',name:'全部出行计划'},{id:'',name:'独立日程'},...s.trips];
  const tripIndex=Math.max(0,trips.findIndex(item=>item.id===(selectedTrip?selectedTrip.id:'all')));
  const filter=trips[tripIndex].id;
  const plans=s.plans.filter(item=>filter==='all'||item.tripId===filter).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).map(item=>({...item,tripName:(s.trips.find(trip=>trip.id===item.tripId)||{}).name||'独立日程',noteNodes:markdownNodes(item.note||''),noteExpanded:false}));
  const tags=s.tagCatalog.filter(tag=>!this.data.tagQuery||tag.toLowerCase().includes(this.data.tagQuery.toLowerCase())).map(name=>({name,system:SYSTEM_TAGS.includes(name),enabled:s.enabledSystemTags.includes(name)}));
  this.setData({state:s,destinations,plans,trips:s.trips,tripChoices:trips,tripIndex,tags});
 },
 commit(action){if(this.data.storageError){toast('请先恢复备份，原存储不会被覆盖');return false;}try{const next=change(this.workspace,action);put(next);this.workspace=next;this.render();return true;}catch(error){toast('保存失败：'+error.message);return false;}},
 tab(e){this.setData({tab:e.currentTarget.dataset.tab});},
 toggleNote(e){const list=e.currentTarget.dataset.kind==='plan'?'plans':'destinations',index=this.data[list].findIndex(item=>item.id===e.currentTarget.dataset.id);if(index>=0)this.setData({[`${list}[${index}].noteExpanded`]:!this.data[list][index].noteExpanded});},
 search(e){this.setData({query:e.detail.value});this.render();},
 tagSearch(e){this.setData({tagQuery:e.detail.value});this.render();},
 tripFilter(e){this.setData({tripIndex:Number(e.detail.value)});this.render();},
 open(e){
  const type=e.currentTarget.dataset.type,key=e.currentTarget.dataset.id;
  const lists={destination:'destinations',plan:'plans',trip:'trips'};
  let form=key?JSON.parse(JSON.stringify(this.workspace[lists[type]].find(item=>item.id===key))):type==='destination'?emptyDestination():type==='plan'?{date:date(),time:'',tripId:'',destinationIds:[],otherDestination:'',activity:'',note:''}:{name:''};
  const tripOptions=[{id:'',name:'独立日程'},...this.workspace.trips];
  this.setData({editor:type,form,formTripOptions:tripOptions,formTripIndex:Math.max(0,tripOptions.findIndex(trip=>trip.id===form.tripId)),tagOptions:this.workspace.tagCatalog.filter(tag=>!SYSTEM_TAGS.includes(tag)||this.workspace.enabledSystemTags.includes(tag)||form.tags?.includes(tag)).map(name=>({name,checked:(form.tags||[]).includes(name)})),placeOptions:this.workspace.destinations.map(item=>({...item,checked:(form.destinationIds||[]).includes(item.id)}))});
  this.selectedPlaces();
 },
 input(e){this.setData({['form.'+e.currentTarget.dataset.field]:e.detail.value});},
 formTrip(e){const index=Number(e.detail.value);this.setData({formTripIndex:index,'form.tripId':this.data.formTripOptions[index].id});},
 checkboxTags(e){this.setData({'form.tags':e.detail.value});},
 checkboxPlaces(e){const ids=e.detail.value,prior=this.data.form.destinationIds||[];this.setData({'form.destinationIds':[...prior.filter(id=>ids.includes(id)),...ids.filter(id=>!prior.includes(id))]});this.selectedPlaces();},
 selectedPlaces(){this.setData({selectedPlaces:(this.data.form.destinationIds||[]).map(id=>({id,name:(this.workspace.destinations.find(item=>item.id===id)||{}).name||''}))});},
 move(e){const index=Number(e.currentTarget.dataset.index),next=index+Number(e.currentTarget.dataset.offset),ids=[...this.data.form.destinationIds];if(next<0||next>=ids.length)return;[ids[index],ids[next]]=[ids[next],ids[index]];this.setData({'form.destinationIds':ids});this.selectedPlaces();},
 save(){if(this.commit({type:this.data.editor,value:this.data.form}))this.close();},
 close(){this.setData({editor:''});},
 remove(e){const type=e.currentTarget.dataset.type,id=e.currentTarget.dataset.id;confirm(type==='deleteTrip'?'删除出行计划？其中的日程仍会保留。':'确定删除？',()=>this.commit({type,id}));},
 visit(e){this.commit({type:'visit',id:e.currentTarget.dataset.id});},
 tagInput(e){this.setData({tagName:e.detail.value});},
 addTag(){if(this.commit({type:'tag',value:{name:this.data.tagName}}))this.setData({tagName:''});},
 toggleTag(e){this.commit({type:'toggleTag',id:e.currentTarget.dataset.id});},
 home(e){this.setData({homeDraft:e.detail.value});},
 saveHome(){this.commit({type:'home',value:{home:this.data.homeDraft===undefined?this.workspace.profile.home:this.data.homeDraft}});},
 exportBackup(){this.setData({backup:JSON.stringify(this.workspace,null,2)});toast('已生成完整 JSON 备份，可复制保存');},
 backupInput(e){this.setData({backup:e.detail.value});},
 copyBackup(){platform.setClipboardData({data:this.data.backup});},
 importBackup(){confirm('恢复备份会替换当前手机中的全部规划，是否继续？',()=>{try{const value=restore(this.data.backup);put(value);this.workspace=value;this.setData({storageError:false});this.render();toast('已恢复');}catch(error){toast('恢复失败：'+error.message);}});},
 clear(){confirm('清空本地全部规划？请先导出备份。',()=>{try{const value=initial();put(value);this.workspace=value;this.setData({storageError:false,backup:''});this.render();toast('已清空');}catch(error){toast('清空失败');}});}
});

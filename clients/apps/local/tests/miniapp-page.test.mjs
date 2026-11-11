import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const model=require('../../../miniapps/local/shared/workspace.cjs')
const markdown=require('../../../miniapps/receiver/wechat/utils/markdown.js')
const source=fs.readFileSync(new URL('../../../miniapps/local/shared/page.cjs',import.meta.url),'utf8')
for(const platform of ['wechat','alipay'])test(`${platform}: page creates and reopens local plans; write failure preserves saved state`,()=>{
 let saved,failWrite=false,page
 const api={
  getStorageSync:()=>platform==='wechat'?saved:{data:saved},
  setStorageSync:(key,value)=>{if(failWrite)throw Error('storage full');saved=JSON.parse(JSON.stringify(platform==='wechat'?value:key.data))},
  showToast:()=>{},showModal:({success})=>success({confirm:true}),confirm:({success})=>success({confirm:true})
 }
 const load=()=>{
  vm.runInNewContext(source,{[platform==='wechat'?'wx':'my']:api,require:name=>name==='./workspace'?model:markdown,Page:value=>{page=value},console})
  page.setData=values=>{for(const [key,value]of Object.entries(values)){const parts=key.replace(/\[(\d+)\]/g,'.$1').split('.');let target=page.data;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)]=value}}
  page.onLoad()
 }
 load();page.commit({type:'trip',value:{id:'t',name:'本地旅行'}})
 page.commit({type:'destination',value:{id:'d',name:'景点'}})
 page.commit({type:'plan',value:{id:'p',tripId:'t',date:'2026-11-09',destinationIds:['d'],note:'# 备注'}})
 assert.equal(page.data.plans.length,1);assert.equal(page.data.plans[0].destination,'景点')
 page.exportBackup();assert.equal(JSON.parse(page.data.backup).source,'travelnote-local')
 load();assert.equal(page.data.plans[0].tripName,'本地旅行')
 const before=JSON.stringify(saved);failWrite=true
 assert.equal(page.commit({type:'destination',value:{id:'x',name:'不能保存'}}),false)
 assert.equal(JSON.stringify(saved),before);assert.equal(page.workspace.destinations.length,1)
})

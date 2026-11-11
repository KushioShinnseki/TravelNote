import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { selectExport, mergeImport } from './transfer.mjs'

const require = createRequire(import.meta.url)
const workspace = {
  format: 'travelnote', version: 3, accountId: '1', profile: { home: '家' }, tagCatalog: ['自然', '历史'],
  trips: [{ id: 't1', name: '三日游' }, { id: 't2', name: '另一出行' }],
  destinations: [{ id: 'a', name: '公园', tags: ['自然'] }, { id: 'b', name: '博物馆', tags: ['历史'] }],
  plans: [
    { id: 'p1', tripId: 't1', date: '2026-11-08', destinationIds: ['a', 'b'] },
    { id: 'p2', tripId: 't1', date: '2026-11-09', destinationIds: ['b'] },
    { id: 'p3', tripId: 't2', date: '2026-11-10', destinationIds: ['a'] },
    { id: 'p4', date: '2026-11-11', otherDestination: '临时地点' }
  ]
}
const encode = packet => `TN1.${Buffer.from(JSON.stringify(packet)).toString('base64url')}`

test('trip export includes all its days, all referenced places, and only that trip', () => {
  const packet = selectExport(workspace, { type: 'trip', id: 't1' })
  assert.deepEqual(packet.plans.map(item => item.id), ['p1', 'p2'])
  assert.deepEqual(packet.destinations.map(item => item.id), ['a', 'b'])
  assert.deepEqual(packet.trips.map(item => item.id), ['t1'])
  assert.equal(packet.plans[0].destination, '公园 → 博物馆')
})

test('single-plan export includes its parent trip and only required places', () => {
  const packet = selectExport(workspace, { type: 'plan', id: 'p2' })
  assert.equal(packet.plans.length, 1)
  assert.deepEqual(packet.destinations.map(item => item.id), ['b'])
  assert.deepEqual(packet.trips.map(item => item.id), ['t1'])
  assert.deepEqual(packet.tagCatalog, ['历史'])
  const free = selectExport(workspace, { type: 'plan', id: 'p4' })
  assert.equal(free.destinations.length, 0)
  assert.equal(free.plans[0].destination, '临时地点')
})

test('an empty trip export removes its old days without removing unrelated data', () => {
  const empty = { ...workspace, plans: workspace.plans.filter(plan => plan.tripId !== 't1') }
  const packet = selectExport(empty, { type: 'trip', id: 't1' })
  assert.equal(packet.plans.length, 0)
  assert.deepEqual(packet.trips.map(trip => trip.id), ['t1'])
  const merged = mergeImport(workspace, packet)
  assert.deepEqual(merged.plans.map(plan => plan.id), ['p3', 'p4'])
  assert.equal(merged.destinations.length, 2)
})

test('scoped imports update and remove only their own plans, and are repeatable', () => {
  const changed = { ...workspace, plans: workspace.plans.filter(plan => plan.id !== 'p2') }
  const packet = selectExport(changed, { type: 'trip', id: 't1' })
  const merged = mergeImport(workspace, packet)
  assert.deepEqual(new Set(merged.plans.map(item => item.id)), new Set(['p1', 'p3', 'p4']))
  assert.deepEqual(mergeImport(merged, packet), merged)
  const single = mergeImport(workspace, selectExport(workspace, { type: 'plan', id: 'p2' }))
  assert.equal(single.plans.length, 4)
  assert.throws(() => mergeImport(workspace, { ...packet, plans: workspace.plans }), /outside/)
  const full = selectExport(workspace)
  assert.equal(mergeImport(workspace, full), full)
})

for (const platform of ['wechat', 'alipay']) {
  const { decodePacket, applyPacket } = require(`../clients/miniapps/receiver/${platform}/utils/packet.js`)
  test(`${platform}: trip/plan QR imports preserve other trips and reject another account`, () => {
    const initial = applyPacket(null, encode(selectExport(workspace))).state
    const changed = { ...workspace, plans: workspace.plans.filter(plan => plan.id !== 'p2') }
    const qr = encode(selectExport(changed, { type: 'trip', id: 't1' }))
    assert.equal(decodePacket(qr).plans[0].tripId, 't1')
    const merged = applyPacket(initial, qr).state
    assert.deepEqual(new Set(merged.plans.map(item => item.id)), new Set(['p1', 'p3', 'p4']))
    const repeated = applyPacket(merged, qr)
    assert.equal(repeated.summary.plans.created, 0)
    assert.equal(repeated.summary.plans.updated, 0)
    assert.equal(repeated.summary.plans.deleted, 0)
    const single = applyPacket(initial, encode(selectExport(workspace, { type: 'plan', id: 'p2' }))).state
    assert.equal(single.plans.length, 4)
    assert.throws(() => applyPacket(initial, encode({ ...selectExport(workspace), accountId: '2' })), /账号/)
  })
}

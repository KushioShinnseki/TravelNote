import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlan } from './itinerary.mjs'

const destinations = [
  { id: 'a', name: '博物馆', location: '东门' },
  { id: 'b', name: '公园', location: '' }
]

test('multiple places keep visit order, deduplicate and retain an extra place', () => {
  const plan = normalizePlan({ destinationIds: ['b', 'a', 'b'], otherDestination: '晚餐', time: '' }, destinations)
  assert.deepEqual(plan.destinationIds, ['b', 'a'])
  assert.equal(plan.destination, '公园 → 博物馆 · 东门 → 晚餐')
  assert.equal(plan.destinationId, '')
  assert.equal(plan.time, '')
  assert.deepEqual(normalizePlan(JSON.parse(JSON.stringify(plan)), destinations), plan)
})

test('legacy single-place and free-text packets remain editable', () => {
  const linked = normalizePlan({ destinationId: 'a', destination: '旧名称' }, destinations)
  assert.deepEqual(linked.destinationIds, ['a'])
  assert.equal(linked.destination, '博物馆 · 东门')
  assert.equal(linked.destinationId, 'a')
  const free = normalizePlan({ destination: '临时安排' }, destinations)
  assert.deepEqual(free.destinationIds, [])
  assert.equal(free.otherDestination, '临时安排')
})

test('renaming any linked place updates the full route without changing order or notes', () => {
  const plan = normalizePlan({ destinationIds: ['b', 'a'], note: '# 说明', activity: '参观' }, destinations)
  const updated = normalizePlan(plan, [{ ...destinations[0], name: '新博物馆' }, destinations[1]])
  assert.equal(updated.destination, '公园 → 新博物馆 · 东门')
  assert.deepEqual(updated.destinationIds, ['b', 'a'])
  assert.equal(updated.note, '# 说明')
})

test('an explicit empty selection does not restore a stale legacy link', () => {
  const plan = normalizePlan({ destinationIds: [], destinationId: 'a', otherDestination: '餐厅' }, destinations)
  assert.deepEqual(plan.destinationIds, [])
  assert.equal(plan.destination, '餐厅')
  assert.equal(plan.destinationId, '')
})

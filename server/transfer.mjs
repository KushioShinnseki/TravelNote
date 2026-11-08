import { normalizePlan, planDestinationIds } from './itinerary.mjs'

export function selectExport(workspace, scope = { type: 'all' }) {
  if (scope.type === 'all') return { ...workspace, scope }
  if (!['trip', 'plan'].includes(scope.type) || !scope.id) throw new Error('Invalid export scope')
  const plans = workspace.plans.filter(plan => scope.type === 'trip' ? plan.tripId === scope.id : plan.id === scope.id)
  const tripIds = new Set(plans.map(plan => plan.tripId).filter(Boolean))
  if (scope.type === 'trip') tripIds.add(scope.id)
  const ids = new Set(plans.flatMap(planDestinationIds))
  const destinations = workspace.destinations.filter(item => ids.has(item.id))
  const tags = new Set(destinations.flatMap(item => item.tags || []))
  return {
    ...workspace, scope, plans: plans.map(plan => normalizePlan(plan, destinations)), destinations,
    trips: (workspace.trips || []).filter(trip => tripIds.has(trip.id)),
    tagCatalog: (workspace.tagCatalog || []).filter(tag => tags.has(tag))
  }
}

function upsert(previous = [], incoming = []) {
  return [...new Map([...previous, ...incoming].map(item => [item.id, item])).values()]
}

// A scoped packet updates its own records, never deletes another trip.
export function mergeImport(previous, incoming) {
  const scope = incoming.scope
  if (!scope || scope.type === 'all') return incoming
  if (!['trip', 'plan'].includes(scope.type) || !scope.id) throw new Error('Invalid import scope')
  if (incoming.plans.some(plan => scope.type === 'trip' ? plan.tripId !== scope.id : plan.id !== scope.id)) throw new Error('Packet contains plans outside its scope')
  const retained = previous.plans.filter(plan => scope.type === 'trip' ? plan.tripId !== scope.id : plan.id !== scope.id)
  return {
    ...previous, trips: upsert(previous.trips, incoming.trips),
    destinations: upsert(previous.destinations, incoming.destinations),
    plans: upsert(retained, incoming.plans),
    tagCatalog: [...new Set([...(previous.tagCatalog || []), ...(incoming.tagCatalog || [])])]
  }
}

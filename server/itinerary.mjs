// Keep the legacy display fields for existing offline readers.
export function planDestinationIds(plan) {
  return [...new Set((Array.isArray(plan.destinationIds) ? plan.destinationIds : [plan.destinationId])
    .filter(Boolean).map(String))]
}

export function normalizePlan(plan, destinations) {
  const catalog = new Map(destinations.map(item => [String(item.id), item]))
  const destinationIds = planDestinationIds(plan).filter(id => catalog.has(id))
  const labels = destinationIds.map(id => {
    const item = catalog.get(id)
    return `${item.name}${item.location ? ` · ${item.location}` : ''}`
  })
  let otherDestination = String(plan.otherDestination || '').trim()
  // Old packets have a display name but no linked destination.
  if (!labels.length && !otherDestination) otherDestination = String(plan.destination || '').trim()
  if (otherDestination) labels.push(otherDestination)
  return {
    ...plan, destinationIds,
    destinationId: destinationIds.length === 1 && !otherDestination ? destinationIds[0] : '',
    destination: labels.join(' → '), otherDestination,
    time: plan.time || '', activity: plan.activity || '', note: plan.note || ''
  }
}

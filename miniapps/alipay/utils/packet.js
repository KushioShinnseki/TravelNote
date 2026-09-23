const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64Url(value) {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  const bytes = [];
  for (let index = 0; index < normalized.length; index += 4) {
    const a = BASE64.indexOf(normalized[index]);
    const b = BASE64.indexOf(normalized[index + 1]);
    const c = BASE64.indexOf(normalized[index + 2]);
    const d = BASE64.indexOf(normalized[index + 3]);
    if (a < 0 || b < 0) throw new Error('二维码编码无效');
    bytes.push((a << 2) | (b >> 4));
    if (normalized[index + 2] !== '=') bytes.push(((b & 15) << 4) | (c >> 2));
    if (normalized[index + 3] !== '=') bytes.push(((c & 3) << 6) | d);
  }
  return bytes;
}

function decodeUtf8(bytes) {
  let output = '';
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index++];
    if (first < 0x80) output += String.fromCharCode(first);
    else if ((first & 0xe0) === 0xc0) output += String.fromCharCode(((first & 0x1f) << 6) | (bytes[index++] & 0x3f));
    else if ((first & 0xf0) === 0xe0) output += String.fromCharCode(((first & 0x0f) << 12) | ((bytes[index++] & 0x3f) << 6) | (bytes[index++] & 0x3f));
    else {
      const code = ((first & 0x07) << 18) | ((bytes[index++] & 0x3f) << 12) | ((bytes[index++] & 0x3f) << 6) | (bytes[index++] & 0x3f);
      const adjusted = code - 0x10000;
      output += String.fromCharCode(0xd800 + (adjusted >> 10), 0xdc00 + (adjusted & 0x3ff));
    }
  }
  return output;
}

function text(value, fallback) { return typeof value === 'string' ? value.trim() : (fallback || ''); }
function unique(values) { return Array.from(new Set((Array.isArray(values) ? values : []).map(value => text(value)).filter(Boolean))); }

function decodePacket(raw) {
  if (typeof raw !== 'string' || raw.indexOf('TN1.') !== 0) throw new Error('不是 TravelNote 二维码');
  const packet = JSON.parse(decodeUtf8(decodeBase64Url(raw.slice(4))));
  if (!packet || packet.format !== 'travelnote' || !packet.accountId) throw new Error('数据包缺少账号 ID');
  if (packet.version && Number(packet.version) > 3) throw new Error('数据包版本过新');
  if (!Array.isArray(packet.destinations) || !Array.isArray(packet.plans)) throw new Error('数据包格式不完整');
  return {
    format: 'travelnote', version: Number(packet.version || 1), accountId: text(packet.accountId),
    profile: { home: text(packet.profile && packet.profile.home) }, tagCatalog: unique(packet.tagCatalog),
    destinations: packet.destinations.map((item, index) => ({
      id: text(item.id, `d-${index}`), name: text(item.name), region: text(item.region), location: text(item.location),
      tags: unique(item.tags), transport: text(item.transport), arrangement: text(item.arrangement), note: text(item.note), status: text(item.status, '想去')
    })),
    plans: packet.plans.map((item, index) => ({
      id: text(item.id, `p-${index}`), date: text(item.date), time: text(item.time, '09:00'), destinationId: text(item.destinationId),
      destination: text(item.destination, text(item.otherDestination, '未指定地点')), otherDestination: text(item.otherDestination), activity: text(item.activity), note: text(item.note)
    }))
  };
}

function equal(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function syncRecords(previous, incoming) {
  const oldById = {}; (previous || []).forEach(item => { oldById[item.id] = item; });
  const incomingIds = {}; let created = 0; let updated = 0;
  const items = incoming.map(item => { incomingIds[item.id] = true; if (!oldById[item.id]) created += 1; else if (!equal(oldById[item.id], item)) updated += 1; return item; });
  const deleted = (previous || []).filter(item => !incomingIds[item.id]).length;
  return { items, created, updated, deleted };
}

function applyPacket(previous, packet) {
  const normalized = typeof packet === 'string' ? decodePacket(packet) : packet;
  if (previous && previous.accountId && previous.accountId !== normalized.accountId) throw new Error('账号 ID 不匹配');
  const destinations = syncRecords(previous && previous.destinations, normalized.destinations);
  const plans = syncRecords(previous && previous.plans, normalized.plans);
  return {
    state: { format: normalized.format, version: normalized.version, accountId: normalized.accountId, profile: normalized.profile,
      tagCatalog: normalized.tagCatalog, destinations: destinations.items, plans: plans.items, syncedAt: new Date().toISOString() },
    summary: { accountId: normalized.accountId,
      destinations: { created: destinations.created, updated: destinations.updated, deleted: destinations.deleted },
      plans: { created: plans.created, updated: plans.updated, deleted: plans.deleted } }
  };
}

module.exports = { decodePacket, applyPacket };

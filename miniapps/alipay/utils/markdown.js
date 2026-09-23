function inlineNodes(value) {
  const nodes = [];
  const pattern = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(String(value))) !== null) {
    if (match.index > cursor) nodes.push({ type: 'text', text: String(value).slice(cursor, match.index) });
    if (match[2] || match[3]) nodes.push({ name: 'strong', children: [{ type: 'text', text: match[2] || match[3] }] });
    else if (match[4] || match[5]) nodes.push({ name: 'em', children: [{ type: 'text', text: match[4] || match[5] }] });
    else if (match[6]) nodes.push({ name: 'code', children: [{ type: 'text', text: match[6] }] });
    else nodes.push({ name: 'a', attrs: { href: match[8] }, children: [{ type: 'text', text: match[7] }] });
    cursor = match.index + match[0].length;
  }
  if (cursor < String(value).length) nodes.push({ type: 'text', text: String(value).slice(cursor) });
  return nodes.length ? nodes : [{ type: 'text', text: String(value) }];
}

function markdownNodes(value) {
  return String(value || '').replace(/\r\n?/g, '\n').split('\n').map(line => {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    const bullet = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
    const content = heading ? heading[1] : bullet ? `• ${bullet[1]}` : line;
    return { name: 'div', attrs: { class: heading ? 'markdown-heading' : 'markdown-line' }, children: inlineNodes(content) };
  });
}

module.exports = { markdownNodes };

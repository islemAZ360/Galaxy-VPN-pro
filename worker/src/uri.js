// Country-code (ISO-2) → flag emoji (regional indicator letters).
export function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return '🏳️';
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

// Return a copy of the config URI with its display remark renamed.
// vmess stores the name in the base64 JSON `ps`; the rest use the `#fragment`.
export function renameConfig(uri, name) {
  const scheme = (uri.split('://')[0] || '').toLowerCase();
  try {
    if (scheme === 'vmess') {
      const json = JSON.parse(Buffer.from(uri.slice('vmess://'.length), 'base64').toString('utf8'));
      json.ps = name;
      return 'vmess://' + Buffer.from(JSON.stringify(json), 'utf8').toString('base64');
    }
    const hashIdx = uri.indexOf('#');
    const base = hashIdx >= 0 ? uri.slice(0, hashIdx) : uri;
    return `${base}#${encodeURIComponent(name)}`;
  } catch {
    return uri;
  }
}

// Extract { host, port, name } from a proxy config URI across protocols.
export function parseConfig(uri) {
  const scheme = (uri.split('://')[0] || '').toLowerCase();
  try {
    if (scheme === 'vmess') {
      // vmess://base64(json)
      const b64 = uri.slice('vmess://'.length);
      const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      return { host: json.add, port: Number(json.port), name: json.ps || json.add };
    }
    // scheme://[userinfo@]host:port[?params][#name]
    const rest = uri.slice(scheme.length + 3);
    const hashIdx = rest.indexOf('#');
    const name = hashIdx >= 0 ? decodeURIComponent(rest.slice(hashIdx + 1)) : null;
    let main = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest;
    main = main.split('?')[0];
    const at = main.lastIndexOf('@');
    let hostport = at >= 0 ? main.slice(at + 1) : main;
    // ss:// may be base64(method:pass@host:port) without '@' visible
    if (scheme === 'ss' && at < 0) {
      try {
        const dec = Buffer.from(main, 'base64').toString('utf8');
        const a2 = dec.lastIndexOf('@');
        if (a2 >= 0) hostport = dec.slice(a2 + 1);
      } catch { /* ignore */ }
    }
    const portIdx = hostport.lastIndexOf(':');
    const host = portIdx >= 0 ? hostport.slice(0, portIdx) : hostport;
    const port = portIdx >= 0 ? Number(hostport.slice(portIdx + 1)) : NaN;
    return { host: host.replace(/^\[|\]$/g, ''), port, name: name || host };
  } catch {
    return { host: null, port: NaN, name: null };
  }
}

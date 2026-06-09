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

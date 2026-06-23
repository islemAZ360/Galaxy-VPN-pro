import { resolve4, setServers } from 'node:dns/promises';
import { isIP } from 'node:net';

// Use public DNS to avoid local resolver timeouts
try { setServers(['8.8.8.8', '1.1.1.1']); } catch {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function lookupCountries(hosts) {
  const unique = [...new Set(hosts.filter(Boolean))];
  const out = new Map();
  
  // 1. Resolve domains to IPs because ip-api batch endpoint strictly requires IPs
  const ips = new Set();
  const ipToHosts = new Map();
  for (const batch of chunk(unique, 100)) {
    await Promise.all(batch.map(async (h) => {
      if (isIP(h) === 4) {
        ips.add(h);
        if (!ipToHosts.has(h)) ipToHosts.set(h, []);
        ipToHosts.get(h).push(h);
        return;
      }
      try {
        const records = await resolve4(h);
        if (records && records.length > 0) {
          const ip = records[0];
          ips.add(ip);
          if (!ipToHosts.has(ip)) ipToHosts.set(ip, []);
          ipToHosts.get(ip).push(h);
        }
      } catch (e) {
        // DNS failure
      }
    }));
  }

  // 2. Batch lookup the IPs
  const uniqueIps = [...ips];
  const batches = chunk(uniqueIps, 100);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch('http://ip-api.com/batch?fields=status,country,countryCode,query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch.map((q) => ({ query: q }))),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const arr = await res.json();
          for (const r of arr) {
            const hostsForIp = ipToHosts.get(r.query) || [];
            for (const h of hostsForIp) {
              out.set(h, {
                country: r.status === 'success' ? r.country : null,
                country_code: r.status === 'success' ? r.countryCode : null,
              });
            }
          }
          break;
        } else {
          console.error(`[geoip] batch ${i} attempt ${attempt + 1} failed: HTTP ${res.status}`);
          if (res.status === 429) {
            await sleep(5000); // Wait longer on rate limits
          }
        }
      } catch (e) {
        console.error(`[geoip] batch ${i} attempt ${attempt + 1} failed:`, e.message);
        await sleep(1500 * (attempt + 1));
      }
    }
    // 15 req/min cap → ~4.2s between batches
    if (i < batches.length - 1) await sleep(4200);
  }

  // ensure every host has an entry
  for (const h of unique) if (!out.has(h)) out.set(h, { country: null, country_code: null });
  return out;
}

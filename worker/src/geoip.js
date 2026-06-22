// Resolve hosts to countries via ip-api.com BATCH endpoint (up to 100/req, 15 req/min).
// Far faster than per-host lookups and stays within the free rate limit.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function lookupCountries(hosts) {
  const unique = [...new Set(hosts.filter(Boolean))];
  const out = new Map();
  const batches = chunk(unique, 100);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    // Retry: the first fetch after the TCP test storm can fail transiently.
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
            out.set(r.query, {
              country: r.status === 'success' ? r.country : null,
              country_code: r.status === 'success' ? r.countryCode : null,
            });
          }
          break;
        }
      } catch (e) {
        console.error(`[geoip] batch ${i} attempt ${attempt + 1} failed:`, e.message);
        await sleep(1500 * (attempt + 1));
      }
    }
    // 15 req/min cap → ~4s between batches (skip wait after the last batch)
    if (i < batches.length - 1) await sleep(4200);
  }

  // ensure every host has an entry
  for (const h of unique) if (!out.has(h)) out.set(h, { country: null, country_code: null });
  return out;
}

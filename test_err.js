const { Agent } = require('undici');
const dispatcher = new Agent({ connect: { timeout: 1000 } });
const customFetch = async (input, init) => {
  try {
    const res = await fetch(input, { ...init, dispatcher });
    return res;
  } catch (err) {
    const c = err?.cause;
    const detail = c ? ` (cause: ${c.code || c.name || c.message})` : '';
    const wrapped = new Error(`${err.message}${detail}`);
    wrapped.cause = err;
    throw wrapped;
  }
};
const { createClient } = require('@supabase/supabase-js');
const supa = createClient('https://10.255.255.1', 'bad', { global: { fetch: customFetch } });
supa.from('candidates').select('*').then(res => console.log(JSON.stringify(res.error)));

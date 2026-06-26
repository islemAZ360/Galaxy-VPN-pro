import { createClient } from '@supabase/supabase-js';

const url = 'https://oneezcaqqqaqsjkuaoor.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uZWV6Y2FxcXFhcXNqa3Vhb29yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDk1OTU3MSwiZXhwIjoyMDk2NTM1NTcxfQ.tJtY2j1iPF2A-1Ha0ixKZugghMnA07RVyfoBfYaZcrY';

const supa = createClient(url, serviceKey);

async function run() {
  console.log('Querying total candidates (estimated count, no filter)...');
  console.time('total');
  const { count, error } = await supa
    .from('candidates')
    .select('*', { count: 'estimated', head: true });
  console.timeEnd('total');
  console.log('Total candidates:', count, error?.message);
}

run();

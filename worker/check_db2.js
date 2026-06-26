import { createClient } from '@supabase/supabase-js';

const url = 'https://oneezcaqqqaqsjkuaoor.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uZWV6Y2FxcXFhcXNqa3Vhb29yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDk1OTU3MSwiZXhwIjoyMDk2NTM1NTcxfQ.tJtY2j1iPF2A-1Ha0ixKZugghMnA07RVyfoBfYaZcrY';

const supa = createClient(url, serviceKey);

async function run() {
  console.log('Querying limited alive candidates to check if they exist...');
  console.time('fetch10');
  const { data, error } = await supa
    .from('candidates')
    .select('uri, alive')
    .eq('alive', true)
    .limit(10);
  console.timeEnd('fetch10');
  console.log('Returned rows:', data?.length, error?.message);
  
  if (data?.length > 0) {
    console.log('Sample row:', data[0]);
  }
}

run();

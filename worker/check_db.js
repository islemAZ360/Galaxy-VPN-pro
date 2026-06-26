import { createClient } from '@supabase/supabase-js';

const url = 'https://oneezcaqqqaqsjkuaoor.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uZWV6Y2FxcXFhcXNqa3Vhb29yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDk1OTU3MSwiZXhwIjoyMDk2NTM1NTcxfQ.tJtY2j1iPF2A-1Ha0ixKZugghMnA07RVyfoBfYaZcrY';

const supa = createClient(url, serviceKey);

async function run() {
  console.log('Querying alive candidates with planned count...');
  console.time('planned');
  const { count: countPlanned, error: errPlanned } = await supa
    .from('candidates')
    .select('*', { count: 'planned', head: true })
    .eq('alive', true);
  console.timeEnd('planned');
  console.log('Planned count:', countPlanned, errPlanned?.message);

  console.log('Querying alive candidates with estimated count...');
  console.time('estimated');
  const { count: countEst, error: errEst } = await supa
    .from('candidates')
    .select('*', { count: 'estimated', head: true })
    .eq('alive', true);
  console.timeEnd('estimated');
  console.log('Estimated count:', countEst, errEst?.message);

  console.log('Querying alive candidates with exact count...');
  console.time('exact');
  const { count: countExact, error: errExact } = await supa
    .from('candidates')
    .select('*', { count: 'exact', head: true })
    .eq('alive', true);
  console.timeEnd('exact');
  console.log('Exact count:', countExact, errExact?.message);
}

run();

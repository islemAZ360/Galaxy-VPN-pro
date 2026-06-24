require('dotenv').config({ path: '../worker/.env' });
const { createClient } = require('@supabase/supabase-js');

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: servers } = await supa.from('servers').select('id, network_type, config_uri, name');
  console.log(`Loaded ${servers.length} servers.`);
  
  const lteServers = servers.filter(s => s.network_type.includes('lte'));
  const wifiServers = servers.filter(s => s.network_type.includes('wifi') && !s.network_type.includes('lte'));
  
  console.log(`Total LTE capable: ${lteServers.length}. Total Wi-Fi only: ${wifiServers.length}`);
  
  async function balancePool(pool, geminiTargetCount) {
    const isGem = (s) => s.network_type.includes('gemini');
    const currentGemini = pool.filter(isGem);
    const currentNormal = pool.filter(s => !isGem(s));
    
    let updates = [];
    
    if (currentGemini.length > geminiTargetCount) {
      // Demote some to normal
      const toDemote = currentGemini.length - geminiTargetCount;
      console.log(`Demoting ${toDemote} servers to normal...`);
      for (let i = 0; i < toDemote; i++) {
        const s = currentGemini[i];
        const newType = s.network_type.replace('gemini_', '');
        updates.push({ id: s.id, network_type: newType });
      }
    } else if (currentGemini.length < geminiTargetCount) {
      // Promote some to gemini
      const toPromote = geminiTargetCount - currentGemini.length;
      console.log(`Promoting ${toPromote} servers to gemini...`);
      for (let i = 0; i < toPromote; i++) {
        const s = currentNormal[i];
        const newType = 'gemini_' + s.network_type;
        updates.push({ id: s.id, network_type: newType });
      }
    }
    
    if (updates.length) {
      for (let i = 0; i < updates.length; i += 100) {
        const batch = updates.slice(i, i + 100);
        await supa.from('servers').upsert(batch, { onConflict: 'id' });
      }
    }
  }
  
  await balancePool(lteServers, Math.floor(lteServers.length / 2));
  await balancePool(wifiServers, Math.floor(wifiServers.length / 2));
  
  console.log('Balanced successfully!');
}

run();

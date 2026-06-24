require('dotenv').config({ path: 'worker/.env' });
const { createClient } = require('@supabase/supabase-js');

function renameConfig(uri, name) {
  const scheme = (uri.split('://')[0] || '').toLowerCase();
  try {
    if (scheme === 'vmess') {
      const json = JSON.parse(Buffer.from(uri.slice('vmess://'.length), 'base64').toString('utf8'));
      json.ps = name;
      return 'vmess://' + Buffer.from(JSON.stringify(json), 'utf8').toString('base64');
    }
    const hashIdx = uri.indexOf('#');
    const base = hashIdx >= 0 ? uri.slice(0, hashIdx) : uri;
    return base + '#' + encodeURIComponent(name);
  } catch {
    return uri;
  }
}

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: servers } = await supa.from('servers').select('id, name, config_uri, country');
  console.log('Loaded ' + servers.length + ' servers.');
  
  let updates = [];
  
  for (const s of servers) {
    if (s.name.includes('🚀')) { // Just checking for rocket
      const parts = s.name.split(' | ');
      const base = parts[0];
      const tags = parts.length > 1 ? ' | ' + parts.slice(1).join(' | ') : '';
      
      const numMatch = base.match(/#\d+/);
      const numStr = numMatch ? numMatch[0] : '';
      
      const countryStr = s.country || 'Server';
      
      // Build the new name without the flag emoji at all, just country name + rocket + number
      // So Hupp perfectly detects the country name.
      let newName = (countryStr + ' 🚀 ' + numStr + tags).replace('  ', ' ');
      
      let newUri = renameConfig(s.config_uri, newName);
      
      updates.push({ id: s.id, name: newName, config_uri: newUri });
    } else {
      // Also fix the ones WITHOUT rocket! They currently have 🇦🇱 Albania #1.
      // Let's strip the emoji flag from them too so Hupp has a clean country name first word!
      const parts = s.name.split(' | ');
      const base = parts[0];
      const tags = parts.length > 1 ? ' | ' + parts.slice(1).join(' | ') : '';
      
      const numMatch = base.match(/#\d+/);
      const numStr = numMatch ? numMatch[0] : '';
      
      const countryStr = s.country || 'Server';
      let newName = (countryStr + ' ' + numStr + tags).replace('  ', ' ');
      
      // Only update if it actually changed
      if (newName !== s.name) {
        let newUri = renameConfig(s.config_uri, newName);
        updates.push({ id: s.id, name: newName, config_uri: newUri });
      }
    }
  }
  
  console.log('Found ' + updates.length + ' servers to fix.');
  
  if (updates.length > 0) {
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100);
      await supa.from('servers').upsert(batch, { onConflict: 'id' });
    }
    console.log('Fixed flags successfully!');
  }
}

run();

import { createAdminClient } from '@/lib/supabase/admin';
import { getBalanceModeStatus } from '@/lib/admin-actions';
import { getBalancedType } from '@/lib/balancer';

export const dynamic = 'force-dynamic';

// How often the client (Happ, v2rayN, …) auto-refreshes the subscription, in
// HOURS. Frequent refresh means dead/removed servers leave the user's app fast.
// Tunable via the SUB_UPDATE_INTERVAL_HOURS env var (set 1 for hourly).
const UPDATE_INTERVAL_HOURS = Number(process.env.SUB_UPDATE_INTERVAL_HOURS) || 1;

const TIER_TAGS: Record<string, string> = {
  wifi: ' | WIFI',
  lte: ' | WIFI/LTE',
  gemini_wifi: ' | WIFI/GEMINI',
  gemini_lte: ' | WIFI/LTE/GEMINI',
  whitelist: ' | WIFI/LTE/WhiteList',
  gemini_whitelist: ' | WIFI/LTE/GEMINI/WhiteList',
};

const retag = (name: string, tier: string) => `${(name || '').split(' | ')[0]}${TIER_TAGS[tier] || TIER_TAGS.wifi}`;

function renameConfig(uri: string, name: string): string {
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

// A single "server" the VPN client will display when the subscription is not
// usable — this is how the link is "boobytrapped" after expiry.
function noticeConfig(text: string) {
  const remark = encodeURIComponent(`⛔ GalaxyVPN — ${text}`);
  return `vless://00000000-0000-0000-0000-000000000000@127.0.0.1:1?type=tcp&security=none#${remark}`;
}

// Same as above, but for non-error informational messages (e.g. ID, instructions)
function infoConfig(text: string) {
  const remark = encodeURIComponent(text);
  return `vless://00000000-0000-0000-0000-000000000000@127.0.0.1:1?type=tcp&security=none#${remark}`;
}

function toSubscription(lines: string[], expireUnix?: number, shortId?: string, email?: string, networkType?: string, serverCount?: number) {
  const body = Buffer.from(lines.join('\n'), 'utf8').toString('base64');
  
  const headers: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    // profile-title as base64 prevents encoding issues
    'Profile-Title': `base64:${Buffer.from('GalaxyVPN Pro', 'utf8').toString('base64')}`,
    'Profile-Update-Interval': String(UPDATE_INTERVAL_HOURS),
  };
  
  if (shortId) {
    let netName = 'Wi-Fi';
    if (networkType === 'lte') netName = 'LTE / Wi-Fi';
    if (networkType === 'gemini') netName = 'Gemini (LTE & Wi-Fi)';

    let announceText = `✨ GalaxyVPN Pro ✨\n━━━━━━━━━━━━━━━━━━━━\n`;
    announceText += `👤 ID: ${shortId}\n`;
    if (email) announceText += `📧 Email: ${email}\n`;
    if (networkType) {
      announceText += `📶 Network: ${netName}\n`;
      announceText += `🌍 Servers: ${serverCount || 'Unlimited'}\n`;
    }
    announceText += `━━━━━━━━━━━━━━━━━━━━\n`;
    announceText += `💡 Нажмите кнопку 🔄, если у Вас не работает VPN`;
    
    headers['announce'] = `base64:${Buffer.from(announceText, 'utf8').toString('base64')}`;
    headers['Content-Disposition'] = `attachment; filename="${shortId}"`;
  }

  if (expireUnix) {
    // standard header read by Hiddify / v2ray clients to show expiry
    headers['Subscription-Userinfo'] = `upload=0; download=0; total=0; expire=${expireUnix}`;
  }
  return new Response(body, { headers });
}

function parseDeviceType(ua: string) {
  const lower = ua.toLowerCase();
  if (lower.includes('android')) return 'Android';
  if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ios')) return 'iOS';
  if (lower.includes('windows')) return 'Windows';
  if (lower.includes('macintosh') || lower.includes('mac os')) return 'macOS';
  if (lower.includes('linux')) return 'Linux';
  return 'Unknown';
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supa = createAdminClient();

  const { data: sub } = await supa
    .from('subscriptions')
    .select('id, user_id, status, end_at, server_count, network_type')
    .eq('sub_token', token)
    .maybeSingle();

  if (!sub) {
    return toSubscription([noticeConfig('Invalid subscription link')]);
  }

  const now = Date.now();
  const expired = sub.end_at ? new Date(sub.end_at).getTime() <= now : true;

  // Boobytrap: flip an active-but-past subscription to "expired" and notify.
  if (sub.status === 'active' && expired) {
    await supa.from('subscriptions').update({ status: 'expired' }).eq('id', sub.id);
  }

  // banned user?
  const { data: owner } = await supa
    .from('users')
    .select('email, banned_until')
    .eq('id', sub.user_id)
    .maybeSingle();
  const banned = owner?.banned_until ? new Date(owner.banned_until).getTime() > now : false;

  if (sub.status !== 'active' || expired || banned) {
    const reason = banned ? 'Account suspended' : 'Subscription expired — renew at GalaxyVPN';
    return toSubscription([noticeConfig(reason)]);
  }

  // --- ANTI-SHARING (24H SLIDING WINDOW) ---
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const ua = req.headers.get('user-agent') || 'unknown';
  const cleanIp = ip.split(',')[0].trim();

  // Check active IPs in the last 24h
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentDevices } = await supa
    .from('sub_devices')
    .select('ip_address')
    .eq('subscription_id', sub.id)
    .gte('last_seen_at', oneDayAgo);
    
  const uniqueIps = new Set((recentDevices || []).map(d => d.ip_address));
  uniqueIps.add(cleanIp);
  
  // Track this device (even if we're about to block — so the count stays honest).
  // AWAITED, not fire-and-forget: on Vercel the function can freeze right after the
  // Response is returned, dropping a pending write — which would undercount IPs and
  // silently weaken the limit. onConflict must match the unique index in
  // supabase/sub_devices.sql EXACTLY, with no spaces (PostgREST treats the value as
  // a literal comma-separated column list, so "a, b" would look for a column " b").
  const { error: trackErr } = await supa.from('sub_devices').upsert(
    {
      subscription_id: sub.id,
      ip_address: cleanIp,
      user_agent: ua,
      device_type: parseDeviceType(ua),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'subscription_id,ip_address' }
  );
  if (trackErr) console.error('[sub] device tracking upsert failed:', trackErr.message);

  if (uniqueIps.size > 20) {
    return toSubscription([noticeConfig('Suspended (Exceeded 20 IP Limit in 24h)')]);
  }
  // -----------------------------------------

  // White-list servers are LTE-capable + extra-resilient, so they ship to LTE
  // (and Gemini) subscribers alongside the normal pool.
  let pools = ['wifi']; // fallback
  if (sub.network_type === 'wifi') pools = ['wifi'];
  else if (sub.network_type === 'lte') pools = ['lte', 'whitelist'];
  else if (sub.network_type === 'gemini') pools = ['gemini_wifi', 'gemini_lte', 'gemini_whitelist'];

  const balanceMode = await getBalanceModeStatus();

  // If balance mode is on, we need to fetch the parent pools as well to find the pseudo-balanced servers
  let fetchPools = [...pools];
  if (balanceMode) {
    if (pools.includes('wifi')) fetchPools.push('gemini_wifi');
    if (pools.includes('lte')) fetchPools.push('gemini_lte');
    if (pools.includes('whitelist')) fetchPools.push('gemini_whitelist');
    fetchPools = Array.from(new Set(fetchPools));
  }

  // Fetch up to 4000 servers in parallel to bypass Supabase's 1000 row limit
  const fetchPromises = [];
  for (let i = 0; i < 4; i++) {
    fetchPromises.push(
      supa.from('servers')
        .select('id, name, config_uri, network_type, country, latency_ms')
        .eq('is_working', true)
        .eq('is_deleted', false)
        .in('network_type', fetchPools)
        .range(i * 1000, i * 1000 + 999)
    );
  }
  const results = await Promise.all(fetchPromises);
  const rawServers = results.flatMap(r => r.data || []);

  let servers = rawServers || [];

  // Sort in JS: Prioritize premium network types (whitelist > lte > wifi), then by latency
  const typeWeight: Record<string, number> = {
    whitelist: 3, gemini_whitelist: 3,
    lte: 2, gemini_lte: 2,
    wifi: 1, gemini_wifi: 1,
  };

  servers.sort((a, b) => {
    const weightA = typeWeight[a.network_type] || 0;
    const weightB = typeWeight[b.network_type] || 0;
    if (weightA !== weightB) return weightB - weightA; // Descending weight
    return (a.latency_ms || 9999) - (b.latency_ms || 9999); // Ascending latency
  });

  if (balanceMode) {
    // Apply deterministic balancing
    const filtered: typeof servers = [];
    for (const s of servers) {
      const balancedType = getBalancedType(s.id, s.network_type);
      if (s.name?.includes('🚀')) {
        // If type changed, dynamically rewrite the config_uri to match the new type's tag
        if (balancedType !== s.network_type) {
          const newName = retag(s.name || s.country || 'Unknown', balancedType);
          s.config_uri = renameConfig(s.config_uri, newName);
        }
        filtered.push(s);
      }
    }
    servers = filtered;
  }

  // Country-based Round Robin Distribution
  // Separate into rockets and normals, group by country
  const rocketByCountry: Record<string, typeof servers> = {};
  const normalByCountry: Record<string, typeof servers> = {};
  
  for (const s of servers) {
    const c = s.country || 'Unknown';
    if (s.name?.includes('🚀')) {
      if (!rocketByCountry[c]) rocketByCountry[c] = [];
      rocketByCountry[c].push(s);
    } else {
      if (!normalByCountry[c]) normalByCountry[c] = [];
      normalByCountry[c].push(s);
    }
  }

  const selectedServers: typeof servers = [];
  // Target 3 to 5 rocket servers (but don't exceed the user's total limit)
  const targetRockets = Math.min(sub.server_count, Math.floor(Math.random() * 3) + 3); 
  
  // 1. Pick Rocket Servers
  let added = true;
  const rocketCountries = Object.keys(rocketByCountry);
  while (selectedServers.length < targetRockets && added) {
    added = false;
    for (const c of rocketCountries) {
      if (selectedServers.length >= targetRockets) break;
      if (rocketByCountry[c].length > 0) {
        selectedServers.push(rocketByCountry[c].shift()!);
        added = true;
      }
    }
  }

  // 2. Pick Normal Servers
  added = true;
  const normalCountries = Object.keys(normalByCountry);
  while (selectedServers.length < sub.server_count && added) {
    added = false;
    for (const c of normalCountries) {
      if (selectedServers.length >= sub.server_count) break;
      if (normalByCountry[c].length > 0) {
        selectedServers.push(normalByCountry[c].shift()!);
        added = true;
      }
    }
  }

  // 3. Fill with remaining rockets if we ran out of normal servers
  added = true;
  while (selectedServers.length < sub.server_count && added) {
    added = false;
    for (const c of rocketCountries) {
      if (selectedServers.length >= sub.server_count) break;
      if (rocketByCountry[c].length > 0) {
        selectedServers.push(rocketByCountry[c].shift()!);
        added = true;
      }
    }
  }

  servers = selectedServers;

  const configs = (servers ?? []).map((s) => {
    if (!s.config_uri) return null;
    const properName = retag(s.name || s.country || 'Unknown', s.network_type);
    return renameConfig(s.config_uri, properName);
  }).filter(Boolean) as string[];
  if (configs.length === 0) {
    return toSubscription([noticeConfig('No servers available right now')]);
  }

  const shortId = `usr-${sub.id.split('-')[0].toUpperCase()}`;

  const expireUnix = Math.floor(new Date(sub.end_at as string).getTime() / 1000);

  return toSubscription(configs, expireUnix, shortId, owner?.email, sub.network_type, sub.server_count);
}

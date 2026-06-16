import { createAdminClient } from '@/lib/supabase/admin';
import { getBalanceModeStatus } from '@/lib/admin-actions';
import { getBalancedType } from '@/lib/balancer';

export const dynamic = 'force-dynamic';

// A single "server" the VPN client will display when the subscription is not
// usable — this is how the link is "boobytrapped" after expiry.
function noticeConfig(text: string) {
  const remark = encodeURIComponent(`⛔ GalaxyVPN — ${text}`);
  return `vless://00000000-0000-0000-0000-000000000000@127.0.0.1:1?type=tcp&security=none#${remark}`;
}

function toSubscription(lines: string[], expireUnix?: number) {
  const body = Buffer.from(lines.join('\n'), 'utf8').toString('base64');
  const headers: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Profile-Title': 'GalaxyVPN',
  };
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
    .select('banned_until')
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
  
  // Non-blocking upsert to track devices even if blocked
  supa.from('sub_devices').upsert(
    {
      subscription_id: sub.id,
      ip_address: cleanIp,
      user_agent: ua,
      device_type: parseDeviceType(ua),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'subscription_id, ip_address, user_agent' }
  ).then(() => {});

  if (uniqueIps.size > 20) {
    return toSubscription([noticeConfig('Suspended (Exceeded 20 IP Limit in 24h)')]);
  }
  // -----------------------------------------

  let pools = ['wifi']; // fallback
  if (sub.network_type === 'wifi') pools = ['wifi'];
  else if (sub.network_type === 'lte') pools = ['lte'];
  else if (sub.network_type === 'gemini') pools = ['gemini_wifi', 'gemini_lte'];

  const balanceMode = await getBalanceModeStatus();
  
  // If balance mode is on, we need to fetch the parent pools as well to find the pseudo-balanced servers
  let fetchPools = [...pools];
  if (balanceMode) {
    if (pools.includes('wifi')) fetchPools.push('gemini_wifi');
    if (pools.includes('lte')) fetchPools.push('gemini_lte');
    fetchPools = Array.from(new Set(fetchPools));
  }

  const { data: rawServers } = await supa
    .from('servers')
    .select('id, config_uri, network_type, country')
    .eq('is_working', true)
    .in('network_type', fetchPools)
    .order('latency_ms', { ascending: true, nullsFirst: false })
    .limit(3000); // Fetch a large pool to ensure we can balance by country

  let servers = rawServers || [];

  if (balanceMode) {
    // Apply deterministic balancing
    servers = servers.filter(s => {
      const balancedType = getBalancedType(s.id, s.network_type);
      return pools.includes(balancedType);
    });
  }

  // Country-based Round Robin Distribution
  // Group servers by country to ensure user gets a diverse set of countries
  const serversByCountry: Record<string, typeof servers> = {};
  for (const s of servers) {
    const c = s.country || 'Unknown';
    if (!serversByCountry[c]) serversByCountry[c] = [];
    serversByCountry[c].push(s);
  }

  const selectedServers: typeof servers = [];
  const countryKeys = Object.keys(serversByCountry);
  let added = true;

  while (selectedServers.length < sub.server_count && added) {
    added = false;
    for (const c of countryKeys) {
      if (selectedServers.length >= sub.server_count) break;
      if (serversByCountry[c].length > 0) {
        selectedServers.push(serversByCountry[c].shift()!);
        added = true;
      }
    }
  }

  servers = selectedServers;

  const configs = (servers ?? []).map((s) => s.config_uri).filter(Boolean);
  if (configs.length === 0) {
    return toSubscription([noticeConfig('No servers available right now')]);
  }

  const expireUnix = Math.floor(new Date(sub.end_at as string).getTime() / 1000);

  return toSubscription(configs, expireUnix);
}

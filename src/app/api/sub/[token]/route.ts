import { createAdminClient } from '@/lib/supabase/admin';

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

export async function GET(
  _req: Request,
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

  // Active: hand out the best (lowest-latency) working servers FROM THE POOL the
  // customer paid for. wifi plan → Wi-Fi servers; lte plan → LTE servers (which
  // also work on Wi-Fi). Default to 'wifi' for older rows.
  const pool = ['wifi', 'lte', 'gemini'].includes(sub.network_type) ? sub.network_type : 'wifi';
  const { data: servers } = await supa
    .from('servers')
    .select('config_uri')
    .eq('is_working', true)
    .eq('network_type', pool)
    .order('latency_ms', { ascending: true, nullsFirst: false })
    .limit(sub.server_count);

  const configs = (servers ?? []).map((s) => s.config_uri).filter(Boolean);
  if (configs.length === 0) {
    return toSubscription([noticeConfig('No servers available right now')]);
  }

  const expireUnix = Math.floor(new Date(sub.end_at as string).getTime() / 1000);
  return toSubscription(configs, expireUnix);
}

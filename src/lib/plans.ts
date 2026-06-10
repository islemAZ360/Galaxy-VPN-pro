// Single source of truth for the subscription plans.
// Each duration has two NETWORK variants:
//   - wifi: servers that work on Wi-Fi (cheaper, more servers)
//   - lte:  servers that work on mobile data too (LTE/Wi-Fi; pricier, fewer)
export type NetworkType = 'wifi' | 'lte';

export type PlanVariant = { priceRub: number; serverCount: number };

export type Plan = {
  id: 1 | 2 | 3 | 4;
  durationKey: 'month1' | 'months3' | 'months6' | 'year1';
  durationDays: number;
  wifi: PlanVariant;
  lte: PlanVariant;
};

export const PLANS: Plan[] = [
  { id: 1, durationKey: 'month1',  durationDays: 30,  wifi: { priceRub: 100, serverCount: 10 }, lte: { priceRub: 200, serverCount: 5 } },
  { id: 2, durationKey: 'months3', durationDays: 90,  wifi: { priceRub: 150, serverCount: 20 }, lte: { priceRub: 300, serverCount: 10 } },
  { id: 3, durationKey: 'months6', durationDays: 180, wifi: { priceRub: 300, serverCount: 30 }, lte: { priceRub: 600, serverCount: 15 } },
  { id: 4, durationKey: 'year1',   durationDays: 365, wifi: { priceRub: 450, serverCount: 40 }, lte: { priceRub: 900, serverCount: 20 } },
];

export const getPlan = (id: number) => PLANS.find((p) => p.id === id);

export const isNetworkType = (v: unknown): v is NetworkType => v === 'wifi' || v === 'lte';

// Resolve price + server count for a (plan, network) pair.
export const planVariant = (p: Plan, net: NetworkType): PlanVariant => p[net];

// Single source of truth for the four subscription plans.
export type Plan = {
  id: 1 | 2 | 3 | 4;
  durationKey: 'month1' | 'months3' | 'months6' | 'year1';
  durationDays: number;
  serverCount: number;
  priceRub: number;
};

export const PLANS: Plan[] = [
  { id: 1, durationKey: 'month1', durationDays: 30, serverCount: 10, priceRub: 200 },
  { id: 2, durationKey: 'months3', durationDays: 90, serverCount: 20, priceRub: 300 },
  { id: 3, durationKey: 'months6', durationDays: 180, serverCount: 30, priceRub: 600 },
  { id: 4, durationKey: 'year1', durationDays: 365, serverCount: 40, priceRub: 900 },
];

export const getPlan = (id: number) => PLANS.find((p) => p.id === id);

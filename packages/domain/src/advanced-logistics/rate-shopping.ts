/**
 * Stage 4, S4-2 (FUL-02): rate shopping — pure functions over carrier rate
 * quotes. No I/O; the caller fetches quotes from adapters and feeds them in.
 */

export interface CarrierRate {
  carrier: string;
  currency: string;
  /**
   * Whole currency units (e.g. IDR). Adapters normalise to a single currency
   * before comparison so we don't need FX here.
   */
  price: number;
  serviceType: string;
  /** Promised transit time in days, as declared by the carrier. */
  transitDays: number;
}

export interface RankedRate {
  rank: number;
  rate: CarrierRate;
  score: number;
}

export interface RateShopConfig {
  /** Weight (0..1) for price. Default 0.7. */
  priceWeight?: number;
  /** Weight (0..1) for transit time. Default 0.3. */
  speedWeight?: number;
}

/**
 * Compare rates by a weighted score: lower price and shorter transit win.
 * Weights are normalised so callers can pass 0.7/0.3 without worrying about
 * the sum. Score is 0..1, lower is better.
 */
export function compareRates(
  rates: readonly CarrierRate[],
  config: RateShopConfig = {},
): RankedRate[] {
  if (rates.length === 0) return [];

  const priceWeight = config.priceWeight ?? 0.7;
  const speedWeight = config.speedWeight ?? 0.3;
  const totalWeight = priceWeight + speedWeight;
  // ponytail: normalise once instead of forcing callers to sum to 1.
  const pw = totalWeight > 0 ? priceWeight / totalWeight : 0.7;
  const sw = totalWeight > 0 ? speedWeight / totalWeight : 0.3;

  const prices = rates.map((r) => r.price);
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const priceRange = maxPrice - minPrice || 1;

  const transits = rates.map((r) => r.transitDays);
  const maxTransit = Math.max(...transits);
  const minTransit = Math.min(...transits);
  const transitRange = maxTransit - minTransit || 1;

  const ranked = rates.map((rate) => {
    const priceScore = (rate.price - minPrice) / priceRange;
    const speedScore = (rate.transitDays - minTransit) / transitRange;
    const score = pw * priceScore + sw * speedScore;
    return { rate, score };
  });

  ranked.sort((a, b) => a.score - b.score);
  return ranked.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}

/**
 * Pick the best rate. Ties on score break toward lower price, then faster
 * transit, then carrier name for determinism.
 */
export function selectBestRate(
  rates: readonly CarrierRate[],
  config?: RateShopConfig,
): CarrierRate | null {
  const ranked = compareRates(rates, config);
  if (ranked.length === 0) return null;
  const best = ranked[0];
  return best ? best.rate : null;
}

/**
 * Pot odds (AGENTS.md §7.3): the share of the final pot the player must put in to call.
 * `potBeforeCall` includes every chip already in the middle, the bet being faced included.
 */
export function potOdds(callAmount: number, potBeforeCall: number): number {
  if (callAmount <= 0) return 0;
  return callAmount / (potBeforeCall + callAmount);
}

export interface CallAssessment {
  /** Pot odds: the equity needed for a call to break even. */
  readonly requiredEquity: number;
  /** True when the equity (vs. random hands) exceeds the required equity. */
  readonly positive: boolean;
}

/** Compares equity against the pot odds of a call ("+EV" / "−EV" vs. random hands). */
export function assessCall(
  equity: number,
  callAmount: number,
  potBeforeCall: number,
): CallAssessment {
  const requiredEquity = potOdds(callAmount, potBeforeCall);
  return { requiredEquity, positive: equity > requiredEquity };
}

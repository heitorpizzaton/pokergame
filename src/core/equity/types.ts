/** Share-of-pot statistics for one player (AGENTS.md §7.2). Values are probabilities in [0, 1]. */
export interface EquityResult {
  /** Probability of winning outright. */
  readonly win: number;
  /** Probability of tying for the best hand. */
  readonly tie: number;
  /** Expected share of the pot, counting ties fractionally (win + split shares). */
  readonly equity: number;
  /** Number of runouts (exact) or simulations (Monte Carlo) behind the numbers. */
  readonly samples: number;
  /** True for exact enumeration, false for a Monte Carlo estimate. */
  readonly exact: boolean;
  /** Standard error of `equity` (0 when exact). */
  readonly standardError: number;
}

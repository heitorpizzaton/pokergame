/**
 * Headless NPC-only simulation with the real engine and AI (AGENTS.md §8.5). Every hand starts
 * from fresh 100 BB stacks with a rotating button (a "cash game" view that measures win rates
 * without freezeout end-game effects); brains keep learning across hands.
 */
import { NpcBrain, randomStyles, type StyleId } from '../src/ai/index.ts';
import type { DecisionInfo } from '../src/ai/postflop/decide.ts';
import {
  EngineError,
  type EngineEvent,
  type GameState,
  PokerEngine,
} from '../src/core/engine/index.ts';
import { SeededRng } from '../src/core/rng/seeded-rng.ts';
import type { PlayerAction, PlayerView } from '../src/core/view/index.ts';

export type BotId = 'allInBot' | 'foldBot' | 'callBot' | 'folderBot';
export type SeatKind = StyleId | BotId;

export interface SimOptions {
  readonly hands: number;
  readonly players: number;
  /** Fixed seat kinds, or 'random' to redraw a realistic mix every `redrawEvery` hands. */
  readonly seats: readonly SeatKind[] | 'random';
  readonly seed: number;
  readonly iterations?: number;
  readonly redrawEvery?: number;
  readonly bigBlind?: number;
  readonly stackBbs?: number;
  /** Called after every NPC decision (tests use it to check sanity rules). */
  readonly onDecision?: (
    view: PlayerView,
    action: PlayerAction,
    kind: SeatKind,
    info: DecisionInfo | null,
  ) => void;
}

export interface KindStats {
  hands: number;
  vpip: number;
  pfr: number;
  aggressive: number;
  passive: number;
  sawFlop: number;
  showdowns: number;
  netBbs: number;
  decisions: number;
  decisionMs: number;
  maxDecisionMs: number;
  /** Bluffing statistics (AGENTS.md §18.5), per street where it applies. */
  pureOpportunities: StreetCounts;
  pureBluffs: StreetCounts;
  riverBets: number;
  riverPureBluffs: number;
  cbetSpots: number;
  cbets: number;
  bluffRaiseOpportunities: number;
  bluffRaises: number;
  pureBluffWins: number;
}

export interface StreetCounts {
  flop: number;
  turn: number;
  river: number;
}

export interface SimResult {
  readonly byKind: Record<string, KindStats>;
  readonly hands: number;
  readonly illegalActions: number;
}

export function newStats(): KindStats {
  return {
    hands: 0,
    vpip: 0,
    pfr: 0,
    aggressive: 0,
    passive: 0,
    sawFlop: 0,
    showdowns: 0,
    netBbs: 0,
    decisions: 0,
    decisionMs: 0,
    maxDecisionMs: 0,
    pureOpportunities: { flop: 0, turn: 0, river: 0 },
    pureBluffs: { flop: 0, turn: 0, river: 0 },
    riverBets: 0,
    riverPureBluffs: 0,
    cbetSpots: 0,
    cbets: 0,
    bluffRaiseOpportunities: 0,
    bluffRaises: 0,
    pureBluffWins: 0,
  };
}

/** Bluffing rates (§18.2): see docs/AI.md for the exact definitions. */
export function bluffStats(s: KindStats) {
  const rate = (a: number, b: number) => a / Math.max(1, b);
  return {
    pureFlop: rate(s.pureBluffs.flop, s.pureOpportunities.flop),
    pureTurn: rate(s.pureBluffs.turn, s.pureOpportunities.turn),
    pureRiver: rate(s.pureBluffs.river, s.pureOpportunities.river),
    riverBluffShare: rate(s.riverPureBluffs, s.riverBets),
    cbet: rate(s.cbets, s.cbetSpots),
    bluffRaise: rate(s.bluffRaises, s.bluffRaiseOpportunities),
    bluffSuccess: rate(s.pureBluffWins, s.pureBluffs.flop + s.pureBluffs.turn + s.pureBluffs.river),
    samples: {
      flop: s.pureOpportunities.flop,
      turn: s.pureOpportunities.turn,
      river: s.pureOpportunities.river,
      riverBets: s.riverBets,
      cbetSpots: s.cbetSpots,
    },
  };
}

export function derived(s: KindStats) {
  const hands = Math.max(1, s.hands);
  return {
    vpip: s.vpip / hands,
    pfr: s.pfr / hands,
    af: s.aggressive / Math.max(1, s.passive),
    bbPer100: (s.netBbs / hands) * 100,
    wtsd: s.showdowns / Math.max(1, s.sawFlop),
    avgMs: s.decisionMs / Math.max(1, s.decisions),
    maxMs: s.maxDecisionMs,
  };
}

function botAction(kind: BotId, view: PlayerView): PlayerAction {
  const legal = view.legal;
  if (!legal) throw new Error('not our turn');
  if (kind === 'allInBot') {
    if (legal.canBet || legal.canRaise) return { type: 'allIn' };
    return legal.canCheck ? { type: 'check' } : { type: 'call' };
  }
  if (kind === 'folderBot') {
    // Sees every flop, then folds to any bet (maximum fold equity for the NPCs).
    if (legal.canCheck) return { type: 'check' };
    return view.street === 'preflop' ? { type: 'call' } : { type: 'fold' };
  }
  if (kind === 'callBot') {
    // A scripted calling station: never bets or raises, calls every bet.
    return legal.canCheck ? { type: 'check' } : { type: 'call' };
  }
  return legal.canCheck ? { type: 'check' } : { type: 'fold' };
}

export function runSim(options: SimOptions): SimResult {
  const { hands, players, seed } = options;
  const bigBlind = options.bigBlind ?? 100;
  const stack = (options.stackBbs ?? 100) * bigBlind;
  const deckRng = new SeededRng(seed);
  const mixRng = new SeededRng(seed + 1);
  const byKind: Record<string, KindStats> = {};
  const redrawEvery = options.redrawEvery ?? 250;
  let illegalActions = 0;
  let kinds: SeatKind[] = [];
  let brains: (NpcBrain | null)[] = [];

  const assign = (handIndex: number): void => {
    kinds = options.seats === 'random' ? randomStyles(players, mixRng) : [...options.seats];
    brains = kinds.map((kind, seat) =>
      kind === 'allInBot' || kind === 'foldBot' || kind === 'callBot' || kind === 'folderBot'
        ? null
        : new NpcBrain(seat, kind, new SeededRng(seed * 1000 + handIndex * 10 + seat), {
            iterations: options.iterations ?? 250,
            budgetMs: 1_000,
          }),
    );
  };

  let button = players - 1;
  for (let h = 0; h < hands; h++) {
    if (h === 0 || (options.seats === 'random' && h % redrawEvery === 0)) assign(h);
    const snapshot: GameState = {
      config: {
        players: kinds.map((k, i) => ({ name: `${k}${i}` })),
        startingStack: stack,
        smallBlind: bigBlind / 2,
        bigBlind,
      },
      seats: kinds.map((k, i) => ({
        name: `${k}${i}`,
        stack,
        autoMuck: true,
        eliminated: false,
        place: null,
      })),
      handNumber: h,
      button,
      lastBigBlind: null,
      hand: null,
      shownHands: [],
      finished: false,
    };
    const engine = PokerEngine.restore(snapshot, deckRng);
    const events: EngineEvent[] = engine.dispatch({ type: 'startHand' });
    const pendingBluffs: { seat: number; index: number }[] = [];
    const start = engine.state.hand?.button;
    if (start !== undefined) button = start;

    while (engine.isHandInProgress) {
      const seat = engine.state.hand?.toAct;
      if (seat === null || seat === undefined) break;
      const view = engine.viewFor(seat);
      const kind = kinds[seat] as SeatKind;
      const brain = brains[seat];
      const t0 = performance.now();
      const decision = brain ? brain.decideWithInfo(view) : null;
      const action = decision ? decision.action : botAction(kind as BotId, view);
      const ms = performance.now() - t0;
      options.onDecision?.(view, action, kind, decision?.info ?? null);
      const stats = (byKind[kind] ??= newStats());
      const info = decision?.info;
      if (info) {
        const aggressive =
          action.type === 'bet' || action.type === 'raise' || action.type === 'allIn';
        if (info.opportunity && info.betClass === 'pureBluff') {
          stats.pureOpportunities[info.street]++;
          if (aggressive) {
            stats.pureBluffs[info.street]++;
            pendingBluffs.push({ seat, index: engine.state.hand?.actions.length ?? 0 });
          }
        }
        if (info.street === 'river' && aggressive) {
          stats.riverBets++;
          if (info.betClass === 'pureBluff') stats.riverPureBluffs++;
        }
        if (info.cbetSpot) {
          stats.cbetSpots++;
          if (aggressive) stats.cbets++;
        }
        if (info.opportunity && info.facingBet) {
          stats.bluffRaiseOpportunities++;
          if (aggressive && info.bluffed) stats.bluffRaises++;
        }
      }
      stats.decisions++;
      stats.decisionMs += ms;
      stats.maxDecisionMs = Math.max(stats.maxDecisionMs, ms);
      try {
        events.push(...engine.dispatch({ type: 'act', seat, action }));
      } catch (error) {
        if (!(error instanceof EngineError)) throw error;
        illegalActions++;
        const legal = view.legal;
        events.push(
          ...engine.dispatch({
            type: 'act',
            seat,
            action: legal?.canCheck ? { type: 'check' } : { type: 'fold' },
          }),
        );
      }
    }

    // Statistics per seat.
    const actions = engine.state.hand?.actions ?? [];
    // A pure bluff succeeds when nobody calls or raises it and everyone else folds.
    for (const bluff of pendingBluffs) {
      const after = actions.slice(bluff.index + 1);
      const answered = after.some(
        (a) =>
          a.seat !== bluff.seat && (a.kind === 'call' || a.kind === 'bet' || a.kind === 'raise'),
      );
      const players = engine.state.hand?.players ?? [];
      const alone = players.every((p) => p === null || p.seat === bluff.seat || p.folded);
      if (!answered && alone) {
        const k = kinds[bluff.seat] as SeatKind;
        (byKind[k] ??= newStats()).pureBluffWins++;
      }
    }
    kinds.forEach((kind, seat) => {
      const s = (byKind[kind] ??= newStats());
      s.hands++;
      const pre = actions.filter((a) => a.seat === seat && a.street === 'preflop');
      if (pre.some((a) => a.kind === 'call' || a.kind === 'bet' || a.kind === 'raise')) s.vpip++;
      if (pre.some((a) => a.kind === 'bet' || a.kind === 'raise')) s.pfr++;
      for (const a of actions) {
        if (a.seat !== seat || a.street === 'preflop') continue;
        if (a.kind === 'bet' || a.kind === 'raise') s.aggressive++;
        else if (a.kind === 'call') s.passive++;
      }
      const hand = engine.state.hand;
      const player = hand?.players[seat];
      const boardSeen = (hand?.board.length ?? 0) >= 3;
      if (
        player &&
        boardSeen &&
        (!player.folded || actions.some((a) => a.seat === seat && a.street !== 'preflop'))
      ) {
        s.sawFlop++;
      }
      if (events.some((e) => (e.type === 'Showdown' || e.type === 'Mucked') && e.seat === seat))
        s.showdowns++;
      s.netBbs += ((engine.state.seats[seat]?.stack ?? stack) - stack) / bigBlind;
    });
    brains.forEach((brain, seat) => brain?.observeHandEnd(engine.viewFor(seat)));
  }
  return { byKind, hands, illegalActions };
}

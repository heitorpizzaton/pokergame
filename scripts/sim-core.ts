/**
 * Headless NPC-only simulation with the real engine and AI (AGENTS.md §8.5). Every hand starts
 * from fresh 100 BB stacks with a rotating button (a "cash game" view that measures win rates
 * without freezeout end-game effects); brains keep learning across hands.
 */
import { NpcBrain, randomStyles, type StyleId } from '../src/ai/index.ts';
import {
  EngineError,
  type EngineEvent,
  type GameState,
  PokerEngine,
} from '../src/core/engine/index.ts';
import { SeededRng } from '../src/core/rng/seeded-rng.ts';
import type { PlayerAction, PlayerView } from '../src/core/view/index.ts';

export type BotId = 'allInBot' | 'foldBot';
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
  readonly onDecision?: (view: PlayerView, action: PlayerAction, kind: SeatKind) => void;
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
}

export interface SimResult {
  readonly byKind: Record<string, KindStats>;
  readonly hands: number;
  readonly illegalActions: number;
}

function newStats(): KindStats {
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
      kind === 'allInBot' || kind === 'foldBot'
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
    const start = engine.state.hand?.button;
    if (start !== undefined) button = start;

    while (engine.isHandInProgress) {
      const seat = engine.state.hand?.toAct;
      if (seat === null || seat === undefined) break;
      const view = engine.viewFor(seat);
      const kind = kinds[seat] as SeatKind;
      const brain = brains[seat];
      const t0 = performance.now();
      const action = brain ? brain.decide(view) : botAction(kind as BotId, view);
      const ms = performance.now() - t0;
      options.onDecision?.(view, action, kind);
      const stats = (byKind[kind] ??= newStats());
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

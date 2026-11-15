import { z } from 'zod';
import {
  coreStateSchema,
  coreView,
  defineEngine,
  assertRule,
  requireTurn,
  status,
  shuffle,
  type RandomSource,
} from '../../engine/types.js';
const colorSchema = z.enum(['A', 'B', 'C', 'D']),
  cardSchema = z.object({
    id: z.string(),
    color: z.enum(['A', 'B', 'C', 'D', '*']),
    value: z.enum([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      'skip',
      'reverse',
      'draw2',
      'wild',
      'wild4',
    ]),
  });
export type FrenzyCard = z.infer<typeof cardSchema>;
export const frenzyOptions = z
  .object({
    stackDrawTwo: z.boolean().default(false),
    strictWildFour: z.boolean().default(true),
    challengeWildFour: z.boolean().default(false),
    pointsMode: z.boolean().default(false),
    targetScore: z.number().int().min(100).max(1000).default(500),
  })
  .strict();
const stateSchema = coreStateSchema.extend({
  hands: z.array(z.array(cardSchema)),
  deck: z.array(cardSchema),
  discard: z.array(cardSchema).min(1),
  color: colorSchema,
  direction: z.union([z.literal(1), z.literal(-1)]),
  drawnId: z.string().nullable(),
  pendingDraw: z.number().int().nonnegative(),
  lastCardPlayer: z.string().nullable(),
  announcedSeat: z.number().int().nullable(),
  awaitingColor: z.boolean(),
  challenge: z
    .object({ offender: z.number().int(), challenger: z.number().int(), hadColor: z.boolean() })
    .nullable(),
  winnerPending: z.string().nullable(),
  round: z.number().int().positive(),
  scores: z.array(z.number().nonnegative()),
  options: frenzyOptions,
  notice: z.string().nullable(),
});
const actionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('play'),
      cardId: z.string().max(12),
      color: colorSchema.optional(),
      announce: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal('draw') }).strict(),
  z.object({ type: z.literal('pass') }).strict(),
  z.object({ type: z.literal('announce') }).strict(),
  z.object({ type: z.literal('catch'), target: z.string() }).strict(),
  z.object({ type: z.literal('challenge') }).strict(),
  z.object({ type: z.literal('chooseColor'), color: colorSchema }).strict(),
]);
export type FrenzyState = z.infer<typeof stateSchema>;
type Action = z.infer<typeof actionSchema>;
export function createDeck(): FrenzyCard[] {
  const cards: FrenzyCard[] = [];
  const add = (color: FrenzyCard['color'], value: FrenzyCard['value']) =>
    cards.push({ id: `c${cards.length}`, color, value });
  for (const color of colorSchema.options) {
    add(color, '0');
    for (const value of [
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      'skip',
      'reverse',
      'draw2',
    ] as const) {
      add(color, value);
      add(color, value);
    }
  }
  for (let i = 0; i < 4; i++) {
    add('*', 'wild');
    add('*', 'wild4');
  }
  return cards;
}
export const cardPoints = (card: FrenzyCard) =>
  card.color === '*'
    ? 50
    : ['skip', 'reverse', 'draw2'].includes(card.value)
      ? 20
      : Number(card.value);
const nextSeat = (s: FrenzyState, steps = 1) => {
  let seat = s.turn;
  for (let i = 0; i < steps; i++)
    do {
      seat = (seat + s.direction + s.players.length) % s.players.length;
    } while (s.forfeited?.includes(s.players[seat]!));
  return seat;
};
function take(s: FrenzyState, seat: number, count: number, rng: RandomSource) {
  const drawn: FrenzyCard[] = [];
  for (let i = 0; i < count; i++) {
    if (s.deck.length === 0 && s.discard.length > 1) {
      s.deck = shuffle(s.discard.slice(0, -1), rng);
      s.discard = s.discard.slice(-1);
    }
    const card = s.deck.pop();
    if (!card) break;
    s.hands[seat]!.push(card);
    drawn.push(card);
  }
  return drawn;
}
function playable(s: FrenzyState, seat: number, card: FrenzyCard) {
  if (s.pendingDraw) return s.options.stackDrawTwo && card.value === 'draw2';
  if (
    card.value === 'wild4' &&
    s.options.strictWildFour &&
    !s.options.challengeWildFour &&
    s.hands[seat]!.some((c) => c.color === s.color)
  )
    return false;
  const top = s.discard.at(-1)!;
  return card.color === '*' || card.color === s.color || card.value === top.value;
}
function legal(s: FrenzyState, id: string): Action[] {
  if (s.finished || s.forfeited?.includes(id)) return [];
  const seat = s.players.indexOf(id);
  if (seat < 0) return [];
  const actions: Action[] = [];
  if (s.lastCardPlayer && s.lastCardPlayer !== id)
    actions.push({ type: 'catch', target: s.lastCardPlayer });
  if (s.lastCardPlayer === id) actions.push({ type: 'announce' });
  if (s.turn !== seat) return actions;
  if (s.awaitingColor) return colorSchema.options.map((color) => ({ type: 'chooseColor', color }));
  if (s.challenge) return [{ type: 'draw' }, { type: 'challenge' }];
  if (s.hands[seat]!.length === 2 && s.announcedSeat !== seat && !s.drawnId && !s.pendingDraw)
    actions.push({ type: 'announce' });
  const cards = s.hands[seat]!.filter(
    (card) => (!s.drawnId || s.drawnId === card.id) && playable(s, seat, card),
  );
  for (const card of cards) {
    if (card.color === '*')
      for (const color of colorSchema.options)
        actions.push({ type: 'play', cardId: card.id, color });
    else actions.push({ type: 'play', cardId: card.id });
  }
  if (s.drawnId) actions.push({ type: 'pass' });
  else if (s.pendingDraw || cards.length === 0) actions.push({ type: 'draw' });
  return actions;
}
function fresh(
  players: string[],
  options: z.infer<typeof frenzyOptions>,
  rng: RandomSource,
): FrenzyState {
  const deck = shuffle(createDeck(), rng),
    hands = players.map(() => [] as FrenzyCard[]);
  for (let i = 0; i < 7; i++) for (const hand of hands) hand.push(deck.pop()!);
  let top = deck.pop()!;
  if (top.value === 'wild4') {
    const index = deck.findIndex((c) => c.value !== 'wild4'),
      replacement = deck[index]!;
    deck[index] = top;
    top = replacement;
    const mixed = shuffle(deck, rng);
    deck.splice(0, deck.length, ...mixed);
  }
  const s: FrenzyState = {
    players,
    turn: 0,
    moves: 0,
    finished: false,
    ranking: [],
    hands,
    deck,
    discard: [top],
    color: top.color === '*' ? 'A' : top.color,
    direction: 1,
    drawnId: null,
    pendingDraw: 0,
    lastCardPlayer: null,
    announcedSeat: null,
    awaitingColor: top.value === 'wild',
    challenge: null,
    winnerPending: null,
    round: 1,
    scores: players.map(() => 0),
    options,
    notice: null,
  };
  if (top.value === 'skip') s.turn = 1;
  if (top.value === 'reverse') {
    s.direction = -1;
    s.turn = players.length - 1;
  }
  if (top.value === 'draw2') {
    take(s, 0, 2, rng);
    s.turn = 1;
  }
  return s;
}
function finishRound(s: FrenzyState, winner: string, rng: RandomSource): FrenzyState {
  const seat = s.players.indexOf(winner),
    points = s.hands.reduce((sum, hand) => sum + hand.reduce((a, c) => a + cardPoints(c), 0), 0);
  s.scores[seat]! += points;
  if (!s.options.pointsMode || s.scores[seat]! >= s.options.targetScore) {
    s.finished = true;
    s.ranking = [
      winner,
      ...s.players
        .filter((id) => id !== winner)
        .sort((a, b) =>
          s.options.pointsMode
            ? s.scores[s.players.indexOf(b)]! - s.scores[s.players.indexOf(a)]!
            : s.hands[s.players.indexOf(a)]!.reduce((n, c) => n + cardPoints(c), 0) -
              s.hands[s.players.indexOf(b)]!.reduce((n, c) => n + cardPoints(c), 0),
        ),
    ];
    return s;
  }
  const next = {
    ...fresh([...s.players], s.options, rng),
    moves: s.moves,
    scores: [...s.scores],
    round: s.round + 1,
    forfeited: [...(s.forfeited ?? [])],
  };
  for (const id of next.forfeited) {
    const index = next.players.indexOf(id);
    next.deck.push(...next.hands[index]!);
    next.hands[index] = [];
  }
  next.deck = shuffle(next.deck, rng);
  if (next.forfeited.includes(next.players[next.turn]!)) next.turn = nextSeat(next);
  return next;
}
export const carteFrenesie = defineEngine<FrenzyState, z.infer<typeof frenzyOptions>, Action>({
  id: 'carte-frenesie',
  name: 'Carte Frénésie',
  minPlayers: 2,
  maxPlayers: 8,
  defaultOptions: frenzyOptions.parse({}),
  stateSchema,
  optionsSchema: frenzyOptions,
  actionSchema,
  createInitialState: fresh,
  forfeit(s, id, rng) {
    const seat = s.players.indexOf(id);
    s.deck = shuffle([...s.deck, ...s.hands[seat]!], rng);
    s.hands[seat] = [];
    if (s.lastCardPlayer === id) s.lastCardPlayer = null;
    if (s.announcedSeat === seat) s.announcedSeat = null;
    if (s.challenge && (s.challenge.offender === seat || s.challenge.challenger === seat)) {
      s.challenge = null;
      s.winnerPending = null;
    }
    if (s.turn === seat) {
      s.turn = nextSeat(s);
      s.pendingDraw = 0;
      s.drawnId = null;
    }
    return s;
  },
  getLegalActions: legal,
  applyAction(state, id, action, rng) {
    const allowed = legal(state, id);
    const normalized =
      action.type === 'play'
        ? { type: 'play', cardId: action.cardId, ...(action.color ? { color: action.color } : {}) }
        : action;
    assertRule(allowed.some((a) => JSON.stringify(a) === JSON.stringify(normalized)));
    const s = structuredClone(state);
    s.moves++;
    s.notice = null;
    const seat = s.players.indexOf(id);
    if (action.type === 'catch') {
      const target = s.players.indexOf(action.target);
      assertRule(s.lastCardPlayer === action.target && target >= 0);
      take(s, target, 2, rng);
      s.lastCardPlayer = null;
      return s;
    }
    if (action.type === 'announce') {
      if (s.lastCardPlayer === id) s.lastCardPlayer = null;
      else s.announcedSeat = seat;
      return s;
    }
    requireTurn(s, id);
    if (action.type === 'chooseColor') {
      s.color = action.color;
      s.awaitingColor = false;
      return s;
    }
    if (s.challenge) {
      const challenge = s.challenge;
      s.challenge = null;
      s.lastCardPlayer = null;
      s.drawnId = null;
      if (action.type === 'challenge' && challenge.hadColor) {
        take(s, challenge.offender, 4, rng);
        s.winnerPending = null;
        s.notice = 'challengeWon';
        return s;
      }
      take(s, seat, action.type === 'challenge' ? 6 : 4, rng);
      s.notice = action.type === 'challenge' ? 'challengeLost' : 'penaltyAccepted';
      s.turn = nextSeat(s);
      if (s.winnerPending) return finishRound(s, s.winnerPending, rng);
      return s;
    }
    s.lastCardPlayer = null;
    if (action.type === 'pass') {
      assertRule(s.drawnId);
      s.drawnId = null;
      s.announcedSeat = null;
      s.turn = nextSeat(s);
      return s;
    }
    if (action.type === 'draw') {
      if (s.pendingDraw) {
        take(s, seat, s.pendingDraw, rng);
        s.pendingDraw = 0;
        s.drawnId = null;
        s.announcedSeat = null;
        s.turn = nextSeat(s);
        return s;
      }
      const drawn = take(s, seat, 1, rng)[0];
      if (drawn && playable(s, seat, drawn)) s.drawnId = drawn.id;
      else {
        s.drawnId = null;
        s.announcedSeat = null;
        s.turn = nextSeat(s);
      }
      return s;
    }
    assertRule(action.type === 'play');
    const hand = s.hands[seat]!,
      index = hand.findIndex((c) => c.id === action.cardId),
      card = hand[index]!;
    assertRule(card);
    const hadColor = s.options.strictWildFour && hand.some((c) => c.color === s.color),
      announced = s.announcedSeat === seat || action.announce === true;
    hand.splice(index, 1);
    s.discard.push(card);
    s.color = card.color === '*' ? action.color! : card.color;
    s.drawnId = null;
    s.announcedSeat = null;
    if (hand.length === 1 && !announced) s.lastCardPlayer = id;
    if (card.value === 'reverse') s.direction = s.direction === 1 ? -1 : 1;
    if (card.value === 'wild4' && s.options.challengeWildFour) {
      s.turn = nextSeat(s);
      s.challenge = { offender: seat, challenger: s.turn, hadColor };
      if (hand.length === 0) s.winnerPending = id;
      return s;
    }
    if (card.value === 'draw2') {
      s.turn = nextSeat(s);
      s.pendingDraw += 2;
      if (!s.options.stackDrawTwo || hand.length === 0) {
        take(s, s.turn, s.pendingDraw, rng);
        s.pendingDraw = 0;
        s.turn = nextSeat(s);
      }
    } else if (card.value === 'wild4') {
      s.turn = nextSeat(s);
      take(s, s.turn, 4, rng);
      s.turn = nextSeat(s);
    } else
      s.turn = nextSeat(
        s,
        card.value === 'skip' || (card.value === 'reverse' && s.players.length === 2) ? 2 : 1,
      );
    if (hand.length === 0) return finishRound(s, id, rng);
    return s;
  },
  getPlayerView(s, id) {
    const seat = s.players.indexOf(id),
      top = s.discard.at(-1)!;
    return {
      ...coreView(s, 'carte-frenesie', legal(s, id)),
      hand: s.hands[seat]!.map((c) => ({ ...c })),
      counts: s.hands.map((h) => h.length),
      top: { color: top.color, value: top.value },
      color: s.color,
      direction: s.direction,
      pendingDraw: s.pendingDraw,
      lastCardPlayer: s.lastCardPlayer,
      round: s.round,
      scores: [...s.scores],
      ...(s.notice ? { notice: s.notice } : {}),
    };
  },
  getStatus: status,
  onTimeout(s, id) {
    return legal(s, id).find((a) => a.type !== 'catch' && a.type !== 'announce') ?? null;
  },
  bot(s, id, rng) {
    const actions = legal(s, id),
      seat = s.players.indexOf(id),
      announce = actions.find((a) => a.type === 'announce');
    if (announce) return announce;
    const catchAction = actions.find((a) => a.type === 'catch');
    if (catchAction) return catchAction;
    const colors = colorSchema.options
      .map((color) => ({ color, count: s.hands[seat]!.filter((c) => c.color === color).length }))
      .sort((a, b) => b.count - a.count);
    const plays = actions.filter(
      (a): a is Extract<Action, { type: 'play' }> =>
        a.type === 'play' && (!a.color || a.color === colors[0]!.color),
    );
    if (plays.length)
      return plays.sort(
        (a, b) =>
          cardPoints(s.hands[seat]!.find((c) => c.id === b.cardId)!) -
          cardPoints(s.hands[seat]!.find((c) => c.id === a.cardId)!),
      )[0]!;
    const choose = actions.find((a) => a.type === 'chooseColor' && a.color === colors[0]!.color);
    if (choose) return choose;
    if (actions.some((a) => a.type === 'challenge')) return actions[rng.int(actions.length)]!;
    return actions.find((a) => a.type !== 'catch') ?? null;
  },
});

import { z } from 'zod';
import {
  assertRule,
  coreStateSchema,
  coreView,
  defineEngine,
  requireTurn,
  shuffle,
  status,
} from '../../engine/types.js';
import { estateBoard, estateCards, estateRents, housePrice } from './board.js';

const auctionSchema = z.object({
  property: z.number(),
  price: z.number(),
  bidder: z.number().nullable(),
  eligible: z.array(z.number()),
  resume: z.number(),
});
export const estateStateSchema = coreStateSchema.extend({
  positions: z.array(z.number().int().min(0).max(39)),
  money: z.array(z.number().int().nonnegative()),
  owners: z.array(z.number().int().min(-1)).length(40),
  houses: z.array(z.number().int().min(0).max(5)).length(40),
  mortgaged: z.array(z.boolean()).length(40),
  jail: z.array(z.number().int().min(-1).max(3)),
  jailCards: z.array(z.number().int().nonnegative()),
  heldCards: z.array(z.array(z.enum(['dalmatian', 'golden']))),
  phase: z.enum(['roll', 'offer', 'end', 'debt', 'auction', 'trade']),
  dice: z.array(z.number().int().min(1).max(6)).length(2),
  trade: z
    .object({
      from: z.number(),
      to: z.number(),
      give: z.number(),
      take: z.number(),
      cash: z.number(),
      resume: z.enum(['roll', 'end']),
    })
    .nullable(),
  doubles: z.number().int().min(0).max(3),
  extraRoll: z.boolean(),
  eliminated: z.array(z.number()),
  debt: z.number().int().nonnegative(),
  creditor: z.number().int().min(-1),
  auction: auctionSchema.nullable(),
  decks: z.object({ dalmatian: z.array(z.number()), golden: z.array(z.number()) }),
  cursors: z.object({ dalmatian: z.number(), golden: z.number() }),
  lastCard: z.object({ deck: z.enum(['dalmatian', 'golden']), index: z.number() }).nullable(),
  log: z.array(z.string()),
  completedTurns: z.number().int().nonnegative(),
  roundLimit: z.number().int().min(10).max(100),
});
export type EstateState = z.infer<typeof estateStateSchema>;
const actionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.enum([
        'roll',
        'buy',
        'auction',
        'pass',
        'bid',
        'end',
        'pay-jail',
        'jail-card',
        'pay-debt',
        'bankrupt',
        'accept-trade',
        'reject-trade',
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal('propose-trade'),
      target: z.number().int().min(0).max(5),
      give: z.number().int().min(-1).max(39),
      take: z.number().int().min(-1).max(39),
      cash: z.number().int().min(-10000).max(10000),
    })
    .strict(),
  z
    .object({
      type: z.enum(['build', 'sell-house', 'mortgage', 'redeem']),
      property: z.number().int().min(0).max(39),
    })
    .strict(),
]);
type Action = z.infer<typeof actionSchema>;
const living = (s: EstateState) =>
  s.players
    .map((_, i) => i)
    .filter((i) => !s.eliminated.includes(i) && !s.forfeited?.includes(s.players[i]!));
function note(s: EstateState, text: string) {
  s.log = [...s.log.slice(-11), text];
}
function group(index: number) {
  return estateBoard.flatMap((p, i) =>
    p.group === estateBoard[index]!.group && p.group >= 0 ? [i] : [],
  );
}
function complete(s: EstateState, index: number, owner: number) {
  return group(index).length > 0 && group(index).every((i) => s.owners[i] === owner);
}
export function estateWorth(s: EstateState, player: number) {
  return (
    s.money[player]! +
    estateBoard.reduce(
      (sum, p, i) =>
        sum +
        (s.owners[i] === player
          ? Math.floor(p.price * (s.mortgaged[i] ? 0.5 : 1)) + s.houses[i]! * housePrice(i)
          : 0),
      0,
    )
  );
}
function finish(s: EstateState) {
  const active = living(s);
  if (active.length <= 1 || s.completedTurns >= s.roundLimit * s.players.length) {
    s.finished = true;
    s.ranking = [
      ...active.sort((a, b) => estateWorth(s, b) - estateWorth(s, a)),
      ...s.eliminated.slice().reverse(),
    ].map((i) => s.players[i]!);
    note(s, 'La partie est terminée. Le patrimoine détermine le classement.');
  }
}
function next(s: EstateState) {
  s.completedTurns++;
  finish(s);
  if (s.finished) return;
  do {
    s.turn = (s.turn + 1) % s.players.length;
  } while (!living(s).includes(s.turn));
  s.phase = 'roll';
  s.extraRoll = false;
  s.doubles = 0;
  s.debt = 0;
  s.creditor = -1;
}
function prison(s: EstateState) {
  s.positions[s.turn] = 10;
  s.jail[s.turn] = 0;
  s.extraRoll = false;
  s.doubles = 0;
  s.phase = 'end';
  note(s, 'Direction la prison, sans prime de départ.');
}
function charge(s: EstateState, amount: number, recipient = -1) {
  if (amount <= 0) return;
  if (s.money[s.turn]! >= amount) {
    s.money[s.turn]! -= amount;
    if (recipient >= 0) s.money[recipient]! += amount;
  } else {
    s.phase = 'debt';
    s.debt = amount;
    s.creditor = recipient;
    s.extraRoll = false;
    note(s, `Dette de ${amount} € : vendez des bâtiments ou hypothéquez vos propriétés.`);
  }
}
export function estateRent(s: EstateState, index: number) {
  if (s.mortgaged[index] || s.owners[index]! < 0) return 0;
  const p = estateBoard[index]!,
    owner = s.owners[index]!;
  if (p.kind === 'plane')
    return (
      25 *
      2 ** (estateBoard.filter((t, i) => t.kind === 'plane' && s.owners[i] === owner).length - 1)
    );
  if (p.kind === 'service')
    return (
      (s.dice[0]! + s.dice[1]!) *
      (estateBoard.filter((t, i) => t.kind === 'service' && s.owners[i] === owner).length === 2
        ? 10
        : 4)
    );
  const rents = estateRents[index]!;
  return s.houses[index]! > 0
    ? rents[s.houses[index]!]!
    : rents[0]! * (complete(s, index, owner) ? 2 : 1);
}
function land(s: EstateState, depth = 0) {
  assertRule(depth < 8);
  const index = s.positions[s.turn]!,
    p = estateBoard[index]!;
  s.phase = 'end';
  note(s, `Arrivée : ${p.name}.`);
  if (p.kind === 'go-prison') {
    prison(s);
    return;
  }
  if (p.kind === 'tax') {
    charge(s, p.price);
    return;
  }
  if (p.kind === 'property' || p.kind === 'plane' || p.kind === 'service') {
    if (s.owners[index] === -1) s.phase = 'offer';
    else if (s.owners[index] !== s.turn) {
      const rent = estateRent(s, index);
      charge(s, rent, s.owners[index]!);
      note(s, `Loyer : ${rent} €.`);
    }
    return;
  }
  if (p.kind !== 'dalmatian' && p.kind !== 'golden') return;
  const deck = p.kind,
    cardIndex = s.decks[deck][s.cursors[deck] % s.decks[deck].length]!;
  s.cursors[deck]++;
  s.lastCard = { deck, index: cardIndex };
  const card = estateCards[deck][cardIndex]!;
  note(s, `${card.title} : ${card.text}`);
  if (card.release) {
    s.jailCards[s.turn]!++;
    s.heldCards[s.turn]!.push(deck);
    const position = s.decks[deck].indexOf(cardIndex);
    s.decks[deck] = s.decks[deck].filter((i) => i !== cardIndex);
    s.cursors[deck] = position;
  }
  if (card.money) {
    if (card.money > 0) s.money[s.turn]! += card.money;
    else charge(s, -card.money);
  }
  if (card.jail) prison(s);
  if (card.repairs)
    charge(
      s,
      s.houses.reduce(
        (total, n, i) => total + (s.owners[i] === s.turn ? (n === 5 ? 100 : n * 25) : 0),
        0,
      ),
    );
  if (card.each)
    for (const other of living(s).filter((i) => i !== s.turn)) {
      const amount = Math.min(card.each, s.money[other]!);
      s.money[other]! -= amount;
      s.money[s.turn]! += amount;
    }
  if (card.move !== undefined || card.steps !== undefined) {
    const destination = card.move ?? (index + card.steps! + 40) % 40;
    if (card.move !== undefined && destination <= index) s.money[s.turn]! += 200;
    s.positions[s.turn] = destination;
    land(s, depth + 1);
  }
}
function liquidate(s: EstateState, player: number, creditor = -1) {
  for (const deck of s.heldCards[player]!) {
    if (creditor >= 0) {
      s.heldCards[creditor]!.push(deck);
      s.jailCards[creditor]!++;
    } else s.decks[deck].push(estateCards[deck].findIndex((c) => c.release));
  }
  s.heldCards[player] = [];
  s.jailCards[player] = 0;
  s.money[player]! += s.houses.reduce(
    (total, n, i) => total + (s.owners[i] === player ? Math.floor(housePrice(i) / 2) * n : 0),
    0,
  );
  if (creditor >= 0) s.money[creditor]! += s.money[player]!;
  s.money[player] = 0;
  for (let i = 0; i < 40; i++)
    if (s.owners[i] === player) {
      s.owners[i] = creditor;
      s.houses[i] = 0;
      if (creditor < 0) s.mortgaged[i] = false;
    }
  if (!s.eliminated.includes(player)) s.eliminated.push(player);
  note(s, `Le joueur ${player + 1} est en faillite.`);
}
function settleAuction(s: EstateState) {
  const a = s.auction!;
  if (a.eligible.length > 1 || (a.eligible.length === 1 && a.bidder === null)) return;
  if (a.bidder !== null && !s.eliminated.includes(a.bidder)) {
    s.money[a.bidder]! -= a.price;
    s.owners[a.property] = a.bidder;
    note(s, `Enchère remportée pour ${a.price} €.`);
  }
  s.turn = a.resume;
  s.auction = null;
  s.phase = 'end';
}
function legal(s: EstateState, id: string): Action[] {
  if (s.finished || s.players[s.turn] !== id || !living(s).includes(s.turn)) return [];
  if (s.phase === 'trade') return [{ type: 'accept-trade' }, { type: 'reject-trade' }];
  if (s.phase === 'auction') {
    const a = s.auction!;
    return [
      { type: 'pass' },
      ...(s.money[s.turn]! >= a.price + 10 ? [{ type: 'bid' } as const] : []),
    ];
  }
  const actions: Action[] = [];
  if ((s.phase === 'roll' || s.phase === 'end') && s.money[s.turn]! > 0)
    actions.push({
      type: 'propose-trade',
      target: living(s).find((i) => i !== s.turn)!,
      give: -1,
      take: -1,
      cash: 1,
    });
  if (s.phase === 'roll') {
    actions.push({ type: 'roll' });
    if (s.jail[s.turn]! >= 0) {
      if (s.money[s.turn]! >= 50) actions.push({ type: 'pay-jail' });
      if (s.jailCards[s.turn]! > 0) actions.push({ type: 'jail-card' });
    }
  }
  if (s.phase === 'offer') {
    actions.push({ type: 'auction' });
    if (s.money[s.turn]! >= estateBoard[s.positions[s.turn]!]!.price) actions.push({ type: 'buy' });
  }
  if (s.phase === 'end') actions.push({ type: 'end' });
  if (s.phase === 'debt') {
    actions.push({ type: 'bankrupt' });
    if (s.money[s.turn]! >= s.debt) actions.push({ type: 'pay-debt' });
  }
  for (let i = 0; i < 40; i++) {
    if (s.owners[i] !== s.turn) continue;
    const peers = group(i),
      building = s.houses[i]!;
    if (
      building > 0 &&
      peers.every((p) => s.houses[p]! <= building) &&
      (building < 5 || s.houses.reduce((n, h) => n + (h < 5 ? h : 0), 0) <= 28)
    )
      actions.push({ type: 'sell-house', property: i });
    if (!s.mortgaged[i] && peers.every((p) => s.houses[p] === 0))
      actions.push({ type: 'mortgage', property: i });
    if (
      s.phase !== 'debt' &&
      s.mortgaged[i] &&
      s.money[s.turn]! >= Math.ceil((estateBoard[i]!.price * 55) / 100)
    )
      actions.push({ type: 'redeem', property: i });
    if (
      s.phase !== 'debt' &&
      complete(s, i, s.turn) &&
      building < 5 &&
      peers.every((p) => !s.mortgaged[p] && s.houses[p]! >= building) &&
      s.money[s.turn]! >= housePrice(i)
    ) {
      const stock =
        building === 4
          ? s.houses.filter((n) => n === 5).length < 12
          : s.houses.reduce((n, h) => n + (h < 5 ? h : 0), 0) < 32;
      if (stock) actions.push({ type: 'build', property: i });
    }
  }
  return actions;
}
export const meganopoly = defineEngine<EstateState, { roundLimit: number }, Action>({
  id: 'meganopoly',
  name: 'MÉGANOPOLY',
  minPlayers: 2,
  maxPlayers: 6,
  defaultOptions: { roundLimit: 40 },
  stateSchema: estateStateSchema,
  optionsSchema: z.object({ roundLimit: z.number().int().min(10).max(100).default(40) }).strict(),
  actionSchema,
  createInitialState(players, options, rng) {
    return {
      players,
      turn: 0,
      moves: 0,
      finished: false,
      ranking: [],
      positions: players.map(() => 0),
      money: players.map(() => 1500),
      owners: Array<number>(40).fill(-1),
      houses: Array<number>(40).fill(0),
      mortgaged: Array<boolean>(40).fill(false),
      jail: players.map(() => -1),
      jailCards: players.map(() => 0),
      heldCards: players.map(() => []),
      phase: 'roll',
      trade: null,
      dice: [1, 1],
      doubles: 0,
      extraRoll: false,
      eliminated: [],
      debt: 0,
      creditor: -1,
      auction: null,
      decks: {
        dalmatian: shuffle(
          estateCards.dalmatian.map((_, i) => i),
          rng,
        ),
        golden: shuffle(
          estateCards.golden.map((_, i) => i),
          rng,
        ),
      },
      cursors: { dalmatian: 0, golden: 0 },
      lastCard: null,
      log: ['Bienvenue ! Chaque joueur reçoit 1 500 €.'],
      completedTurns: 0,
      roundLimit: options.roundLimit,
    };
  },
  getLegalActions: legal,
  applyAction(state, id, action, rng) {
    requireTurn(state, id);
    if (action.type === 'propose-trade') {
      assertRule(
        (state.phase === 'roll' || state.phase === 'end') &&
          living(state).includes(action.target) &&
          action.target !== state.turn,
      );
      const tradable = (p: number, owner: number) =>
        p === -1 ||
        (state.owners[p] === owner &&
          !state.mortgaged[p] &&
          state.houses[p] === 0 &&
          group(p).every((i) => state.houses[i] === 0));
      assertRule(
        tradable(action.give, state.turn) &&
          tradable(action.take, action.target) &&
          (action.give >= 0 || action.take >= 0 || action.cash !== 0),
      );
      assertRule(
        action.cash <= state.money[state.turn]! && -action.cash <= state.money[action.target]!,
      );
      const s = structuredClone(state);
      s.trade = {
        from: s.turn,
        to: action.target,
        give: action.give,
        take: action.take,
        cash: action.cash,
        resume: state.phase as 'roll' | 'end',
      };
      s.turn = action.target;
      s.phase = 'trade';
      s.moves++;
      note(s, 'Une proposition d’échange attend votre accord.');
      return s;
    }
    assertRule(legal(state, id).some((a) => JSON.stringify(a) === JSON.stringify(action)));
    const s = structuredClone(state);
    s.moves++;
    if (action.type === 'accept-trade' || action.type === 'reject-trade') {
      const t = s.trade!;
      if (action.type === 'accept-trade') {
        if (t.give >= 0) s.owners[t.give] = t.to;
        if (t.take >= 0) s.owners[t.take] = t.from;
        s.money[t.from]! -= t.cash;
        s.money[t.to]! += t.cash;
      }
      s.turn = t.from;
      s.phase = t.resume;
      s.trade = null;
      note(s, action.type === 'accept-trade' ? 'Échange accepté.' : 'Échange refusé.');
    } else if (action.type === 'roll') {
      s.dice = [rng.int(6) + 1, rng.int(6) + 1];
      const double = s.dice[0] === s.dice[1];
      s.extraRoll = double;
      s.doubles = double ? s.doubles + 1 : 0;
      if (s.doubles === 3) {
        prison(s);
        return s;
      }
      if (s.jail[s.turn]! >= 0) {
        s.extraRoll = false;
        if (!double && s.jail[s.turn]! < 2) {
          s.jail[s.turn]!++;
          s.phase = 'end';
          note(s, 'Pas de double : vous restez en prison.');
          return s;
        }
        s.jail[s.turn] = -1;
        if (!double) {
          charge(s, 50);
          if (s.phase === 'debt') {
            s.jail[s.turn] = 2;
            return s;
          }
        }
      }
      const destination = s.positions[s.turn]! + s.dice[0]! + s.dice[1]!;
      if (destination >= 40) {
        s.money[s.turn]! += 200;
        note(s, 'Passage par Départ : +200 €.');
      }
      s.positions[s.turn] = destination % 40;
      land(s);
    } else if (action.type === 'buy') {
      const index = s.positions[s.turn]!;
      s.money[s.turn]! -= estateBoard[index]!.price;
      s.owners[index] = s.turn;
      s.phase = 'end';
      note(s, `Achat : ${estateBoard[index]!.name}.`);
    } else if (action.type === 'auction') {
      s.auction = {
        property: s.positions[s.turn]!,
        price: 0,
        bidder: null,
        eligible: living(s),
        resume: s.turn,
      };
      s.phase = 'auction';
    } else if (action.type === 'bid' || action.type === 'pass') {
      const a = s.auction!;
      if (action.type === 'bid') {
        a.price += 10;
        a.bidder = s.turn;
      } else a.eligible = a.eligible.filter((i) => i !== s.turn);
      a.eligible = a.eligible.filter((i) => i === a.bidder || s.money[i]! >= a.price + 10);
      settleAuction(s);
      if (s.auction) {
        do {
          s.turn = (s.turn + 1) % s.players.length;
        } while (!a.eligible.includes(s.turn) || s.turn === a.bidder);
      }
    } else if (action.type === 'end') {
      if (s.extraRoll) {
        s.phase = 'roll';
        s.extraRoll = false;
      } else next(s);
    } else if (action.type === 'pay-jail' || action.type === 'jail-card') {
      if (action.type === 'pay-jail') s.money[s.turn]! -= 50;
      else {
        s.jailCards[s.turn]!--;
        const deck = s.heldCards[s.turn]!.shift()!;
        s.decks[deck].push(estateCards[deck].findIndex((c) => c.release));
      }
      s.jail[s.turn] = -1;
    } else if (action.type === 'pay-debt') {
      const jailDebt = s.jail[s.turn] === 2;
      charge(s, s.debt, s.creditor);
      s.debt = 0;
      s.creditor = -1;
      s.phase = 'end';
      if (jailDebt) {
        s.jail[s.turn] = -1;
        const destination = s.positions[s.turn]! + s.dice[0]! + s.dice[1]!;
        s.positions[s.turn] = destination % 40;
        land(s);
      }
    } else if (action.type === 'bankrupt') {
      liquidate(s, s.turn, s.creditor);
      next(s);
    } else if ('property' in action) {
      const i = action.property;
      if (action.type === 'build') {
        s.money[s.turn]! -= housePrice(i);
        s.houses[i]!++;
      }
      if (action.type === 'sell-house') {
        s.money[s.turn]! += Math.floor(housePrice(i) / 2);
        s.houses[i]!--;
      }
      if (action.type === 'mortgage') {
        s.money[s.turn]! += Math.floor(estateBoard[i]!.price / 2);
        s.mortgaged[i] = true;
      }
      if (action.type === 'redeem') {
        s.money[s.turn]! -= Math.ceil((estateBoard[i]!.price * 55) / 100);
        s.mortgaged[i] = false;
      }
    }
    return s;
  },
  getPlayerView(s, id) {
    return {
      ...coreView(s, 'meganopoly', legal(s, id)),
      scores: s.players.map((_, i) => estateWorth(s, i)),
      notice: s.log.at(-1) ?? '',
      estate: {
        positions: s.positions,
        money: s.money,
        owners: s.owners,
        houses: s.houses,
        mortgaged: s.mortgaged,
        jail: s.jail,
        jailCards: s.jailCards,
        phase: s.phase,
        dice: s.dice,
        eliminated: s.eliminated,
        debt: s.debt,
        auction: s.auction,
        trade: s.trade,
        lastCard: s.lastCard,
        log: s.log,
        round: Math.floor(s.completedTurns / s.players.length) + 1,
        roundLimit: s.roundLimit,
      },
    };
  },
  getStatus: status,
  onTimeout(s, id) {
    const actions = legal(s, id);
    if (s.phase === 'debt')
      return (
        actions.find((a) => a.type === 'pay-debt') ??
        actions.find((a) => a.type === 'sell-house') ??
        actions.find((a) => a.type === 'mortgage') ??
        actions.find((a) => a.type === 'bankrupt') ??
        null
      );
    return (
      actions.find(
        (a) =>
          a.type ===
          {
            roll: 'roll',
            offer: 'auction',
            auction: 'pass',
            end: 'end',
            trade: 'reject-trade',
            debt: 'bankrupt',
          }[s.phase],
      ) ?? null
    );
  },
  bot(s, id) {
    const actions = legal(s, id),
      pick = (type: Action['type']) => actions.find((a) => a.type === type);
    if (s.phase === 'trade') {
      const t = s.trade!,
        value = (p: number) => (p >= 0 ? estateBoard[p]!.price : 0);
      return (
        pick(value(t.give) + t.cash >= value(t.take) ? 'accept-trade' : 'reject-trade') ?? null
      );
    }
    if (s.phase === 'debt')
      return pick('pay-debt') ?? pick('sell-house') ?? pick('mortgage') ?? pick('bankrupt') ?? null;
    if (s.phase === 'auction')
      return s.auction!.price + 10 <= estateBoard[s.auction!.property]!.price &&
        s.money[s.turn]! > s.auction!.price + 100
        ? (pick('bid') ?? pick('pass')!)
        : pick('pass')!;
    if (s.phase === 'offer') return pick('buy') ?? pick('auction')!;
    if (s.phase === 'roll') return pick('jail-card') ?? pick('pay-jail') ?? pick('roll')!;
    return (
      (s.money[s.turn]! > 250 ? (pick('build') ?? pick('redeem')) : undefined) ??
      pick('end') ??
      null
    );
  },
  forfeit(s, id) {
    const nextState = structuredClone(s),
      seat = s.players.indexOf(id);
    liquidate(nextState, seat);
    if (nextState.creditor === seat) nextState.creditor = -1;
    if (nextState.trade && (nextState.trade.from === seat || nextState.trade.to === seat)) {
      const t = nextState.trade;
      nextState.turn = living(nextState).includes(t.from) ? t.from : (living(nextState)[0] ?? seat);
      nextState.phase = t.from === seat ? 'roll' : t.resume;
      nextState.trade = null;
    }
    if (nextState.auction) {
      const a = nextState.auction;
      a.eligible = a.eligible.filter((i) => i !== seat);
      if (a.bidder === seat) {
        a.bidder = null;
        a.price = 0;
      }
      if (a.resume === seat) a.resume = living(nextState)[0] ?? seat;
      if (a.eligible.length === 0) {
        nextState.auction = null;
        nextState.phase = 'end';
        nextState.turn = a.resume;
      } else {
        settleAuction(nextState);
        if (nextState.auction)
          nextState.turn = a.eligible.find((i) => i !== a.bidder) ?? a.eligible[0]!;
      }
    }
    if (nextState.turn === seat && living(nextState).length > 1) next(nextState);
    finish(nextState);
    return nextState;
  },
});

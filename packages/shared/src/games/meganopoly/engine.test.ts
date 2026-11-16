import { describe, it, expect } from 'vitest';
import { meganopoly, estateStateSchema, estateRent, type EstateState } from './engine.js';
import { estateBoard, estateCards } from './board.js';
import { gameViewSchema } from '../../contracts/games.js';
const rng = { int: () => 0 };
const fresh = (patch: Partial<EstateState> = {}) => ({
  ...estateStateSchema.parse(meganopoly.createInitialState(['a', 'b', 'c'], {}, rng)),
  ...patch,
});
function act(s: EstateState, action: unknown, dice = [0, 0]) {
  let n = 0;
  const result = meganopoly.applyAction(s, s.players[s.turn]!, action, {
    int: () => dice[n++ % dice.length]!,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.code);
  return estateStateSchema.parse(result.state);
}
function draw(deck: 'dalmatian' | 'golden', card: number, patch: Partial<EstateState> = {}) {
  const destination = deck === 'dalmatian' ? 2 : 7;
  const s = fresh({ ...patch, positions: [destination === 2 ? 0 : 4, 0, 0] });
  s.decks[deck] = [card];
  return act(s, { type: 'roll' }, deck === 'dalmatian' ? [0, 0] : [0, 1]);
}

describe('MÉGANOPOLY authoritative economic rules', () => {
  it('redeems a 100 euro property for exactly 55 euros without floating point surcharges', () => {
    const s = fresh();
    s.owners[6] = 0;
    s.mortgaged[6] = true;
    const next = act(s, { type: 'redeem', property: 6 });
    expect(next.money[0]).toBe(1445);
  });
  it('skips previously bankrupt players when the current player forfeits', () => {
    const s = estateStateSchema.parse(meganopoly.createInitialState(['a', 'b', 'c', 'd'], {}, rng));
    s.eliminated = [1];
    const next = estateStateSchema.parse(meganopoly.forfeit(s, 'a', rng));
    expect(next.finished).toBe(false);
    expect(next.turn).toBe(2);
    expect(meganopoly.getLegalActions(next, 'c')).not.toHaveLength(0);
  });
  it('creates 40 squares, 22 properties, two decks and filtered valid player views', () => {
    const s = fresh();
    expect(s.money).toEqual([1500, 1500, 1500]);
    expect(estateBoard).toHaveLength(40);
    expect(estateBoard.filter((p) => p.kind === 'property')).toHaveLength(22);
    expect(estateBoard.filter((p) => p.kind === 'tax')).toHaveLength(2);
    expect(estateBoard.filter((p) => p.kind === 'service')).toHaveLength(2);
    const v = gameViewSchema.parse(meganopoly.getPlayerView(s, 'a'));
    expect(v.estate?.money).toEqual(s.money);
    expect(v).not.toHaveProperty('decks');
    expect(meganopoly.getLegalActions(s, 'b')).toEqual([]);
    expect(meganopoly.applyAction(s, 'b', { type: 'roll' }, rng).ok).toBe(false);
    expect(() => meganopoly.getPlayerView(s, 'outsider')).toThrow();
  });
  it('moves, pays salary, buys, freezes the source state and allows extra rolls', () => {
    const source = fresh({ positions: [39, 0, 0] });
    let s = act(source, { type: 'roll' });
    expect(source.positions[0]).toBe(39);
    expect(s.positions[0]).toBe(1);
    expect(s.money[0]).toBe(1700);
    s = act(s, { type: 'buy' });
    expect(s.owners[1]).toBe(0);
    expect(s.money[0]).toBe(1640);
    s = act(s, { type: 'end' });
    expect(s.phase).toBe('roll');
    expect(s.turn).toBe(0);
    expect(meganopoly.applyAction(s, 'a', { type: 'buy' }, rng).ok).toBe(false);
  });
  it('charges rents, doubles a complete group and suspends a mortgaged rent', () => {
    let s = fresh();
    s.owners[3] = 1;
    s = act(s, { type: 'roll' }, [0, 1]);
    expect(s.money).toEqual([1496, 1504, 1500]);
    s.owners[1] = 1;
    expect(estateRent(s, 3)).toBe(8);
    s.houses[3] = 5;
    expect(estateRent(s, 3)).toBe(450);
    s.mortgaged[3] = true;
    expect(estateRent(s, 3)).toBe(0);
    s.extraRoll = false;
    s = act(s, { type: 'end' });
    expect(s.turn).toBe(1);
  });
  it('charges plane and utility rents using group counts and the current dice', () => {
    const s = fresh();
    s.owners[5] = 1;
    expect(estateRent(s, 5)).toBe(25);
    s.owners[15] = 1;
    expect(estateRent(s, 5)).toBe(50);
    s.owners[12] = 0;
    s.dice = [3, 4];
    expect(estateRent(s, 12)).toBe(28);
    s.owners[28] = 0;
    expect(estateRent(s, 12)).toBe(70);
    expect(estateRent(s, 1)).toBe(0);
  });
  it('runs auctions without charging losing bidders and restores the landing turn', () => {
    let s = fresh({ positions: [1, 0, 0], phase: 'offer' });
    s = act(s, { type: 'auction' });
    s = act(s, { type: 'bid' });
    expect(s.turn).toBe(1);
    s = act(s, { type: 'bid' });
    expect(s.turn).toBe(2);
    s = act(s, { type: 'pass' });
    s = act(s, { type: 'pass' });
    expect(s.owners[1]).toBe(1);
    expect(s.money).toEqual([1500, 1480, 1500]);
    expect(s.turn).toBe(0);
    expect(s.auction).toBeNull();
  });
  it('leaves a property with the bank if everyone declines and excludes insolvent bids', () => {
    let s = fresh({ positions: [1, 0, 0], phase: 'offer', money: [0, 0, 0] });
    expect(
      meganopoly
        .getLegalActions(s, 'a')
        .some((a: unknown) => (a as { type: string }).type === 'buy'),
    ).toBe(false);
    s = act(s, { type: 'auction' });
    expect(meganopoly.getLegalActions(s, 'a')).toEqual([{ type: 'pass' }]);
    s = act(s, { type: 'pass' });
    expect(s.owners[1]).toBe(-1);
    expect(s.phase).toBe('end');
  });
  it('requires complete groups, builds and sells evenly, and applies mortgage interest', () => {
    let s = fresh();
    s.owners[1] = 0;
    expect(meganopoly.applyAction(s, 'a', { type: 'build', property: 1 }, rng).ok).toBe(false);
    s.owners[3] = 0;
    s = act(s, { type: 'build', property: 1 });
    expect(meganopoly.applyAction(s, 'a', { type: 'build', property: 1 }, rng).ok).toBe(false);
    expect(meganopoly.applyAction(s, 'a', { type: 'mortgage', property: 3 }, rng).ok).toBe(false);
    s = act(s, { type: 'build', property: 3 });
    s = act(s, { type: 'sell-house', property: 1 });
    s = act(s, { type: 'sell-house', property: 3 });
    s = act(s, { type: 'mortgage', property: 1 });
    expect(s.mortgaged[1]).toBe(true);
    expect(s.money[0]).toBe(1480);
    s = act(s, { type: 'redeem', property: 1 });
    expect(s.money[0]).toBe(1447);
    expect(s.mortgaged[1]).toBe(false);
  });
  it('promotes a fifth building to a hotel and enforces the bank building stock', () => {
    let s = fresh({ money: [10000, 1500, 1500] });
    s.owners[1] = s.owners[3] = 0;
    for (let i = 0; i < 5; i++) {
      s = act(s, { type: 'build', property: 1 });
      s = act(s, { type: 'build', property: 3 });
    }
    expect(s.houses[1]).toBe(5);
    expect(estateRent(s, 1)).toBe(250);
    s = act(s, { type: 'sell-house', property: 1 });
    expect(s.houses[1]).toBe(4);
    s.houses = s.houses.map((_, i) => (i >= 4 && i <= 11 ? 4 : 0));
    expect(meganopoly.applyAction(s, 'a', { type: 'build', property: 1 }, rng).ok).toBe(false);
  });
  it('lets a debtor mortgage and pay the full rent without creating money', () => {
    let s = fresh({ money: [0, 1500, 1500] });
    s.owners[3] = 1;
    s.owners[39] = 0;
    s = act(s, { type: 'roll' }, [0, 1]);
    expect(s.phase).toBe('debt');
    expect(s.money[1]).toBe(1500);
    s = act(s, { type: 'mortgage', property: 39 });
    s = act(s, { type: 'pay-debt' });
    expect(s.money).toEqual([196, 1504, 1500]);
    expect(s.phase).toBe('end');
  });
  it('transfers property, liquidated buildings and remaining cash to the creditor on bankruptcy', () => {
    let s = fresh({ money: [10, 1500, 1500], phase: 'debt', debt: 500, creditor: 1 });
    s.owners[1] = 0;
    s.houses[1] = 1;
    s = act(s, { type: 'bankrupt' });
    expect(s.money).toEqual([0, 1535, 1500]);
    expect(s.owners[1]).toBe(1);
    expect(s.houses[1]).toBe(0);
    expect(s.turn).toBe(1);
  });
  it('returns property to the bank and finishes when one solvent player remains', () => {
    let s = fresh({ phase: 'debt', debt: 2000, eliminated: [2] });
    s.owners[1] = 0;
    s.mortgaged[1] = true;
    s = act(s, { type: 'bankrupt' });
    expect(s.finished).toBe(true);
    expect(s.ranking[0]).toBe('b');
    expect(s.owners[1]).toBe(-1);
    expect(s.mortgaged[1]).toBe(false);
  });
  it('sends three consecutive doubles and the police square to prison', () => {
    let s = fresh({ doubles: 2 });
    s = act(s, { type: 'roll' });
    expect(s.positions[0]).toBe(10);
    expect(s.jail[0]).toBe(0);
    expect(s.extraRoll).toBe(false);
    s = act(fresh({ positions: [27, 0, 0] }), { type: 'roll' }, [0, 1]);
    expect(s.jail[0]).toBe(0);
  });
  it('releases a prisoner with a double, bail or a held card and returns that card to its deck', () => {
    let s = fresh({ positions: [10, 0, 0], jail: [0, -1, -1] });
    s = act(s, { type: 'roll' });
    expect(s.jail[0]).toBe(-1);
    expect(s.positions[0]).toBe(12);
    expect(s.extraRoll).toBe(false);
    s = act(fresh({ jail: [0, -1, -1] }), { type: 'pay-jail' });
    expect(s.money[0]).toBe(1450);
    expect(s.jail[0]).toBe(-1);
    s = draw('dalmatian', 5);
    expect(s.jailCards[0]).toBe(1);
    expect(s.decks.dalmatian).not.toContain(5);
    s.phase = 'roll';
    s.jail[0] = 0;
    s = act(s, { type: 'jail-card' });
    expect(s.jailCards[0]).toBe(0);
    expect(s.decks.dalmatian).toContain(5);
  });
  it('waits in prison and requires bail after the third failure, including debt recovery', () => {
    let s = fresh({ positions: [10, 0, 0], jail: [0, -1, -1] });
    s = act(s, { type: 'roll' }, [0, 1]);
    expect(s.jail[0]).toBe(1);
    expect(s.positions[0]).toBe(10);
    s = fresh({ positions: [10, 0, 0], jail: [2, -1, -1], money: [0, 1500, 1500] });
    s.owners[39] = 0;
    s = act(s, { type: 'roll' }, [0, 1]);
    expect(s.phase).toBe('debt');
    s = act(s, { type: 'mortgage', property: 39 });
    s = act(s, { type: 'pay-debt' });
    expect(s.jail[0]).toBe(-1);
    expect(s.positions[0]).toBe(13);
  });
  it.each(['dalmatian', 'golden'] as const)(
    'applies every %s card without leaking future draws',
    (deck) => {
      estateCards[deck].forEach((_, i) => {
        const s = draw(deck, i);
        expect(s.lastCard).toEqual({ deck, index: i });
        expect(s.log.length).toBeGreaterThan(1);
        expect(s.money.every((n) => n >= 0)).toBe(true);
      });
    },
  );
  it('charges taxes and building repairs and does not award a parking jackpot', () => {
    let s = act(fresh({ positions: [1, 0, 0] }), { type: 'roll' }, [0, 1]);
    expect(s.money[0]).toBe(1300);
    s = act(fresh({ positions: [17, 0, 0] }), { type: 'roll' }, [0, 1]);
    expect(s.money[0]).toBe(1500);
    const patch = fresh();
    patch.owners[1] = patch.owners[3] = 0;
    patch.houses[1] = 2;
    patch.houses[3] = 5;
    s = draw('dalmatian', 7, patch);
    expect(s.money[0]).toBe(1350);
  });
  it('requires consent for exchanges, transfers cash atomically and restores the proposer turn', () => {
    let s = fresh();
    s.owners[1] = 0;
    s.owners[3] = 1;
    s = act(s, { type: 'propose-trade', target: 1, give: 1, take: 3, cash: 25 });
    expect(s.turn).toBe(1);
    expect(s.owners[1]).toBe(0);
    s = act(s, { type: 'accept-trade' });
    expect(s.owners[1]).toBe(1);
    expect(s.owners[3]).toBe(0);
    expect(s.money).toEqual([1475, 1525, 1500]);
    expect(s.turn).toBe(0);
    expect(s.phase).toBe('roll');
    s = act(s, { type: 'propose-trade', target: 1, give: 3, take: 1, cash: 0 });
    s = act(s, { type: 'reject-trade' });
    expect(s.owners[3]).toBe(0);
  });
  it('rejects stolen, mortgaged, developed, self and unaffordable exchanges', () => {
    const s = fresh();
    s.owners[1] = 0;
    s.owners[3] = 1;
    s.mortgaged[1] = true;
    for (const a of [
      { target: 1, give: 1, take: 3, cash: 0 },
      { target: 0, give: -1, take: -1, cash: 1 },
      { target: 2, give: 3, take: -1, cash: 0 },
      { target: 1, give: -1, take: -1, cash: 5000 },
      { target: 1, give: -1, take: -1, cash: 0 },
    ])
      expect(meganopoly.applyAction(s, 'a', { type: 'propose-trade', ...a }, rng).ok).toBe(false);
    s.mortgaged[1] = false;
    s.houses[1] = 1;
    expect(
      meganopoly.applyAction(
        s,
        'a',
        { type: 'propose-trade', target: 1, give: 1, take: 3, cash: 0 },
        rng,
      ).ok,
    ).toBe(false);
  });
  it('cancels a trade when either participant forfeits and ranks by assets at the round limit', () => {
    let s = act(fresh(), { type: 'propose-trade', target: 1, give: -1, take: -1, cash: 1 });
    s = estateStateSchema.parse(meganopoly.forfeit(s, 'b', rng));
    expect(s.trade).toBeNull();
    expect(s.turn).toBe(0);
    s = fresh({ phase: 'end', completedTurns: 119, roundLimit: 40, money: [1500, 1800, 1700] });
    s = act(s, { type: 'end' });
    expect(s.ranking).toEqual(['b', 'c', 'a']);
  });
  it('settles auctions safely when a bidder or landing player forfeits', () => {
    let s = act(fresh({ phase: 'offer', positions: [1, 0, 0] }), { type: 'auction' });
    s = act(s, { type: 'bid' });
    s = estateStateSchema.parse(meganopoly.forfeit(s, 'b', rng));
    expect(meganopoly.getLegalActions(s, s.players[s.turn]!)).not.toHaveLength(0);
    s = estateStateSchema.parse(meganopoly.forfeit(s, 'a', rng));
    expect(s.finished).toBe(true);
    expect(s.ranking[0]).toBe('c');
  });
  it('chooses safe bot and timeout actions for roll, debt, auction and trade', () => {
    for (const phase of ['roll', 'end', 'offer', 'debt'] as const) {
      const s = fresh({ phase, debt: 3000, positions: [1, 0, 0] });
      expect(meganopoly.bot(s, 'a', rng)).not.toBeNull();
      expect(meganopoly.onTimeout(s, 'a')).not.toBeNull();
    }
    let s = act(fresh(), { type: 'propose-trade', target: 1, give: -1, take: -1, cash: 10 });
    expect(meganopoly.bot(s, 'b', rng)).toEqual({ type: 'accept-trade' });
    expect(meganopoly.onTimeout(s, 'b')).toEqual({ type: 'reject-trade' });
    s = fresh({ phase: 'debt', debt: 10 });
    expect(meganopoly.bot(s, 'a', rng)).toEqual({ type: 'pay-debt' });
  });
});

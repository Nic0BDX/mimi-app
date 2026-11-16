import assert from 'node:assert/strict';
import { engines } from '../packages/shared/src/engine/registry.js';
import type { RandomSource } from '../packages/shared/src/engine/types.js';

const requested = process.argv[2];
if (requested && !engines[requested]) throw new Error(`Unknown game: ${requested}`);
for (const engine of Object.values(engines).filter((game) => !requested || game.id === requested)) {
  let longest = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    let value = seed;
    const rng: RandomSource = {
      int(max) {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return Math.floor((value / 4294967296) * max);
      },
    };
    const players = Array.from({ length: engine.minPlayers }, (_, index) => `player-${index}`);
    let state = engine.createInitialState(players, engine.defaultOptions, rng);
    let steps = 0;
    while (!engine.getStatus(state).status.includes('finished')) {
      assert(steps++ < 20000, `${engine.id}: blocked at seed ${seed}`);
      const player = state.players[state.turn]!;
      const legal = engine.getLegalActions(state, player);
      const action = engine.bot(state, player, rng) ?? legal[rng.int(legal.length)];
      assert(action, `${engine.id}: no action at seed ${seed}`);
      const before = JSON.stringify(state);
      const result = engine.applyAction(state, player, action, rng);
      assert(result.ok, `${engine.id}: rejected bot action at seed ${seed}`);
      assert.equal(JSON.stringify(state), before, `${engine.id}: mutated input`);
      state = engine.parseState(result.state);
      assert.equal(new Set(state.players).size, players.length);
      for (const id of players) assert.equal(engine.getPlayerView(state, id).kind, engine.id);
    }
    assert.equal(
      new Set(engine.getStatus(state).ranking).size,
      engine.getStatus(state).ranking.length,
    );
    longest = Math.max(longest, steps);
  }
  console.log(`${engine.id}: 1000 games completed; longest ${longest} actions`);
}

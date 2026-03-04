const { BaseEnvironment } = require("./Environment");
const { create: createRng } = require("../rng/SeededRNG");

const DEFAULT_OPTS = {
  rounds: 9,
  invalidMoveMode: "forfeit",
  winReward: 1,
  drawReward: 0,
  lossPenalty: -1,
  invalidMovePenalty: -1,
  randomizeStart: true,
};

const SYMBOLS = ["X", "O", "A", "B", "C", "D", "E", "F", "G"];
const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function asNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function asOptionalPositiveInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const floored = Math.floor(num);
  return floored > 0 ? floored : null;
}

function normalizeOpts(opts = {}) {
  const merged = { ...DEFAULT_OPTS, ...(opts || {}) };
  merged.rounds = Math.max(
    1,
    Math.min(9, Math.floor(asNumber(merged.rounds, 9))),
  );
  merged.invalidMoveMode =
    merged.invalidMoveMode === "skip" ? "skip" : "forfeit";
  merged.winReward = asNumber(merged.winReward, 1);
  merged.drawReward = asNumber(merged.drawReward, 0);
  merged.lossPenalty = asNumber(merged.lossPenalty, -1);
  merged.invalidMovePenalty = asNumber(merged.invalidMovePenalty, -1);
  merged.randomizeStart = merged.randomizeStart !== false;
  return merged;
}

function uniqueIds(ids = []) {
  return Array.from(
    new Set((ids || []).filter((id) => typeof id === "string" && id)),
  );
}

function deriveSeed(evaluationId, seed, suffix) {
  return createRng(`${evaluationId}:${seed}`).derive(String(suffix)).seed;
}

function shuffleInPlace(values, seedStr) {
  const rng = createRng(String(seedStr));
  return rng.shuffleInPlace(values);
}

function buildBalancedTicTacToePools(config = {}) {
  if (!Array.isArray(config.agents) || config.agents.length < 2) {
    throw new Error("TicTacToe requires at least 2 agents");
  }

  const evaluationId = String(config.evaluationId);
  const seed = String(config.seed);
  const envOpts =
    config.envOpts && typeof config.envOpts === "object" ? config.envOpts : {};

  const pairingMode =
    typeof envOpts.pairingMode === "string" && envOpts.pairingMode.trim()
      ? envOpts.pairingMode.trim()
      : "round_robin_balanced";
  if (pairingMode !== "round_robin_balanced") {
    throw new Error(
      "TicTacToe supports envOpts.pairingMode='round_robin_balanced' only",
    );
  }

  const startPlayerPolicy =
    envOpts.startPlayerPolicy === "random_seeded"
      ? "random_seeded"
      : "alternate";

  const gamesPerPair = Math.max(
    1,
    Math.floor(Number(envOpts.gamesPerPair) || 1),
  );

  const maxGames = asOptionalPositiveInt(envOpts.maxGames);

  const agents = config.agents.map((agent) => ({ ...agent }));
  const pairs = [];
  for (let i = 0; i < agents.length; i += 1) {
    for (let j = i + 1; j < agents.length; j += 1) {
      pairs.push([agents[i], agents[j]]);
    }
  }

  if (!pairs.length) {
    throw new Error("TicTacToe balanced scheduler produced no pairs");
  }

  shuffleInPlace(pairs, `${evaluationId}:${seed}:ttt:pairs`);

  const games = [];
  for (let cycle = 0; cycle < gamesPerPair; cycle += 1) {
    for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
      const [first, second] = pairs[pairIndex];
      const shouldSwap =
        startPlayerPolicy === "alternate" && (cycle + pairIndex) % 2 === 1;
      games.push({
        agents: shouldSwap ? [second, first] : [first, second],
      });
    }
  }

  shuffleInPlace(games, `${evaluationId}:${seed}:ttt:games`);

  const selectedGames = maxGames ? games.slice(0, maxGames) : games;
  const pools = selectedGames.map((game, index) => ({
    poolId: `${evaluationId}:pool:${index}`,
    agents: game.agents,
    seed: deriveSeed(evaluationId, seed, `ttt:game:${index}`),
    envOpts: {
      randomizeStart: startPlayerPolicy === "random_seeded",
    },
  }));

  return {
    pools,
    episodesPerPool: 1,
  };
}

class TicTacToe extends BaseEnvironment {
  constructor(seed, opts = {}) {
    super(seed, opts);
    this.opts = normalizeOpts(opts);
    this.reset();
  }

  reset() {
    this.round = 0;
    this.board = Array(9).fill(null);
    this.playerOrder = [];
    this.playerSymbolById = {};
    this.playerIdBySymbol = {};
    this.currentPlayerIndex = 0;
    this.done = false;
    this.winnerId = null;
    this.lastMove = null;
    return {};
  }

  _ensurePlayers(actions = {}) {
    if (this.playerOrder.length) return;
    const ids = uniqueIds(Object.keys(actions || {}));
    this.playerOrder = ids;
    ids.forEach((id, index) => {
      const symbol = SYMBOLS[index] || `P${index + 1}`;
      this.playerSymbolById[id] = symbol;
      this.playerIdBySymbol[symbol] = id;
    });
    if (ids.length && this.opts.randomizeStart) {
      this.currentPlayerIndex = Math.floor(this.rng() * ids.length);
    }
  }

  _legalMoves() {
    const moves = [];
    for (let index = 0; index < this.board.length; index += 1) {
      if (this.board[index] === null) moves.push(index);
    }
    return moves;
  }

  _winnerSymbol() {
    for (const [a, b, c] of WIN_LINES) {
      const sa = this.board[a];
      if (sa && sa === this.board[b] && sa === this.board[c]) {
        return sa;
      }
    }
    return null;
  }

  _isValidMove(index) {
    return (
      Number.isInteger(index) &&
      index >= 0 &&
      index < 9 &&
      this.board[index] === null
    );
  }

  _buildObservations(rewards = {}, info = {}) {
    const legalMoves = this._legalMoves();
    const currentPlayerId =
      this.playerOrder.length && !this.done
        ? this.playerOrder[this.currentPlayerIndex]
        : null;

    const result = {};
    for (const id of this.playerOrder) {
      result[id] = {
        round: this.round,
        board: [...this.board],
        mySymbol: this.playerSymbolById[id] || null,
        currentPlayerId,
        legalMoves,
        isMyTurn: !this.done && currentPlayerId === id,
        lastMove: this.lastMove,
        winnerId: this.winnerId,
        done: this.done,
        myReward: asNumber(rewards[id], 0),
        info,
      };
    }

    return result;
  }

  async step(actions = {}) {
    this._ensurePlayers(actions);

    if (!this.playerOrder.length) {
      return {
        observations: {},
        rewards: {},
        done: true,
        info: { reason: "no_players" },
      };
    }

    const rewards = {};
    this.playerOrder.forEach((id) => {
      rewards[id] = 0;
    });

    if (this.done) {
      return {
        observations: this._buildObservations(rewards, {
          reason: "already_done",
        }),
        rewards,
        done: true,
        info: {
          winnerId: this.winnerId,
          board: [...this.board],
          lastMove: this.lastMove,
        },
      };
    }

    const actorId = this.playerOrder[this.currentPlayerIndex];
    const actorSymbol = this.playerSymbolById[actorId] || "X";
    const requestedMove = Number(actions[actorId]);

    let reason = "move_applied";
    let invalidMoveBy = null;

    if (!this._isValidMove(requestedMove)) {
      rewards[actorId] = this.opts.invalidMovePenalty;
      invalidMoveBy = actorId;

      if (this.opts.invalidMoveMode === "forfeit") {
        this.done = true;
        this.winnerId = this.playerOrder.find((id) => id !== actorId) || null;
        if (this.winnerId) {
          rewards[this.winnerId] = this.opts.winReward;
          for (const id of this.playerOrder) {
            if (id !== this.winnerId && id !== actorId) {
              rewards[id] = this.opts.lossPenalty;
            }
          }
        }
        reason = "invalid_move_forfeit";
      } else {
        this.currentPlayerIndex =
          (this.currentPlayerIndex + 1) % this.playerOrder.length;
        reason = "invalid_move_skipped";
      }
    } else {
      this.board[requestedMove] = actorSymbol;
      this.lastMove = {
        playerId: actorId,
        symbol: actorSymbol,
        index: requestedMove,
      };

      const winnerSymbol = this._winnerSymbol();
      if (winnerSymbol) {
        this.done = true;
        this.winnerId = this.playerIdBySymbol[winnerSymbol] || null;
        if (this.winnerId) {
          for (const id of this.playerOrder) {
            rewards[id] =
              id === this.winnerId
                ? this.opts.winReward
                : this.opts.lossPenalty;
          }
        }
        reason = "win";
      } else if (
        this._legalMoves().length === 0 ||
        this.round + 1 >= this.opts.rounds
      ) {
        this.done = true;
        this.winnerId = null;
        for (const id of this.playerOrder) {
          rewards[id] = this.opts.drawReward;
        }
        reason = "draw";
      } else {
        this.currentPlayerIndex =
          (this.currentPlayerIndex + 1) % this.playerOrder.length;
      }
    }

    this.round += 1;

    const info = {
      reason,
      actorId,
      requestedMove: Number.isFinite(requestedMove) ? requestedMove : null,
      invalidMoveBy,
      winnerId: this.winnerId,
      board: [...this.board],
      legalMoves: this._legalMoves(),
      lastMove: this.lastMove,
    };

    return {
      observations: this._buildObservations(rewards, info),
      rewards,
      done: this.done,
      info,
    };
  }
}
function createTicTacToe(seed, opts) {
  return new TicTacToe(seed, opts);
}

createTicTacToe.buildPools = buildBalancedTicTacToePools;

module.exports = createTicTacToe;

const { BaseEnvironment } = require("./Environment");
const SiLog = require("../../utils/SiLog");

const DEFAULT_OPTS = {
  rounds: 1,
  minItemValue: 10,
  maxItemValue: 100,
  auctionType: "second",
  reserve: 0,
  defaultBudget: Infinity,
  driftStep: 2,
  budgetDecay: 0,
  maxConsecutiveWins: 3,
};

function validateNumber(name, value, { min = -Infinity, max = Infinity } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    throw new Error(
      `${name} must be a finite number between ${min} and ${max}`,
    );
  }
  return num;
}

function normalizeOpts(opts) {
  const merged = Object.assign({}, DEFAULT_OPTS, opts);
  merged.rounds = Math.max(
    1,
    Math.floor(normalizeNumber("rounds", merged.rounds)),
  );
  merged.minItemValue = normalizeNumber("minItemValue", merged.minItemValue, {
    min: 0,
  });
  merged.maxItemValue = Math.max(
    merged.minItemValue + 1,
    normalizeNumber("maxItemValue", merged.maxItemValue, {
      min: merged.minItemValue + 1,
    }),
  );
  merged.auctionType = merged.auctionType === "first" ? "first" : "second";
  merged.reserve = Math.max(0, normalizeNumber("reserve", merged.reserve));
  merged.defaultBudget = Number.isFinite(Number(merged.defaultBudget))
    ? Number(merged.defaultBudget)
    : Infinity;
  merged.driftStep = Math.max(
    0,
    normalizeNumber("driftStep", merged.driftStep),
  );
  merged.budgetDecay = Math.max(
    0,
    normalizeNumber("budgetDecay", merged.budgetDecay),
  );
  merged.maxConsecutiveWins = Math.max(
    1,
    normalizeNumber("maxConsecutiveWins", merged.maxConsecutiveWins),
  );
  return merged;
}

function normalizeNumber(name, value, range) {
  try {
    return validateNumber(name, value, range);
  } catch (err) {
    SiLog.Error(err.message);
    throw err;
  }
}

class AuctionHouse extends BaseEnvironment {
  constructor(seed, opts = {}) {
    super(seed, opts);
    this.opts = normalizeOpts(opts);
    this.maxRounds = this.opts.rounds;
    this.minItemValue = this.opts.minItemValue;
    this.maxItemValue = this.opts.maxItemValue;
    this.auctionType = this.opts.auctionType;
    this.reserve = this.opts.reserve;
    this.defaultBudget = this.opts.defaultBudget;
    this.driftStep = this.opts.driftStep;
    this.budgetDecay = this.opts.budgetDecay;
    this.maxConsecutiveWins = this.opts.maxConsecutiveWins;
    this.round = 0;
    this._currentItemValue = null;
    this._spent = {};
    this._wins = {};
    this._budgets = {};
    this._bankruptcies = {};
    this._winStreaks = {};
    this._inventoryValue = {};
    SiLog.Message(
      `AuctionHouse initialized (${this.auctionType}-price, rounds=${this.maxRounds}, budget=${this.defaultBudget})`,
    );
  }

  _clampValue(value) {
    return Math.max(this.minItemValue, Math.min(this.maxItemValue, value));
  }

  _sampleBaseValue() {
    const span = this.maxItemValue - this.minItemValue + 1;
    return Math.floor(this.rng() * span) + this.minItemValue;
  }

  _nextValueWithDrift(previous) {
    const delta = Math.floor((this.rng() - 0.5) * 2 * this.driftStep);
    return this._clampValue(previous + delta);
  }

  _ensureAgentState(agentId) {
    if (!(agentId in this._budgets)) {
      this._budgets[agentId] = Number.isFinite(this.defaultBudget)
        ? this.defaultBudget
        : Infinity;
      this._spent[agentId] = 0;
      this._wins[agentId] = 0;
      this._bankruptcies[agentId] = 0;
      this._winStreaks[agentId] = 0;
      this._inventoryValue[agentId] = 0;
    }
  }

  async reset() {
    this.round = 0;
    this._currentItemValue = this._sampleBaseValue();
    this._spent = {};
    this._wins = {};
    this._budgets = {};
    this._bankruptcies = {};
    this._winStreaks = {};
    this._inventoryValue = {};
    return {};
  }

  _normalizeBids(actions) {
    const bids = {};
    for (const [agentId, raw] of Object.entries(actions || {})) {
      this._ensureAgentState(agentId);
      const remainingBudget = this.getRemainingBudget(agentId);
      const requested = Number.isFinite(Number(raw)) ? Number(raw) : 0;
      const clamped = Math.max(0, requested);
      bids[agentId] = Number.isFinite(remainingBudget)
        ? Math.min(clamped, remainingBudget)
        : clamped;
    }
    return bids;
  }

  _determineWinner(sortedEntries) {
    if (!sortedEntries.length) return { winner: null, price: 0 };
    let winnerEntry = null;
    for (const entry of sortedEntries) {
      const [agentId, bid] = entry;
      if (bid < this.reserve || bid <= 0) {
        continue;
      }
      if (this._canWin(agentId)) {
        winnerEntry = entry;
        break;
      }
    }
    if (!winnerEntry) return { winner: null, price: 0 };
    const [winner, winnerBid] = winnerEntry;
    if (this.auctionType === "first") {
      return { winner, price: winnerBid };
    }
    const secondEntry = sortedEntries.find(([agentId]) => agentId !== winner);
    const secondBid = secondEntry ? secondEntry[1] : this.reserve;
    const price = Math.max(this.reserve, secondBid || 0);
    return { winner, price };
  }

  getRemainingBudget(agentId) {
    this._ensureAgentState(agentId);
    const budget = this._budgets[agentId];
    return Number.isFinite(budget) ? Math.max(0, budget) : Infinity;
  }

  _recordWin(agentId, price, itemValue) {
    this._spent[agentId] = (this._spent[agentId] || 0) + price;
    this._wins[agentId] = (this._wins[agentId] || 0) + 1;
    if (Number.isFinite(this._budgets[agentId])) {
      const deduction = Math.max(0, price + this.budgetDecay);
      this._budgets[agentId] = Math.max(0, this._budgets[agentId] - deduction);
      if (this._budgets[agentId] <= 0) {
        this._bankruptcies[agentId] = (this._bankruptcies[agentId] || 0) + 1;
      }
    }
    this._inventoryValue[agentId] =
      (this._inventoryValue[agentId] || 0) +
      (Number.isFinite(Number(itemValue)) ? Number(itemValue) : 0);
    this._winStreaks[agentId] = (this._winStreaks[agentId] || 0) + 1;
    Object.keys(this._winStreaks).forEach((id) => {
      if (id !== agentId) {
        this._winStreaks[id] = 0;
      }
    });
  }

  _canWin(agentId) {
    return (this._winStreaks[agentId] || 0) < this.maxConsecutiveWins;
  }

  _buildObservations(bids, rewards, winner, price) {
    const result = {};
    for (const agentId of Object.keys(bids)) {
      this._ensureAgentState(agentId);
      result[agentId] = {
        round: this.round,
        myBid: bids[agentId],
        myReward: rewards[agentId] || 0,
        mySpend: this._spent[agentId] || 0,
        myWins: this._wins[agentId] || 0,
        remainingBudget: Number.isFinite(this._budgets[agentId])
          ? this._budgets[agentId]
          : null,
        startingBudget: Number.isFinite(this.defaultBudget)
          ? this.defaultBudget
          : null,
        lastWinner: winner,
        lastWinningBid: winner ? price : null,
        itemHint: Math.round((this._currentItemValue || 0) / 10),
      };
    }
    return result;
  }

  _buildInfo(bids, winner, price) {
    return {
      itemValue: this._currentItemValue,
      bids,
      winner,
      price,
      spent: { ...this._spent },
      wins: { ...this._wins },
      budgets: { ...this._budgets },
      bankruptcies: { ...this._bankruptcies },
      inventoryValue: { ...this._inventoryValue },
    };
  }

  async step(actions = {}) {
    this.round += 1;
    this._currentItemValue = this._currentItemValue ?? this._sampleBaseValue();
    const bids = this._normalizeBids(actions);
    const sortedEntries = Object.entries(bids).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0] < b[0] ? -1 : 1;
    });
    const { winner, price } = this._determineWinner(sortedEntries);
    const rewards = {};
    Object.keys(bids).forEach((id) => (rewards[id] = 0));
    if (winner) {
      const itemValue = this._currentItemValue || 0;
      rewards[winner] = itemValue - price;
      this._recordWin(winner, price, itemValue);
    }
    const observations = this._buildObservations(bids, rewards, winner, price);
    const done = this.round >= this.maxRounds;
    const info = this._buildInfo(bids, winner, price);
    if (!done) {
      this._currentItemValue = this._nextValueWithDrift(this._currentItemValue);
    }
    return { observations, rewards, done, info };
  }
}

module.exports = (seed, opts) => new AuctionHouse(seed, opts);

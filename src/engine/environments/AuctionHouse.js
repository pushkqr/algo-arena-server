const { BaseEnvironment } = require("./Environment");

class AuctionHouse extends BaseEnvironment {
  constructor(seed, opts = {}) {
    super(seed, opts);

    // configuration
    this.maxRounds = Number(opts.rounds) || 1;
    this.minItemValue = Number(opts.minItemValue) || 10;
    this.maxItemValue = Number(opts.maxItemValue) || 100;
    this.auctionType = opts.auctionType === "second" ? "second" : "first";
    this.reserve = Number(opts.reserve) || 0;
    this.defaultBudget =
      typeof opts.defaultBudget === "number" ? opts.defaultBudget : Infinity;
    this.driftStep = Number(opts.driftStep) || 2; // max absolute change per round
    this.bankruptcyPenalty = opts.bankruptcyPenalty || null; // optional callback or behavior (not used here)

    // runtime state
    this.round = 0;
    this._currentItemValue = null;
    this._spent = {}; // total spent per agent
    this._wins = {}; // wins per agent
    this._budgets = {}; // remaining budget per agent
    this._bankruptcies = {}; // bankruptcy count per agent (across episode)
  }

  _clampValue(v) {
    return Math.max(this.minItemValue, Math.min(this.maxItemValue, v));
  }

  _sampleInitialValue() {
    const span = this.maxItemValue - this.minItemValue + 1;
    return Math.floor(this.rng() * span) + this.minItemValue;
  }

  _nextValueWithDrift(prev) {
    const delta = Math.floor((this.rng() - 0.5) * 2 * this.driftStep);
    return this._clampValue(prev + delta);
  }

  _ensureAgentState(agentId) {
    if (!(agentId in this._budgets)) {
      this._budgets[agentId] =
        Number.isFinite(Number(this.opts.defaultBudget)) &&
        this.opts.defaultBudget !== Infinity
          ? Number(this.opts.defaultBudget)
          : Infinity;
      this._spent[agentId] = 0;
      this._wins[agentId] = 0;
      this._bankruptcies[agentId] = 0;
    }
  }

  async reset() {
    this.round = 0;
    this._currentItemValue = this._sampleInitialValue();
    this._spent = {};
    this._wins = {};
    this._budgets = {};
    this._bankruptcies = {};
    // env.reset cannot know agent ids ahead of first step; return empty initial observations.
    return {};
  }

  async step(actions = {}) {
    this.round += 1;
    const itemValue = this._currentItemValue ?? this._sampleInitialValue();

    // normalize bids and enforce budget (bids > remaining budget are clamped)
    const bids = {};
    for (const [id, raw] of Object.entries(actions)) {
      this._ensureAgentState(id);
      // if bankrupt (budget <= 0) they cannot bid
      const remaining = Number.isFinite(Number(this._budgets[id]))
        ? Math.max(0, this._budgets[id])
        : Infinity;
      const requested = typeof raw === "number" && isFinite(raw) ? raw : 0;
      const bid = Math.max(0, requested);
      bids[id] = Number.isFinite(remaining) ? Math.min(bid, remaining) : bid;
    }

    const entries = Object.entries(bids);
    entries.sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0] < b[0] ? -1 : 1;
    });

    let winner = null;
    let price = 0;
    if (entries.length > 0) {
      const topBid = entries[0][1];
      if (topBid >= this.reserve && topBid > 0) {
        winner = entries[0][0];
        if (this.auctionType === "first") {
          price = topBid;
        } else {
          const second = entries[1] ? entries[1][1] : this.reserve;
          price = Math.max(this.reserve, second || 0);
        }
      }
    }

    // compute rewards: only winner gets payoff = itemValue - price
    const rewards = {};
    for (const id of Object.keys(bids)) rewards[id] = 0;
    if (winner) {
      const payoff = itemValue - price;
      rewards[winner] = payoff;
      this._spent[winner] = (this._spent[winner] || 0) + price;
      this._wins[winner] = (this._wins[winner] || 0) + 1;

      // deduct price from remaining budget
      if (Number.isFinite(Number(this._budgets[winner]))) {
        this._budgets[winner] = Math.max(
          0,
          (this._budgets[winner] || 0) - price,
        );
        if (this._budgets[winner] <= 0) {
          this._bankruptcies[winner] = (this._bankruptcies[winner] || 0) + 1;
        }
      }
    }

    // observations: do NOT reveal true itemValue or other agents' rewards.
    // Strategies see their own bid and payoff, a coarse hint, and their remaining budget.
    const observations = {};
    for (const id of Object.keys(bids)) {
      this._ensureAgentState(id);
      observations[id] = {
        round: this.round,
        myBid: bids[id],
        myReward: rewards[id],
        remainingBudget: Number.isFinite(Number(this._budgets[id]))
          ? this._budgets[id]
          : null,
        startingBudget:
          Number.isFinite(Number(this.opts.defaultBudget)) &&
          this.opts.defaultBudget !== Infinity
            ? this.opts.defaultBudget
            : null,
        lastWinner: winner,
        lastWinningBid: winner ? price : null,
        itemHint: Math.round(itemValue / 10), // coarse public hint only
        mySpend: this._spent[id] || 0,
        myWins: this._wins[id] || 0,
      };
    }

    const done = this.round >= this.maxRounds;
    const info = {
      itemValue, // debug-only
      bids,
      winner,
      price,
      spent: { ...this._spent },
      wins: { ...this._wins },
      budgets: { ...this._budgets },
      bankruptcies: { ...this._bankruptcies },
    };

    if (!done) {
      this._currentItemValue = this._nextValueWithDrift(itemValue);
    }

    return { observations, rewards, done, info };
  }
}

module.exports = (seed, opts) => new AuctionHouse(seed, opts);

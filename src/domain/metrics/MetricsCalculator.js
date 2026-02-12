const ss = require("simple-statistics");

const MetricsCalculator = {
  fromEpisodes(episodes = [], opts = {}) {
    const p = opts.downsidePercentile ?? 5;
    const buckets = {}; // id -> { returns: [], finalWealths: [], rois: [], spents: [], remaining: [], fails: 0, totalReturn: 0 }

    for (const ep of episodes || []) {
      const ars = ep.agentResults || [];
      for (const ar of ars) {
        const id = ar.id;
        if (!buckets[id])
          buckets[id] = {
            returns: [],
            finalWealths: [],
            rois: [],
            spents: [],
            remaining: [],
            wins: [],
            fails: 0,
            totalReturn: 0,
          };

        if (ar.failed) {
          buckets[id].fails += 1;
          continue;
        }

        // main return / payoff (keep legacy 'value' handling)
        const ret =
          "return" in ar
            ? Number(ar.return || 0)
            : "value" in ar
              ? Number(ar.value || 0)
              : Number(ar.payoff || 0);

        buckets[id].returns.push(ret);
        buckets[id].totalReturn += ret;

        // budget / wealth fields (optional)
        const starting = Number.isFinite(Number(ar.startingBudget))
          ? Number(ar.startingBudget)
          : null;
        const finalWealth = Number.isFinite(Number(ar.finalWealth))
          ? Number(ar.finalWealth)
          : null;
        const spent = Number.isFinite(Number(ar.spent))
          ? Number(ar.spent)
          : null;
        const remaining = Number.isFinite(Number(ar.remainingBudget))
          ? Number(ar.remainingBudget)
          : null;
        const wins = Number.isFinite(Number(ar.wins)) ? Number(ar.wins) : null;

        if (finalWealth !== null) buckets[id].finalWealths.push(finalWealth);
        if (spent !== null) buckets[id].spents.push(spent);
        if (remaining !== null) buckets[id].remaining.push(remaining);
        if (wins !== null) buckets[id].wins.push(wins);

        // ROI: only when starting budget and finalWealth available and starting > 0
        if (starting !== null && starting > 0 && finalWealth !== null) {
          buckets[id].rois.push(finalWealth / starting - 1);
        }
      }
    }

    const out = {};
    for (const [id, b] of Object.entries(buckets)) {
      const values = b.returns || [];
      const n = values.length;

      const mean = n > 0 ? ss.mean(values) : 0;
      const variance = n > 1 ? ss.variance(values) : 0;
      const stdDev = n > 1 ? ss.standardDeviation(values) : 0;

      const sorted = values.length ? values.slice().sort((a, b) => a - b) : [];
      const downside = sorted.length ? ss.quantileSorted(sorted, p / 100) : 0;

      const totalEpisodes = n + b.fails;
      const failRate = totalEpisodes > 0 ? b.fails / totalEpisodes : 0;

      // budget/wealth aggregates
      const totalFinalWealth =
        b.finalWealths && b.finalWealths.length
          ? b.finalWealths.reduce((s, v) => s + v, 0)
          : 0;
      const avgFinalWealth =
        b.finalWealths && b.finalWealths.length ? ss.mean(b.finalWealths) : 0;

      const totalSpent =
        b.spents && b.spents.length ? b.spents.reduce((s, v) => s + v, 0) : 0;
      const avgSpent = b.spents && b.spents.length ? ss.mean(b.spents) : 0;

      const avgRemaining =
        b.remaining && b.remaining.length ? ss.mean(b.remaining) : 0;

      const avgROI = b.rois && b.rois.length ? ss.mean(b.rois) : 0;
      const roiVariance = b.rois && b.rois.length > 1 ? ss.variance(b.rois) : 0;

      const bankruptcies =
        b.remaining && b.remaining.length
          ? b.remaining.filter((r) => r <= 0).length
          : 0;

      out[id] = {
        // legacy fields
        totalReturn: b.totalReturn,
        episodesCounted: n,
        failures: b.fails,
        averageReturn: mean,
        variance,
        stdDev,
        downside,
        failRate,

        // new budget/wealth fields (zero when not available)
        totalFinalWealth,
        averageFinalWealth: avgFinalWealth,
        totalSpent,
        averageSpent: avgSpent,
        averageRemainingBudget: avgRemaining,
        averageROI: avgROI,
        roiVariance,
        bankruptcies,
      };
    }

    return out;
  },

  fromAgentMap(agentsMap = {}, failuresMap = {}, opts = {}) {
    const episodes = [];
    for (const [id, vals] of Object.entries(agentsMap)) {
      for (const v of vals)
        episodes.push({ agentResults: [{ id, value: v, failed: false }] });
      const fails = failuresMap[id] || 0;
      for (let i = 0; i < fails; i++)
        episodes.push({ agentResults: [{ id, value: null, failed: true }] });
    }
    return this.fromEpisodes(episodes, opts);
  },
};

module.exports = MetricsCalculator;

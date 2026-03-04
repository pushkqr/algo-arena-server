const defaultOpts = {
  primary: "averageReturn", // can be "averageReturn", "averageFinalWealth", "averageROI", or customScore
  tieBreakers: ["variance", "downside"],
  // sort directions: true = descending (higher is better), false = ascending (lower is better)
  directions: {
    averageReturn: true,
    variance: false,
    downside: true,
    averageFinalWealth: true,
    totalFinalWealth: true,
    averageROI: true,
    averageRemainingBudget: true,
    bankruptcies: false,
  },
};

function safeVal(obj, key) {
  const v = obj && obj[key];
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function areEquivalentForRanking(A, B, cfg, criteria) {
  if (!A || !B) return false;

  if (typeof cfg.customScore === "function") {
    const sa = Number(cfg.customScore(A.metric));
    const sb = Number(cfg.customScore(B.metric));
    if (sa !== sb) return false;
  }

  for (const key of criteria) {
    const av = safeVal(A.metric, key);
    const bv = safeVal(B.metric, key);
    if (av !== bv) return false;
  }

  const fa = safeVal(A.metric, "failures");
  const fb = safeVal(B.metric, "failures");
  return fa === fb;
}

const RankingsService = {
  rank(metrics = {}, opts = {}) {
    const cfg = Object.assign({}, defaultOpts, opts);
    const primary = cfg.primary || defaultOpts.primary;
    const criteria = [primary, ...(cfg.tieBreakers || [])];
    const directions = Object.assign(
      {},
      defaultOpts.directions,
      cfg.directions,
    );

    const entries = Object.keys(metrics).map((id, idx) => ({
      id,
      metric: metrics[id] || {},
      idx,
    }));

    entries.sort((A, B) => {
      // customScore has highest priority (if provided)
      if (typeof cfg.customScore === "function") {
        const sa = cfg.customScore(A.metric);
        const sb = cfg.customScore(B.metric);
        if (sa !== sb) return sb - sa;
      }

      // compare by criteria in order
      for (const key of criteria) {
        const av = safeVal(A.metric, key);
        const bv = safeVal(B.metric, key);
        if (av === bv) continue;
        const desc = !!directions[key];
        return desc ? bv - av : av - bv;
      }

      // fewer failures is better
      const fa = safeVal(A.metric, "failures");
      const fb = safeVal(B.metric, "failures");
      if (fa !== fb) return fa < fb ? -1 : 1;

      // stable tie-breaker by original index
      return A.idx - B.idx;
    });

    let previousEntry = null;
    let previousRank = 0;

    return entries.map((e, i) => {
      let assignedRank = i + 1;
      if (
        previousEntry &&
        areEquivalentForRanking(e, previousEntry, cfg, criteria)
      ) {
        assignedRank = previousRank;
      }

      previousEntry = e;
      previousRank = assignedRank;

      const m = e.metric || {};
      return {
        rank: assignedRank,
        agentId: e.id,
        // legacy fields
        totalReturn: safeVal(m, "totalReturn"),
        episodesCounted: safeVal(m, "episodesCounted"),
        averageReturn: safeVal(m, "averageReturn"),
        variance: safeVal(m, "variance"),
        downside: safeVal(m, "downside"),
        failures: safeVal(m, "failures"),
        failRate: safeVal(m, "failRate"),
        // budget/wealth fields
        totalFinalWealth: safeVal(m, "totalFinalWealth"),
        averageFinalWealth: safeVal(m, "averageFinalWealth"),
        totalSpent: safeVal(m, "totalSpent"),
        averageSpent: safeVal(m, "averageSpent"),
        averageRemainingBudget: safeVal(m, "averageRemainingBudget"),
        averageROI: safeVal(m, "averageROI"),
        roiVariance: safeVal(m, "roiVariance"),
        bankruptcies: safeVal(m, "bankruptcies"),
      };
    });
  },
};

module.exports = RankingsService;

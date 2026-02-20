const StrategyModel = require("../../persistence/models/Strategy.model");
const DB = require("../../utils/DB");
const {
  normalizeEnvName,
  normalizeStringArray,
  stringifyId,
} = require("./evaluation.helpers");

async function resolveAgentsFromStrategies(options = {}) {
  const resolvedEnvName = normalizeEnvName(options.envName);
  const filter = {
    envName: resolvedEnvName,
    $or: [{ isActive: true }, { isActive: { $exists: false }, status: true }],
  };

  const strategyIds = normalizeStringArray(options.strategyIds);
  if (strategyIds.length) {
    filter.strategyId = { $in: strategyIds };
  }

  const ownerIds = normalizeStringArray(options.ownerIds);
  if (ownerIds.length) {
    filter.ownerId = { $in: ownerIds };
  }

  await DB.connect();
  const strategies = await StrategyModel.find(filter).lean();
  if (strategies && strategies.length) {
    return strategies
      .filter(
        (strategy) =>
          (strategy.source && String(strategy.source).trim() !== "") ||
          (strategy.path && String(strategy.path).trim() !== ""),
      )
      .map((strategy) => {
        const fallbackId = stringifyId(strategy._id);
        return {
          id: strategy.strategyId || strategy.name || fallbackId,
          name: strategy.name || undefined,
          source:
            strategy.source && String(strategy.source).trim() !== ""
              ? strategy.source
              : undefined,
          path:
            strategy.path && String(strategy.path).trim() !== ""
              ? strategy.path
              : undefined,
          ownerId: strategy.ownerId || null,
          metadata: strategy.metadata || {},
        };
      });
  }

  return loadFromStrategyCollection({
    ...options,
    envName: resolvedEnvName,
  });
}

async function loadFromStrategyCollection(options = {}) {
  try {
    const stratColl = DB.mongoose.connection.collection("strategies");
    const query = {};
    const requestedEnvName = normalizeEnvName(options.envName);
    const finalOwnerIds = normalizeStringArray(options.ownerIds);
    if (finalOwnerIds.length) {
      query.uid = { $in: finalOwnerIds };
    }

    const docs = await stratColl.find(query).toArray();
    const items = [];
    for (const doc of docs || []) {
      const ownerId = doc.uid || stringifyId(doc._id) || null;
      const strategyList = Array.isArray(doc.strategies) ? doc.strategies : [];

      for (const strategy of strategyList) {
        if (!strategy) continue;

        const active =
          strategy.isActive === true ||
          (strategy.isActive === undefined && strategy.status === true);
        if (!active) continue;

        const strategyEnv = normalizeEnvName(strategy.envName);
        if (requestedEnvName && strategyEnv !== requestedEnvName) continue;

        const hasCode =
          (strategy.source && String(strategy.source).trim() !== "") ||
          (strategy.path && String(strategy.path).trim() !== "");
        if (!hasCode) continue;

        items.push({
          id:
            strategy.strategyId ||
            strategy.id ||
            strategy.name ||
            `user-strat-${ownerId}`,
          name: strategy.name || undefined,
          source: strategy.source || undefined,
          path: strategy.path || undefined,
          ownerId,
          metadata: strategy.metadata || {},
        });
      }
    }

    return items;
  } catch (err) {
    console.error("strategy collection lookup failed", err);
    return [];
  }
}

module.exports = {
  resolveAgentsFromStrategies,
};

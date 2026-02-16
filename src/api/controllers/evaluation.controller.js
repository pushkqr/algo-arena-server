const { randomUUID } = require("crypto");
const evaluationEngine = require("../evaluationEngine");
const StrategyModel = require("../../persistence/models/Strategy.model");
const EvaluationModel = require("../../persistence/models/Evaluation.model");
const DB = require("../../utils/DB");

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 200;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEnvOpts(opts) {
  if (opts && typeof opts === "object" && !Array.isArray(opts)) {
    return opts;
  }
  return {};
}

function normalizeEnvName(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "AuctionHouse";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : `${item}`))
    .filter((item) => item);
}

function stringifyId(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.toString === "function") return value.toString();
  return "";
}

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

  return await loadFromStrategyCollection({
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
      const array = Array.isArray(doc.strategies) ? doc.strategies : [];
      for (const strat of array) {
        if (!strat) continue;
        const active =
          strat.isActive === true ||
          (strat.isActive === undefined && strat.status === true);
        if (!active) continue;
        const strategyEnv = normalizeEnvName(strat.envName);
        if (requestedEnvName && strategyEnv !== requestedEnvName) continue;
        const hasCode =
          (strat.source && String(strat.source).trim() !== "") ||
          (strat.path && String(strat.path).trim() !== "");
        if (!hasCode) continue;
        items.push({
          id:
            strat.strategyId ||
            strat.id ||
            strat.name ||
            `user-strat-${ownerId}`,
          name: strat.name || undefined,
          source: strat.source || undefined,
          path: strat.path || undefined,
          ownerId,
          metadata: strat.metadata || {},
        });
      }
    }
    return items;
  } catch (err) {
    console.error("strategy collection lookup failed", err);
    return [];
  }
}

function buildQueuedRecord(body, evaluationId, userId, agents = [], seedValue) {
  const envName = normalizeEnvName(body.envName);
  return {
    evaluationId,
    userId,
    status: "queued",
    seed:
      seedValue !== undefined
        ? String(seedValue)
        : body.seed !== undefined
          ? String(body.seed)
          : "",
    rounds: toNumber(body.rounds, 0),
    poolSize: toNumber(body.poolSize, 0),
    poolCount: toNumber(body.poolCount, 0),
    episodesPerPool: toNumber(body.episodesPerPool, 0),
    envName,
    envOpts: normalizeEnvOpts(body.envOpts),
    agents,
    metrics: {},
    ranking: [],
    error: "",
    startedAt: null,
    completedAt: null,
  };
}

async function saveQueuedRecord(record) {
  await DB.connect();
  return EvaluationModel.findOneAndUpdate(
    { evaluationId: record.evaluationId },
    { $set: record },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    },
  );
}

async function startEvaluation(req, res) {
  try {
    const body = req.body || {};
    const envName = normalizeEnvName(req.query.envName || body.envName);
    const requestPayload = {
      ...body,
      envName,
    };
    const evaluationId = String(body.evaluationId || randomUUID());
    const resolvedSeed =
      body.seed !== undefined ? String(body.seed) : String(Date.now());
    let agents =
      Array.isArray(body.agents) && body.agents.length ? body.agents : null;
    if (!agents) {
      agents = await resolveAgentsFromStrategies(requestPayload);
    }
    if (!agents || !agents.length) {
      return res.status(400).json({ error: "no active strategies available" });
    }
    const config = {
      ...requestPayload,
      evaluationId,
      userId: req.userId,
      agents,
      seed: resolvedSeed,
      shuffle: body.shuffle !== undefined ? !!body.shuffle : true,
    };
    const queuedRecord = buildQueuedRecord(
      requestPayload,
      evaluationId,
      req.userId,
      agents,
      resolvedSeed,
    );

    await saveQueuedRecord(queuedRecord);

    // const { promise } = evaluationEngine.startEvaluation(config);
    // const result = await promise;
    // console.log("metrics", JSON.stringify(result.metrics, null, 2));

    const queued = evaluationEngine.startEvaluation(config);
    if (queued && queued.promise) {
      queued.promise.catch((err) => {
        console.error("evaluation engine failure", evaluationId, err);
      });
    }

    return res
      .status(202)
      .set("Location", `/api/evaluations/${evaluationId}`)
      .json({ evaluationId, status: "queued" });
  } catch (err) {
    console.error("failed to start evaluation", err);
    return res
      .status(500)
      .json({ error: "unable to queue evaluation", details: err?.message });
  }
}

async function listEvaluations(req, res) {
  try {
    const status =
      typeof req.query.status === "string" ? req.query.status : null;
    const requestedLimit = parseInt(req.query.limit, 10);
    const requestedSkip = parseInt(req.query.skip, 10);
    const limit = Math.min(
      MAX_LIST_LIMIT,
      Math.max(
        1,
        Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_LIST_LIMIT,
      ),
    );
    const skip = Math.max(
      0,
      Number.isFinite(requestedSkip) ? requestedSkip : 0,
    );

    await DB.connect();
    const filter = { userId: req.userId };
    if (status) {
      filter.status = status;
    }

    const [evaluations, total] = await Promise.all([
      EvaluationModel.find(filter)
        .sort({ startedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EvaluationModel.countDocuments(filter),
    ]);

    return res.json({
      meta: { limit, skip, status: filter.status || null, total },
      evaluations,
    });
  } catch (err) {
    console.error("failed to list evaluations", err);
    return res
      .status(500)
      .json({ error: "unable to list evaluations", details: err?.message });
  }
}

async function getEvaluation(req, res) {
  try {
    const evaluationId = req.params.evaluationId;
    if (!evaluationId) {
      return res.status(400).json({ error: "evaluationId required" });
    }

    await DB.connect();
    const evaluation = await EvaluationModel.findOne({
      evaluationId,
      userId: req.userId,
    }).lean();

    if (!evaluation) {
      return res.status(404).json({ error: "evaluation not found" });
    }

    return res.json(evaluation);
  } catch (err) {
    console.error("failed to fetch evaluation", err);
    return res
      .status(500)
      .json({ error: "unable to load evaluation", details: err?.message });
  }
}

module.exports = {
  startEvaluation,
  listEvaluations,
  getEvaluation,
};

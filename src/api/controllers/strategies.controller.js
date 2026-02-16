const { randomUUID } = require("crypto");
const StrategyModel = require("../../persistence/models/Strategy.model");
const DB = require("../../utils/DB");

function normalizeEnvName(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return "AuctionHouse";
}

function normalizeStrategyPayload(body) {
  const payload = {};
  if (typeof body.envName === "string") payload.envName = body.envName.trim();
  if (typeof body.name === "string") payload.name = body.name;
  if (typeof body.source === "string") payload.source = body.source;
  if (typeof body.path === "string") payload.path = body.path;
  if (typeof body.metadata === "object" && body.metadata !== null)
    payload.metadata = body.metadata;
  if (typeof body.status === "boolean") payload.status = body.status;
  if (typeof body.isActive === "boolean") payload.isActive = body.isActive;
  if (typeof body.status === "boolean" && typeof body.isActive !== "boolean") {
    payload.isActive = body.status;
  }
  if (typeof body.isActive === "boolean" && typeof body.status !== "boolean") {
    payload.status = body.isActive;
  }
  return payload;
}

async function enforceSingleActive(ownerId, envName, activeStrategyId) {
  if (!activeStrategyId) return;
  await StrategyModel.updateMany(
    {
      ownerId,
      envName,
      strategyId: { $ne: activeStrategyId },
      $or: [{ isActive: true }, { status: true }],
    },
    {
      $set: {
        isActive: false,
        status: false,
      },
    },
  );
}

async function listStrategies(req, res) {
  await DB.connect();
  const { active } = req.query;
  const envName =
    typeof req.query.envName === "string" && req.query.envName.trim()
      ? req.query.envName.trim()
      : null;
  const filter = { ownerId: req.userId };
  if (envName) filter.envName = envName;
  if (active !== undefined) {
    const activeFlag =
      active === "true" ? true : active === "false" ? false : undefined;
    if (activeFlag !== undefined) {
      if (activeFlag) {
        filter.$or = [
          { isActive: true },
          { isActive: { $exists: false }, status: true },
        ];
      } else {
        filter.$or = [
          { isActive: false },
          { isActive: { $exists: false }, status: false },
        ];
      }
    }
  }
  const strategies = await StrategyModel.find(filter).lean();
  res.json({ strategies });
}

async function getStrategy(req, res) {
  await DB.connect();
  const { strategyId } = req.params;
  const strategy = await StrategyModel.findOne({
    strategyId,
    ownerId: req.userId,
  }).lean();
  if (!strategy) {
    return res.status(404).json({ error: "strategy not found" });
  }
  return res.json(strategy);
}

async function createStrategy(req, res) {
  await DB.connect();
  const strategyId = req.body.strategyId || randomUUID();
  const payload = normalizeStrategyPayload(req.body);
  const envName = normalizeEnvName(payload.envName || req.body.envName);
  const isActive = payload.isActive === true || payload.status === true;
  const strategy = new StrategyModel({
    strategyId,
    ownerId: req.userId,
    envName,
    ...payload,
    isActive,
    status: isActive,
  });
  if (isActive) {
    await enforceSingleActive(req.userId, envName, strategyId);
  }
  try {
    await strategy.save();
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({
        error: "active strategy already exists for this environment",
      });
    }
    throw err;
  }
  return res.status(201).json(strategy);
}

async function updateStrategy(req, res) {
  await DB.connect();
  const { strategyId } = req.params;
  const payload = normalizeStrategyPayload(req.body);
  const current = await StrategyModel.findOne({
    strategyId,
    ownerId: req.userId,
  }).lean();
  if (!current) {
    return res.status(404).json({ error: "strategy not found" });
  }

  const envName = normalizeEnvName(payload.envName || current.envName);
  if (payload.isActive === true || payload.status === true) {
    payload.isActive = true;
    payload.status = true;
    await enforceSingleActive(req.userId, envName, strategyId);
  } else if (payload.isActive === false || payload.status === false) {
    payload.isActive = false;
    payload.status = false;
  }

  let strategy;
  try {
    strategy = await StrategyModel.findOneAndUpdate(
      { strategyId, ownerId: req.userId },
      { $set: { ...payload, envName } },
      { new: true },
    ).lean();
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({
        error: "active strategy already exists for this environment",
      });
    }
    throw err;
  }
  if (!strategy) {
    return res.status(404).json({ error: "strategy not found" });
  }
  return res.json(strategy);
}

async function deleteStrategy(req, res) {
  await DB.connect();
  const { strategyId } = req.params;
  const result = await StrategyModel.deleteOne({
    strategyId,
    ownerId: req.userId,
  });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: "strategy not found" });
  }
  return res.status(204).end();
}

module.exports = {
  listStrategies,
  getStrategy,
  createStrategy,
  updateStrategy,
  deleteStrategy,
};

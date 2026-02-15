const { randomUUID } = require("crypto");
const StrategyModel = require("../../persistence/models/Strategy.model");

function normalizeStrategyPayload(body) {
  const payload = {};
  if (typeof body.name === "string") payload.name = body.name;
  if (typeof body.source === "string") payload.source = body.source;
  if (typeof body.path === "string") payload.path = body.path;
  if (typeof body.metadata === "object" && body.metadata !== null)
    payload.metadata = body.metadata;
  if (typeof body.status === "boolean") payload.status = body.status;
  return payload;
}

async function listStrategies(req, res) {
  const { active } = req.query;
  const filter = { ownerId: req.userId };
  if (active !== undefined) {
    filter.status =
      active === "true" ? true : active === "false" ? false : undefined;
    if (filter.status === undefined) delete filter.status;
  }
  const strategies = await StrategyModel.find(filter).lean();
  res.json({ strategies });
}

async function getStrategy(req, res) {
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
  const strategyId = req.body.strategyId || randomUUID();
  const payload = normalizeStrategyPayload(req.body);
  const strategy = new StrategyModel({
    strategyId,
    ownerId: req.userId,
    ...payload,
  });
  await strategy.save();
  return res.status(201).json(strategy);
}

async function updateStrategy(req, res) {
  const { strategyId } = req.params;
  const payload = normalizeStrategyPayload(req.body);
  const strategy = await StrategyModel.findOneAndUpdate(
    { strategyId, ownerId: req.userId },
    { $set: payload },
    { new: true },
  ).lean();
  if (!strategy) {
    return res.status(404).json({ error: "strategy not found" });
  }
  return res.json(strategy);
}

async function deleteStrategy(req, res) {
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

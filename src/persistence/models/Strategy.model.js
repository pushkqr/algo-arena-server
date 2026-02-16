const mongoose = require("mongoose");

const StrategySchema = new mongoose.Schema(
  {
    strategyId: { type: String, required: true },
    envName: { type: String, required: true, default: "AuctionHouse" },
    name: { type: String, default: "" },
    source: { type: String, default: "" },
    path: { type: String, default: "" },
    ownerId: { type: String, default: "" },
    status: { type: Boolean, default: false },
    isActive: { type: Boolean, default: false },
    metadata: { type: Object, default: {} },
  },
  {
    timestamps: true,
  },
);

StrategySchema.index({ ownerId: 1, envName: 1, status: 1 });
StrategySchema.index({ ownerId: 1, envName: 1, isActive: 1 });
StrategySchema.index(
  { ownerId: 1, envName: 1, strategyId: 1 },
  {
    unique: true,
  },
);
StrategySchema.index(
  { ownerId: 1, envName: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
  },
);

module.exports = mongoose.model("Strategy", StrategySchema);

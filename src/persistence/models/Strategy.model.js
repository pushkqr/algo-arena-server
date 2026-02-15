const mongoose = require("mongoose");

const StrategySchema = new mongoose.Schema(
  {
    strategyId: { type: String, required: true, unique: true },
    name: { type: String, default: "" },
    source: { type: String, default: "" },
    path: { type: String, default: "" },
    ownerId: { type: String, default: "" },
    status: { type: Boolean, default: false },
    metadata: { type: Object, default: {} },
  },
  {
    timestamps: true,
  },
);

StrategySchema.index({ ownerId: 1, status: 1 });

module.exports = mongoose.model("Strategy", StrategySchema);

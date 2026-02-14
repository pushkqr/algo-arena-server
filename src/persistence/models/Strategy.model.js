const mongoose = require("mongoose");

const StrategySchema = new mongoose.Schema(
  {
    strategyId: { type: String, required: true, unique: true },
    name: { type: String, default: "" },
    source: { type: String, default: "" },
    path: { type: String, default: "" },
    metadata: { type: Object, default: {} },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Strategy", StrategySchema);

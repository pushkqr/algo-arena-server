const mongoose = require("mongoose");

const ResultSchema = new mongoose.Schema(
  {
    evaluationId: { type: String, required: true, index: true },
    agentId: { type: String, required: true },
    episodeIndex: { type: Number, default: 0 },
    poolId: { type: String, default: "" },
    seed: { type: String, default: "" },
    return: { type: Number, default: 0 },
    finalWealth: { type: Number, default: 0 },
    remainingBudget: { type: Number, default: 0 },
    spent: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    inventoryValue: { type: Number, default: 0 },
    metrics: { type: Object, default: {} },
  },
  {
    timestamps: true,
  },
);

ResultSchema.index({ evaluationId: 1, agentId: 1 });

module.exports = mongoose.model("Result", ResultSchema);

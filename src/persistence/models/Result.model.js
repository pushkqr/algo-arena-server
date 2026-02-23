const mongoose = require("mongoose");

const ResultSchema = new mongoose.Schema(
  {
    evaluationId: { type: String, required: true, index: true },
    envName: { type: String, default: "" },
    seed: { type: String, default: "" },
    agentId: { type: String, required: true },
    userId: { type: String, index: true },
    agentOwnerId: { type: String, index: true },
    rank: { type: Number, default: 0 },
    totalReturn: { type: Number, default: 0 },
    episodesCounted: { type: Number, default: 0 },
    averageReturn: { type: Number, default: 0 },
    variance: { type: Number, default: 0 },
    downside: { type: Number, default: 0 },
    failures: { type: Number, default: 0 },
    failRate: { type: Number, default: 0 },
    totalFinalWealth: { type: Number, default: 0 },
    averageFinalWealth: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    averageSpent: { type: Number, default: 0 },
    averageRemainingBudget: { type: Number, default: 0 },
    averageROI: { type: Number, default: 0 },
    roiVariance: { type: Number, default: 0 },
    bankruptcies: { type: Number, default: 0 },
    metrics: { type: Object, default: {} },
  },
  {
    timestamps: true,
  },
);

ResultSchema.index({ evaluationId: 1, agentId: 1 }, { unique: true });
ResultSchema.index({ evaluationId: 1, rank: 1 });
ResultSchema.index({ evaluationId: 1, rank: 1, agentId: 1 });

module.exports = mongoose.model("Result", ResultSchema);
